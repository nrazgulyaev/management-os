"use server";

import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { taxTypes, taxPeriodReports } from "@/lib/db/schema/tax";
import { devTransactions } from "@/lib/db/schema/dev-finance";
import { requireInternalUser } from "@/features/auth/permissions";

/**
 * Tax module actions. Tax types are operator-configurable (NOT
 * hardcoded). Period reports are aggregated by a cron job; operator
 * finalises manually.
 */

const upsertTypeSchema = z.object({
  typeKey: z.string().min(1).max(100),
  displayName: z.string().min(1).max(200),
  ratePercentage: z.union([z.number(), z.string()]),
  isIncludedInAmount: z.boolean().optional(),
  payableBy: z.enum(["company", "supplier", "buyer", "investor", "split"]),
  reportingPeriod: z
    .enum(["monthly", "quarterly", "annual", "on_demand"])
    .default("monthly"),
  reportingAuthority: z.string().max(200).optional(),
  countryCode: z.string().length(2).optional(),
  regionCode: z.string().max(20).optional(),
  notes: z.string().max(2000).optional(),
  aiClassificationHint: z.string().max(2000).optional(),
});

export async function upsertTaxType(
  input: z.input<typeof upsertTypeSchema>,
): Promise<{ id: string }> {
  const parsed = upsertTypeSchema.parse(input);
  await requireInternalUser();
  const db = requireDb();
  const [row] = await db
    .insert(taxTypes)
    .values({
      typeKey: parsed.typeKey,
      displayName: parsed.displayName,
      ratePercentage: String(parsed.ratePercentage),
      isIncludedInAmount: parsed.isIncludedInAmount ?? false,
      payableBy: parsed.payableBy,
      reportingPeriod: parsed.reportingPeriod,
      reportingAuthority: parsed.reportingAuthority ?? null,
      countryCode: parsed.countryCode ?? "ID",
      regionCode: parsed.regionCode ?? null,
      notes: parsed.notes ?? null,
      aiClassificationHint: parsed.aiClassificationHint ?? null,
    })
    .onConflictDoUpdate({
      target: taxTypes.typeKey,
      set: {
        displayName: parsed.displayName,
        ratePercentage: String(parsed.ratePercentage),
        isIncludedInAmount: parsed.isIncludedInAmount ?? false,
        payableBy: parsed.payableBy,
        reportingPeriod: parsed.reportingPeriod,
        reportingAuthority: parsed.reportingAuthority ?? null,
        regionCode: parsed.regionCode ?? null,
        notes: parsed.notes ?? null,
        aiClassificationHint: parsed.aiClassificationHint ?? null,
        updatedAt: new Date(),
      },
    })
    .returning({ id: taxTypes.id });
  return { id: row.id };
}

/**
 * Stage 10.E.6 — soft-delete a tax type by flipping isActive to false.
 * Tax types are referenced by historical tax_classifications + reports;
 * never hard-delete.
 */
export async function archiveTaxType(input: { id: string }): Promise<void> {
  await requireInternalUser();
  const db = requireDb();
  await db
    .update(taxTypes)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(taxTypes.id, input.id));
}

const classifyTxnSchema = z.object({
  transactionId: z.string().uuid(),
  taxTypeId: z.string().uuid().nullable(),
  taxAmountMinor: z
    .union([z.bigint(), z.string(), z.number()])
    .nullable()
    .optional(),
  isTaxIncluded: z.boolean().optional(),
  status: z
    .enum([
      "unclassified",
      "classified",
      "reviewed",
      "flagged_missing_doc",
      "tax_exempt",
    ])
    .default("classified"),
  taxDocumentId: z.string().uuid().optional(),
});

