import "server-only";

import { and, eq, gte, lte, sql } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { taxTypes, taxPeriodReports } from "@/lib/db/schema/tax";

/**
 * ID-TAX (migration 0164) — the period-close filing gate.
 *
 * Rule (mock parity, Accounting.html «Налоги ID»): an accounting period
 * CANNOT be closed until every tax declaration overlapping it is filed
 * with DJP. A declaration blocks the close when:
 *   * it overlaps the period (period_start <= close.end AND
 *     period_end >= close.start),
 *   * it is not archived,
 *   * it carries nonzero tax (zero-activity drafts are vacuous), and
 *   * filed_at IS NULL ("filed" is derived — see schema/tax.ts).
 * When NO report overlaps at all the close is allowed with a warning
 * (nothing was ever generated for the window — closing is the operator's
 * call, but the gap is logged).
 *
 * Consumed by closePeriodAction (src/lib/banking/bookkeeper-actions.ts).
 */

export interface UnfiledTaxDeclaration {
  id: string;
  taxTypeName: string;
  vatDirection: string | null;
  periodStart: string;
  periodEnd: string;
  status: string;
  totalTaxAmountMinor: bigint;
}

export interface TaxFilingGateResult {
  /** Non-archived reports overlapping the close window (any status). */
  total: number;
  /** The subset that blocks the close: nonzero tax + not filed. */
  unfiled: UnfiledTaxDeclaration[];
}

export async function findUnfiledTaxDeclarations(
  organizationId: string,
  periodStart: string,
  periodEnd: string,
): Promise<TaxFilingGateResult> {
  const db = requireDb();
  const rows = await db
    .select({
      id: taxPeriodReports.id,
      taxTypeName: taxTypes.displayName,
      vatDirection: taxPeriodReports.vatDirection,
      periodStart: taxPeriodReports.periodStart,
      periodEnd: taxPeriodReports.periodEnd,
      status: taxPeriodReports.status,
      totalTaxAmountMinor: taxPeriodReports.totalTaxAmountMinor,
      filedAt: taxPeriodReports.filedAt,
    })
    .from(taxPeriodReports)
    .innerJoin(taxTypes, eq(taxTypes.id, taxPeriodReports.taxTypeId))
    .where(
      and(
        eq(taxPeriodReports.organizationId, organizationId),
        lte(taxPeriodReports.periodStart, periodEnd),
        gte(taxPeriodReports.periodEnd, periodStart),
        sql`${taxPeriodReports.status} <> 'archived'`,
      ),
    );

  const unfiled = rows
    .filter((r) => r.filedAt === null && r.totalTaxAmountMinor !== 0n)
    .map((r) => ({
      id: r.id,
      taxTypeName: r.taxTypeName,
      vatDirection: r.vatDirection,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      status: r.status,
      totalTaxAmountMinor: r.totalTaxAmountMinor,
    }));

  return { total: rows.length, unfiled };
}

/** Human label for gate errors, e.g. "PPN (Indonesian VAT) · output · 2026-05-01 → 2026-05-31 (draft)". */
export function describeUnfiledDeclaration(d: UnfiledTaxDeclaration): string {
  const direction = d.vatDirection ?? "aggregate";
  return `${d.taxTypeName} · ${direction} · ${d.periodStart} → ${d.periodEnd} (${d.status})`;
}
