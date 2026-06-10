"use server";

import { and, desc, eq, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { taxTypes, taxPeriodReports } from "@/lib/db/schema/tax";
import { devTransactions } from "@/lib/db/schema/dev-finance";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { recordAuditEvent } from "@/features/audit/services";
import { taxDirectionKind } from "@/lib/development/server/tax/tax-kind";

/**
 * Tax module actions. Tax types are operator-configurable (NOT
 * hardcoded). Period reports are aggregated by a cron job; operator
 * finalises manually, then files with DJP (Indonesia tax authority) —
 * the ID-TAX lifecycle added by migration 0164:
 *
 *   draft → finalized → submitted → FILED (filed_at + djp_reference)
 *
 * "Filed" is derived (filedAt IS NOT NULL); period close is gated on it
 * (see src/lib/development/server/tax/filing-gate.ts).
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
  // HF-5: scope UPDATE of multi-tenant dev_transactions by organization_id.
  const organizationId = await requireOrgId();
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
    .where(
      and(
        eq(devTransactions.id, parsed.transactionId),
        eq(devTransactions.organizationId, organizationId),
      ),
    );
  return { ok: true };
}

const generateReportSchema = z.object({
  taxTypeId: z.string().uuid(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// ID-TAX direction classification for a tax type lives in
// src/lib/development/server/tax/tax-kind.ts (extracted for the compliance
// trio so the e-Faktur export + bukti potong register match this file
// exactly — a "use server" module may only export async functions).

/**
 * ID-TAX (0164) — VAT direction is derived from dev_transactions.direction:
 *   * 'inflow'  → OUTPUT VAT (e-Faktur PPN Keluaran): money received from a
 *     sale, the 11% PPN on it was COLLECTED from the customer and is owed
 *     to DJP.
 *   * 'outflow' → INPUT VAT (e-Faktur PPN Masukan): money paid to a
 *     supplier, the PPN on it was PAID and is creditable against output.
 *   * 'internal_transfer' → excluded from VAT reports entirely (moving
 *     money between own accounts is not a taxable supply).
 * Withholding (PPh) and general types aggregate ALL directions, exactly
 * like the pre-0164 aggregation, so non-VAT numbers do not shift.
 */
const VAT_DIRECTION_FILTER: Record<"output" | "input", string> = {
  output: "inflow",
  input: "outflow",
};

interface GeneratedReportResult {
  id: string;
  vatDirection: "output" | "input" | "withholding" | null;
  transactionCount: number;
  /** True when the row was left untouched because it is submitted/filed. */
  skipped: boolean;
  skipReason?: string;
}

async function aggregateWindow(
  db: ReturnType<typeof requireDb>,
  args: {
    organizationId: string;
    taxTypeId: string;
    periodStart: string;
    periodEnd: string;
    /** dev_transactions.direction to restrict to (VAT split), or null = all. */
    txnDirection: string | null;
  },
): Promise<{
  txnCount: number;
  unclassCount: number;
  taxable: bigint;
  taxTotal: bigint;
}> {
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
    WHERE transaction_date >= ${args.periodStart}::date
      AND transaction_date <= ${args.periodEnd}::date
      AND tax_type_id = ${args.taxTypeId}
      AND organization_id = ${args.organizationId}
      ${args.txnDirection ? sql`AND direction = ${args.txnDirection}` : sql``}
  `);
  return {
    txnCount: agg?.txn_count ?? 0,
    unclassCount: agg?.unclass_count ?? 0,
    taxable: BigInt(agg?.taxable ?? "0"),
    taxTotal: BigInt(agg?.tax_total ?? "0"),
  };
}

/**
 * Generate (or refresh) the tax_period_report(s) for one tax type ×
 * period by aggregating dev_transactions in the window.
 *
 * 0164 changes vs the original:
 *   1. VAT-class types (PPN) produce TWO reports — vat_direction 'output'
 *      (inflow transactions) and 'input' (outflow) — see the direction
 *      mapping doc above. PPh-class → one 'withholding' report; everything
 *      else → one direction-less report (legacy behaviour).
 *   2. The blind ON CONFLICT upsert is gone: a report that is already
 *      submitted or filed is NEVER overwritten (returned as skipped) —
 *      closes the admitted cron-overwrite integrity hole.
 *   3. The aggregation window is org-scoped (it previously summed
 *      dev_transactions across ALL organizations into the caller's report).
 *   4. When a VAT type is split, a leftover pre-0164 direction-less DRAFT
 *      row for the same (type, period) is archived (it mixed both
 *      directions); finalized/submitted legacy rows are left untouched.
 *
 * Return shape stays cron-compatible: `id` + `transactionCount` (sum over
 * generated rows), plus the per-direction breakdown in `results`.
 */
export async function generateTaxPeriodReport(
  input: z.input<typeof generateReportSchema>,
): Promise<{
  id: string;
  transactionCount: number;
  results: GeneratedReportResult[];
}> {
  const parsed = generateReportSchema.parse(input);
  await requireInternalUser();
  const db = requireDb();
  // HF-5: tax_period_reports is multi-tenant (migration 0072).
  const organizationId = await requireOrgId();

  const [taxType] = await db
    .select({
      id: taxTypes.id,
      typeKey: taxTypes.typeKey,
      displayName: taxTypes.displayName,
    })
    .from(taxTypes)
    .where(eq(taxTypes.id, parsed.taxTypeId))
    .limit(1);
  if (!taxType) throw new Error("Tax type not found.");

  const kind = taxDirectionKind(taxType);
  const targets: Array<"output" | "input" | "withholding" | null> =
    kind === "vat"
      ? ["output", "input"]
      : kind === "withholding"
        ? ["withholding"]
        : [null];

  const results: GeneratedReportResult[] = [];

  for (const direction of targets) {
    const txnDirection =
      direction === "output" || direction === "input"
        ? VAT_DIRECTION_FILTER[direction]
        : null;
    const agg = await aggregateWindow(db, {
      organizationId,
      taxTypeId: parsed.taxTypeId,
      periodStart: parsed.periodStart,
      periodEnd: parsed.periodEnd,
      txnDirection,
    });

    const [existing] = await db
      .select()
      .from(taxPeriodReports)
      .where(
        and(
          eq(taxPeriodReports.taxTypeId, parsed.taxTypeId),
          eq(taxPeriodReports.periodStart, parsed.periodStart),
          eq(taxPeriodReports.periodEnd, parsed.periodEnd),
          direction === null
            ? isNull(taxPeriodReports.vatDirection)
            : eq(taxPeriodReports.vatDirection, direction),
        ),
      )
      .limit(1);

    if (existing) {
      // 0164 integrity fix: never overwrite a submitted/filed declaration.
      if (existing.status === "submitted" || existing.filedAt !== null) {
        results.push({
          id: existing.id,
          vatDirection: direction,
          transactionCount: existing.transactionCount,
          skipped: true,
          skipReason: existing.filedAt
            ? "Already filed with DJP — refresh refused."
            : "Already submitted — refresh refused.",
        });
        continue;
      }
      if (existing.organizationId !== organizationId) {
        results.push({
          id: existing.id,
          vatDirection: direction,
          transactionCount: existing.transactionCount,
          skipped: true,
          skipReason: "Report belongs to another organization.",
        });
        continue;
      }
      await db
        .update(taxPeriodReports)
        .set({
          totalTaxableAmountMinor: agg.taxable,
          totalTaxAmountMinor: agg.taxTotal,
          transactionCount: agg.txnCount,
          unclassifiedTransactionCount: agg.unclassCount,
          generatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(taxPeriodReports.id, existing.id));
      results.push({
        id: existing.id,
        vatDirection: direction,
        transactionCount: agg.txnCount,
        skipped: false,
      });
      continue;
    }

    const [row] = await db
      .insert(taxPeriodReports)
      .values({
        organizationId,
        taxTypeId: parsed.taxTypeId,
        periodStart: parsed.periodStart,
        periodEnd: parsed.periodEnd,
        vatDirection: direction,
        totalTaxableAmountMinor: agg.taxable,
        totalTaxAmountMinor: agg.taxTotal,
        transactionCount: agg.txnCount,
        unclassifiedTransactionCount: agg.unclassCount,
      })
      .returning({ id: taxPeriodReports.id });
    results.push({
      id: row.id,
      vatDirection: direction,
      transactionCount: agg.txnCount,
      skipped: false,
    });
  }

  // 0164: archive a leftover direction-less DRAFT row for a now-split VAT
  // type — its totals mixed output+input and would double-count in KPIs.
  if (kind === "vat") {
    await db
      .update(taxPeriodReports)
      .set({
        status: "archived",
        notes: sql`coalesce(${taxPeriodReports.notes} || ' ', '') || '[0164] Superseded by the output/input direction split.'`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(taxPeriodReports.taxTypeId, parsed.taxTypeId),
          eq(taxPeriodReports.periodStart, parsed.periodStart),
          eq(taxPeriodReports.periodEnd, parsed.periodEnd),
          isNull(taxPeriodReports.vatDirection),
          eq(taxPeriodReports.status, "draft"),
          isNull(taxPeriodReports.filedAt),
          eq(taxPeriodReports.organizationId, organizationId),
        ),
      );
  }

  const generated = results.filter((r) => !r.skipped);
  return {
    id: (generated[0] ?? results[0]).id,
    transactionCount: generated.reduce((n, r) => n + r.transactionCount, 0),
    results,
  };
}

const generatePeriodSchema = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * ID-TAX (0164) — refresh declarations for EVERY active tax type in one
 * period (the page's "Refresh declarations" button; same path the monthly
 * cron walks, but operator-triggered for an arbitrary period).
 */
export async function generateTaxReportsForPeriod(
  input: z.input<typeof generatePeriodSchema>,
): Promise<
  | { ok: true; generated: number; skipped: number }
  | { ok: false; error: string }
> {
  try {
    await requireInternalUser();
    const parsed = generatePeriodSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }
    const db = requireDb();
    const types = await db
      .select({ id: taxTypes.id })
      .from(taxTypes)
      .where(eq(taxTypes.isActive, true));
    if (types.length === 0) {
      return { ok: false, error: "No active tax types are configured." };
    }
    let generated = 0;
    let skipped = 0;
    for (const t of types) {
      const out = await generateTaxPeriodReport({
        taxTypeId: t.id,
        periodStart: parsed.data.periodStart,
        periodEnd: parsed.data.periodEnd,
      });
      generated += out.results.filter((r) => !r.skipped).length;
      skipped += out.results.filter((r) => r.skipped).length;
    }
    return { ok: true, generated, skipped };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Generation failed.",
    };
  }
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
  // 0164: org-scoped like sibling reads (was unscoped).
  const organizationId = await requireOrgId();
  return await db
    .select()
    .from(taxPeriodReports)
    .where(eq(taxPeriodReports.organizationId, organizationId))
    .orderBy(
      desc(taxPeriodReports.periodStart),
      taxPeriodReports.vatDirection,
    );
}

const finalizeReportSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["finalized", "submitted"]).default("finalized"),
});

/**
 * Finalize (or mark submitted) a tax period report. Stamps finalizedAt/By
 * and submittedAt, org-scoped. Precondition: all transactions in the
 * period must be classified (unclassifiedTransactionCount === 0) — a
 * filed return must not silently exclude pending transactions. Once
 * submitted, the report is terminal here. (The monthly cron still
 * UPSERTs on (tax_type, period); a follow-up should make it skip
 * finalized/submitted rows so a filed return can't be silently
 * re-aggregated.)
 */
export async function finalizeTaxPeriodReport(
  input: z.input<typeof finalizeReportSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const ctx = await requireInternalUser();
    const parsed = finalizeReportSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const db = requireDb();
    const organizationId = await requireOrgId();

    const [report] = await db
      .select()
      .from(taxPeriodReports)
      .where(
        and(
          eq(taxPeriodReports.id, parsed.data.id),
          eq(taxPeriodReports.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!report) return { ok: false, error: "Report not found." };
    if (report.unclassifiedTransactionCount > 0) {
      return {
        ok: false,
        error: `Clear the ${report.unclassifiedTransactionCount} unclassified transaction(s) before finalising.`,
      };
    }
    if (report.status === "submitted") {
      return { ok: false, error: "Report is already submitted." };
    }

    const now = new Date();
    await db
      .update(taxPeriodReports)
      .set({
        status: parsed.data.status,
        finalizedAt: report.finalizedAt ?? now,
        finalizedBy: report.finalizedBy ?? ctx.appUser?.id ?? null,
        submittedAt: parsed.data.status === "submitted" ? now : report.submittedAt,
        updatedAt: now,
      })
      .where(
        and(
          eq(taxPeriodReports.id, parsed.data.id),
          eq(taxPeriodReports.organizationId, organizationId),
        ),
      );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Finalize failed." };
  }
}

// =========================================================================
// ID-TAX (0164) — DJP filing
// =========================================================================

/** Mock-parity DJP reference: DJP-<yyyymm>-<6 digits> (Accounting.html). */
function generateDjpReference(periodEnd: string): string {
  const compact = periodEnd.slice(0, 7).replace("-", "");
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `DJP-${compact}-${rand}`;
}

const markFiledSchema = z.object({
  id: z.string().uuid(),
  /** Optional operator-supplied DJP reference; auto-generated when blank. */
  djpReference: z.string().trim().min(3).max(120).optional(),
});

/**
 * Mark one tax declaration as FILED with DJP. Auth-gated like finalize;
 * requires the report to be finalized (or already submitted) first; stamps
 * filed_at / filed_by_user_id / djp_reference; audited. Filing implies
 * submission, so a finalized report is bumped to 'submitted' here.
 */
export async function markTaxPeriodReportFiled(
  input: z.input<typeof markFiledSchema>,
): Promise<
  { ok: true; djpReference: string } | { ok: false; error: string }
> {
  try {
    const ctx = await requireInternalUser();
    const parsed = markFiledSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }
    const db = requireDb();
    const organizationId = await requireOrgId();

    const [report] = await db
      .select()
      .from(taxPeriodReports)
      .where(
        and(
          eq(taxPeriodReports.id, parsed.data.id),
          eq(taxPeriodReports.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!report) return { ok: false, error: "Report not found." };
    if (report.filedAt) {
      return {
        ok: false,
        error: `Already filed (${report.djpReference ?? "no reference"}).`,
      };
    }
    if (report.status !== "finalized" && report.status !== "submitted") {
      return {
        ok: false,
        error: "Finalize the declaration before filing with DJP.",
      };
    }

    const djpReference =
      parsed.data.djpReference ?? generateDjpReference(report.periodEnd);
    const now = new Date();
    await db
      .update(taxPeriodReports)
      .set({
        status: "submitted",
        submittedAt: report.submittedAt ?? now,
        filedAt: now,
        filedByUserId: ctx.appUser?.id ?? null,
        djpReference,
        updatedAt: now,
      })
      .where(
        and(
          eq(taxPeriodReports.id, parsed.data.id),
          eq(taxPeriodReports.organizationId, organizationId),
        ),
      );

    await recordAuditEvent({
      actorUserId: ctx.appUser?.id ?? null,
      organizationId,
      action: "tax_report.mark_filed",
      entityType: "tax_period_report",
      entityId: report.id,
      before: { status: report.status, djpReference: report.djpReference },
      after: {
        status: "submitted",
        filedAt: now.toISOString(),
        djpReference,
        vatDirection: report.vatDirection,
        period: `${report.periodStart} → ${report.periodEnd}`,
        totalTaxAmountMinor: report.totalTaxAmountMinor.toString(),
      },
    });
    return { ok: true, djpReference };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Mark-filed failed.",
    };
  }
}

const filePeriodSchema = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Optional shared DJP reference for the whole filing batch. */
  djpReference: z.string().trim().min(3).max(120).optional(),
});

/**
 * "File taxes" (mock parity) — file EVERY finalized/submitted, not-yet-filed
 * declaration of the period in one shot, stamping one shared DJP reference
 * (the mock stamps a single ref for the whole filing). Refuses while any
 * declaration with nonzero tax is still a draft — a partial filing must not
 * unlock period close.
 */
export async function fileTaxesForPeriod(
  input: z.input<typeof filePeriodSchema>,
): Promise<
  | { ok: true; filed: number; djpReference: string }
  | { ok: false; error: string }
> {
  try {
    const ctx = await requireInternalUser();
    const parsed = filePeriodSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }
    const db = requireDb();
    const organizationId = await requireOrgId();

    const reports = await db
      .select()
      .from(taxPeriodReports)
      .where(
        and(
          eq(taxPeriodReports.organizationId, organizationId),
          eq(taxPeriodReports.periodStart, parsed.data.periodStart),
          eq(taxPeriodReports.periodEnd, parsed.data.periodEnd),
          sql`${taxPeriodReports.status} <> 'archived'`,
        ),
      );
    if (reports.length === 0) {
      return {
        ok: false,
        error:
          "No tax declarations exist for this period. Generate reports first.",
      };
    }

    const blockingDrafts = reports.filter(
      (r) =>
        !r.filedAt &&
        r.status !== "finalized" &&
        r.status !== "submitted" &&
        r.totalTaxAmountMinor !== 0n,
    );
    if (blockingDrafts.length > 0) {
      return {
        ok: false,
        error: `Finalize these declarations first: ${blockingDrafts
          .map((r) => r.vatDirection ?? "aggregate")
          .join(", ")}.`,
      };
    }

    const eligible = reports.filter(
      (r) =>
        !r.filedAt && (r.status === "finalized" || r.status === "submitted"),
    );
    if (eligible.length === 0) {
      return {
        ok: false,
        error: "Nothing to file — every declaration is already filed.",
      };
    }

    const djpReference =
      parsed.data.djpReference ?? generateDjpReference(parsed.data.periodEnd);
    const now = new Date();
    for (const r of eligible) {
      await db
        .update(taxPeriodReports)
        .set({
          status: "submitted",
          submittedAt: r.submittedAt ?? now,
          filedAt: now,
          filedByUserId: ctx.appUser?.id ?? null,
          djpReference,
          updatedAt: now,
        })
        .where(
          and(
            eq(taxPeriodReports.id, r.id),
            eq(taxPeriodReports.organizationId, organizationId),
          ),
        );
    }

    await recordAuditEvent({
      actorUserId: ctx.appUser?.id ?? null,
      organizationId,
      action: "tax_report.file_period",
      entityType: "tax_period_report",
      entityId: eligible[0].id,
      after: {
        djpReference,
        filedAt: now.toISOString(),
        period: `${parsed.data.periodStart} → ${parsed.data.periodEnd}`,
        reportIds: eligible.map((r) => r.id),
        directions: eligible.map((r) => r.vatDirection ?? "aggregate"),
      },
    });
    return { ok: true, filed: eligible.length, djpReference };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "File taxes failed.",
    };
  }
}

function toBig(v: bigint | string | number): bigint {
  if (typeof v === "bigint") return v;
  return BigInt(typeof v === "number" ? Math.trunc(v) : v);
}