export async function classifyTransactionTax(
  input: z.input<typeof classifyTxnSchema>,
): Promise<{ ok: true }> {
  const parsed = classifyTxnSchema.parse(input);
  await requireInternalUser();
  const db = requireDb();
  await db
    .update(devTransactions)
    .set({
      taxTypeId: parsed.taxTypeId,
      taxAmountMinor:
        parsed.taxAmountMinor != null
          ? toBig(parsed.taxAmountMinor)
          : null,
      isTaxIncluded: parsed.isTaxIncluded ?? null,
      taxClassificationStatus: parsed.status,
      taxDocumentId: parsed.taxDocumentId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(devTransactions.id, parsed.transactionId));
  return { ok: true };
}

const generateReportSchema = z.object({
  taxTypeId: z.string().uuid(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * Generate (or refresh) a tax_period_report by aggregating
 * dev_transactions in the window. Idempotent on
 * (tax_type_id, period_start, period_end).
 */
export async function generateTaxPeriodReport(
  input: z.input<typeof generateReportSchema>,
): Promise<{ id: string; transactionCount: number }> {
  const parsed = generateReportSchema.parse(input);
  await requireInternalUser();
  const db = requireDb();
  const [agg] = await db.execute<{
    txn_count: number;
    unclass_count: number;
    taxable: string;
    tax_total: string;
  }>(sql`
    SELECT
      count(*)::int AS txn_count,
      count(*) FILTER (WHERE tax_classification_status = 'unclassified')::int AS unclass_count,
      coalesce(sum(amount_usd_minor), 0)::text AS taxable,
      coalesce(sum(tax_amount_minor), 0)::text AS tax_total
    FROM dev_transactions
    WHERE transaction_date >= ${parsed.periodStart}::date
      AND transaction_date <= ${parsed.periodEnd}::date
      AND tax_type_id = ${parsed.taxTypeId}
  `);
  const [row] = await db
    .insert(taxPeriodReports)
    .values({
      taxTypeId: parsed.taxTypeId,
      periodStart: parsed.periodStart,
      periodEnd: parsed.periodEnd,
      totalTaxableAmountMinor: BigInt(agg?.taxable ?? "0"),
      totalTaxAmountMinor: BigInt(agg?.tax_total ?? "0"),
      transactionCount: agg?.txn_count ?? 0,
      unclassifiedTransactionCount: agg?.unclass_count ?? 0,
    })
    .onConflictDoUpdate({
      target: [
        taxPeriodReports.taxTypeId,
        taxPeriodReports.periodStart,
        taxPeriodReports.periodEnd,
      ],
      set: {
        totalTaxableAmountMinor: BigInt(agg?.taxable ?? "0"),
        totalTaxAmountMinor: BigInt(agg?.tax_total ?? "0"),
        transactionCount: agg?.txn_count ?? 0,
        unclassifiedTransactionCount: agg?.unclass_count ?? 0,
        generatedAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning({ id: taxPeriodReports.id });
  return { id: row.id, transactionCount: agg?.txn_count ?? 0 };
}

// =========================================================================
// Read-side queries
// =========================================================================

export async function listActiveTaxTypes() {
  const db = requireDb();
  return await db
    .select()
    .from(taxTypes)
    .where(eq(taxTypes.isActive, true))
    .orderBy(taxTypes.typeKey);
}

export async function listAllTaxTypes() {
  const db = requireDb();
  return await db.select().from(taxTypes).orderBy(taxTypes.typeKey);
}

export async function findUnclassifiedTransactions(opts?: {
  olderThanDays?: number;
  limit?: number;
}) {
  const db = requireDb();
  const olderThan =
    opts?.olderThanDays != null
      ? new Date(Date.now() - opts.olderThanDays * 24 * 60 * 60 * 1000)
      : null;
  return await db
    .select()
    .from(devTransactions)
    .where(
      and(
        eq(devTransactions.taxClassificationStatus, "unclassified"),
        olderThan
          ? lte(devTransactions.createdAt, olderThan)
          : sql`true`,
      ),
    )
    .limit(opts?.limit ?? 200);
}

export async function listTaxPeriodReports() {
  const db = requireDb();
  return await db
    .select()
    .from(taxPeriodReports)
    .orderBy(sql`${taxPeriodReports.periodStart} desc`);
}

function toBig(v: bigint | string | number): bigint {
  if (typeof v === "bigint") return v;
  return BigInt(typeof v === "number" ? Math.trunc(v) : v);
}
