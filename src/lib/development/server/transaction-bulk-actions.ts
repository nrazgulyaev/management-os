"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import {
  devBankAccounts,
  devCostCategories,
} from "@/lib/db/schema/dev-finance";
import { projects } from "@/lib/db/schema/projects";
import { recordTransaction } from "./transaction-actions";
import { SUPPORTED_CURRENCIES } from "@/lib/development/constants/investor-constants";

/**
 * Sprint 4 — Bulk insert for the `/transactions/quick-entry`
 * Google-Sheets-style spreadsheet and the import wizard's commit step.
 *
 * Each row is validated independently against `bulkRowSchema`. Invalid
 * rows are returned with a per-row error string so the operator can
 * fix them inline in the SpreadsheetView and re-submit; valid rows
 * are persisted inside `recordTransaction` (which is itself atomic
 * per row — bank balance update + commitment-status recompute live
 * in one DB transaction).
 *
 * `categoryName` and `projectCode` are resolved server-side by exact
 * case-insensitive match against the org's catalogue. Unknown values
 * yield a `category_not_found` / `project_not_found` per-row error
 * rather than silently inserting with NULL — operators wanted hard
 * fail loud, not "drift into uncategorised".
 *
 * The shared `bankAccountId` is passed once at the action level (not
 * per row) — every row in a single Sheets-style entry session lands
 * on the same bank account.
 */

const bulkRowSchema = z.object({
  /** ISO 8601 date string (YYYY-MM-DD). */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  direction: z.enum(["inflow", "outflow"]),
  /** Whole-number minor units (e.g. cents). Stripe-style. */
  amountMinor: z.union([z.bigint(), z.string(), z.number()]),
  currency: z.enum(SUPPORTED_CURRENCIES),
  /**
   * Exchange rate vs the bank account's currency at transaction time.
   * Defaults to "1" — the bulk caller should set this explicitly when
   * the currencies don't match.
   */
  fxRate: z
    .string()
    .regex(/^\d+(\.\d+)?$/)
    .default("1"),
  /** Free-text category name to be resolved → categoryId. */
  categoryName: z.string().optional().nullable(),
  /**
   * Project slug or name. The bulk action looks up `projects.slug`
   * (preferred — short, stable) then falls back to a case-insensitive
   * `projects.name` match. Unknown values surface as
   * `project_not_found` per-row.
   */
  projectCode: z.string().optional().nullable(),
  /** Free-text vendor / counterparty. */
  counterpartyName: z.string().optional().nullable(),
  description: z.string().min(1),
  notes: z.string().optional().nullable(),
});

export type BulkTransactionRow = z.input<typeof bulkRowSchema>;

const bulkInputSchema = z.object({
  bankAccountId: z.string().uuid(),
  rows: z.array(bulkRowSchema).max(500),
});

export interface BulkRowResult {
  rowIndex: number;
  ok: boolean;
  /** Set when ok=true. */
  transactionId?: string;
  /** Set when ok=true. */
  transactionCode?: string;
  /** Set when ok=false. */
  error?: string;
}

export interface BulkRecordResult {
  totalRows: number;
  successCount: number;
  errorCount: number;
  results: BulkRowResult[];
}

export async function bulkRecordTransactions(
  input: z.input<typeof bulkInputSchema>,
): Promise<BulkRecordResult> {
  const parsed = bulkInputSchema.parse(input);
  const db = requireDb();
  const organizationId = await requireOrgId();

  // Pre-load bank account so we can fail fast on bad ID + use the
  // account currency for the default fx rate. Scoped by org so a
  // client-supplied bankAccountId can never reach another tenant's
  // account.
  const [account] = await db
    .select()
    .from(devBankAccounts)
    .where(
      and(
        eq(devBankAccounts.id, parsed.bankAccountId),
        eq(devBankAccounts.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!account) {
    return {
      totalRows: parsed.rows.length,
      successCount: 0,
      errorCount: parsed.rows.length,
      results: parsed.rows.map((_, i) => ({
        rowIndex: i,
        ok: false,
        error: "bank_account_not_found",
      })),
    };
  }

  // Pre-load category + project catalogues so the row loop doesn't
  // hit the DB per-row for resolution.
  const catalogueCategories = await db
    .select({
      id: devCostCategories.id,
      displayName: devCostCategories.displayName,
      categoryCode: devCostCategories.categoryCode,
    })
    .from(devCostCategories)
    .where(eq(devCostCategories.organizationId, organizationId));
  const catalogueProjects = await db
    .select({
      id: projects.id,
      slug: projects.slug,
      name: projects.name,
    })
    .from(projects)
    .where(eq(projects.organizationId, organizationId));

  // Look up by case-insensitive displayName OR categoryCode.
  const categoryByName = new Map<string, string>();
  for (const c of catalogueCategories) {
    categoryByName.set(c.displayName.trim().toLowerCase(), c.id);
    categoryByName.set(c.categoryCode.trim().toLowerCase(), c.id);
  }
  // Look up by slug (preferred) then name (fallback).
  const projectByCode = new Map<string, string>();
  for (const p of catalogueProjects) {
    projectByCode.set(p.slug.trim().toLowerCase(), p.id);
    projectByCode.set(p.name.trim().toLowerCase(), p.id);
  }

  const results: BulkRowResult[] = [];
  for (let i = 0; i < parsed.rows.length; i++) {
    const r = parsed.rows[i];
    try {
      let categoryId: string | null = null;
      if (r.categoryName) {
        const key = r.categoryName.trim().toLowerCase();
        categoryId = categoryByName.get(key) ?? null;
        if (!categoryId) {
          results.push({
            rowIndex: i,
            ok: false,
            error: `category_not_found: ${r.categoryName}`,
          });
          continue;
        }
      }
      let projectId: string | null = null;
      if (r.projectCode) {
        const key = r.projectCode.trim().toLowerCase();
        projectId = projectByCode.get(key) ?? null;
        if (!projectId) {
          results.push({
            rowIndex: i,
            ok: false,
            error: `project_not_found: ${r.projectCode}`,
          });
          continue;
        }
      }
      const txn = await recordTransaction({
        bankAccountId: parsed.bankAccountId,
        direction: r.direction,
        categoryId,
        projectId,
        amountMinor: r.amountMinor,
        currency: r.currency,
        fxRateAtTransaction: r.fxRate,
        counterpartyName: r.counterpartyName ?? null,
        transactionDate: r.date,
        description: r.description,
        notes: r.notes ?? null,
      });
      results.push({
        rowIndex: i,
        ok: true,
        transactionId: txn.id,
        transactionCode: txn.transactionCode,
      });
    } catch (err) {
      results.push({
        rowIndex: i,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const successCount = results.filter((r) => r.ok).length;
  return {
    totalRows: parsed.rows.length,
    successCount,
    errorCount: results.length - successCount,
    results,
  };
}
