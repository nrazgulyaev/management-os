import "server-only";

import { unstable_cache } from "next/cache";
import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";

/**
 * STAFF-COST-MODEL phase 2 — Management P&L / company-margin report.
 *
 * The third leg of the two-axis cost model: lines with cost_bearer='management'
 * (head-office staff, software, coordination — incl. villa-attributed ones) never
 * touch owner payout. Until now they vanished after posting. This report makes
 * them visible as a company cost and computes the operator's net margin:
 *
 *     management commission earned − management-borne costs = company net margin
 *
 * Commission earned = sum of `management_fee` statement lines across the org's
 * statements for the period (the operator fee actually itemised to owners). This
 * is the realised commission, not a re-derivation, so it ties out to statements.
 *
 * Management-borne costs = sum of expense_lines where cost_bearer='management'
 * for the period, org-scoped. expense_lines has no organization_id — tenancy is
 * enforced by joining villa→project→organizations OR project→organizations OR,
 * for company-scope payroll lines (no villa/project), via the payroll_run's
 * organization_id. Every branch ANDs the caller's org.
 *
 * All amounts IDR minor (bigint). Read-only; gated by the Finance cabinet.
 */

export interface ManagementPnlBreakdownRow {
  /** Grouping key — staff name+role, or category for non-payroll lines. */
  label: string;
  category: string;
  source: "payroll" | "expense";
  costMinor: bigint;
  lineCount: number;
}

export interface ManagementPnlReport {
  periodMonth: string;
  monthLabel: string;
  commissionEarnedMinor: bigint;
  commissionLineCount: number;
  managementCostMinor: bigint;
  managementCostLineCount: number;
  netMarginMinor: bigint;
  /** Margin as a fraction of commission earned, or null when no commission. */
  marginPct: number | null;
  breakdown: ManagementPnlBreakdownRow[];
}

function monthLabelOf(periodMonth: string): string {
  const [y, m] = periodMonth.split("-").map(Number);
  if (!y || !m) return periodMonth;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en", {
    month: "long",
    year: "numeric",
  });
}

/**
 * List the distinct period months that have either statement management-fee
 * lines or management-borne expense_lines for this org. Powers the period
 * picker so the operator only sees months with data.
 */
export async function listManagementPnlPeriods(): Promise<string[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId().catch(() => null);
  if (!orgId) return [];
  // PERF (Phase 4): months-with-data change ~once/month; cache the resolved
  // string[] per-org for 300s. Org resolved OUTSIDE the cache, passed as a
  // key-part. Output is already plain strings — no bigint.
  return unstable_cache(
    async () => {
      const cdb = getDb();
      if (!cdb) return [];
      const rows = await cdb.execute<{ period_month: string }>(sql`
    WITH stmt_months AS (
      SELECT DISTINCT s.period_month::date AS pm
        FROM owner_statements s
       WHERE s.organization_id = ${orgId}::uuid
         AND s.period_month IS NOT NULL
    ),
    expense_months AS (
      SELECT DISTINCT date_trunc('month', el.expense_date)::date AS pm
        FROM expense_lines el
        LEFT JOIN villas v ON v.id = el.villa_id
        LEFT JOIN projects pv ON pv.id = v.project_id
        LEFT JOIN projects pp ON pp.id = el.project_id
        LEFT JOIN payroll_runs pr ON pr.id = el.payroll_run_id
       WHERE el.cost_bearer = 'management'
         AND el.status = 'posted'
         AND COALESCE(pv.organization_id, pp.organization_id, pr.organization_id)
             = ${orgId}::uuid
    )
    SELECT to_char(pm, 'YYYY-MM-DD') AS period_month
      FROM (
        SELECT pm FROM stmt_months
        UNION
        SELECT pm FROM expense_months
      ) u
     ORDER BY period_month DESC
     LIMIT 24
  `);
      return rowsOf<{ period_month: string }>(rows).map((r) => r.period_month);
    },
    ["finance", "mgmt-pnl-periods", orgId],
    { revalidate: 300 },
  )();
}

/**
 * Build the management P&L for a period. Org-scoped throughout.
 *
 * @param periodMonth ISO first-of-month, e.g. "2026-05-01".
 */
export async function getManagementPnl(periodMonth: string): Promise<ManagementPnlReport> {
  const empty: ManagementPnlReport = {
    periodMonth,
    monthLabel: monthLabelOf(periodMonth),
    commissionEarnedMinor: 0n,
    commissionLineCount: 0,
    managementCostMinor: 0n,
    managementCostLineCount: 0,
    netMarginMinor: 0n,
    marginPct: null,
    breakdown: [],
  };

  const db = getDb();
  if (!db) return empty;
  const orgId = await requireOrgId().catch(() => null);
  if (!orgId) return empty;

  // PERF (Phase 4): a closed month never changes, so both heavy aggregates are
  // cached together per-org+period for 300s. Org resolved OUTSIDE the cache;
  // org AND periodMonth are key-parts. Only raw ::text rows are cached — every
  // BigInt()/reduce/netMargin/marginPct computation runs live below.
  const { commission: commissionRow, cost: costRowsData } = await unstable_cache(
    async () => {
      const cdb = getDb();
      if (!cdb) return { commission: null, cost: [] as Array<{
        label: string;
        category: string;
        source: string;
        cost_minor: string;
        line_count: string;
      }> };
      // ---------------------------------------------------------------
      // 1) Commission earned — management_fee statement lines across the org's
      //    statements for the period. Stored negative on the owner statement
      //    (a deduction from owner payout); the operator earns the magnitude.
      // ---------------------------------------------------------------
      const commissionRows = await cdb.execute<{ total_minor: string; line_count: string }>(sql`
    SELECT COALESCE(SUM(ABS(sl.amount_minor)), 0)::text AS total_minor,
           COUNT(*)::text                               AS line_count
      FROM statement_lines sl
      JOIN owner_statements s ON s.id = sl.statement_id
     WHERE s.organization_id = ${orgId}::uuid
       AND s.period_month = ${periodMonth}::date
       AND sl.line_type = 'management_fee'
  `);
      // ---------------------------------------------------------------
      // 2) Management-borne costs — expense_lines cost_bearer='management' for the
      //    period. Org-scoped via villa→project, project, or payroll_run. Grouped
      //    by staff (payroll lines) or expense_type (non-payroll), so the breakdown
      //    table reads "by staff / role / category".
      // ---------------------------------------------------------------
      const costRows = await cdb.execute<{
        label: string;
        category: string;
        source: string;
        cost_minor: string;
        line_count: string;
      }>(sql`
    SELECT COALESCE(st.full_name || ' · ' || st.role_label,
                    el.expense_type,
                    'Management cost')              AS label,
           COALESCE(st.role_label, el.expense_type) AS category,
           CASE WHEN el.payroll_run_id IS NOT NULL THEN 'payroll' ELSE 'expense' END AS source,
           COALESCE(SUM(el.amount_minor), 0)::text  AS cost_minor,
           COUNT(*)::text                            AS line_count
      FROM expense_lines el
      LEFT JOIN villas v ON v.id = el.villa_id
      LEFT JOIN projects pv ON pv.id = v.project_id
      LEFT JOIN projects pp ON pp.id = el.project_id
      LEFT JOIN payroll_runs pr ON pr.id = el.payroll_run_id
      LEFT JOIN staff st ON st.id = el.staff_id
     WHERE el.cost_bearer = 'management'
       AND el.status = 'posted'
       AND date_trunc('month', el.expense_date)::date = ${periodMonth}::date
       AND COALESCE(pv.organization_id, pp.organization_id, pr.organization_id)
           = ${orgId}::uuid
     GROUP BY 1, 2, 3
     ORDER BY SUM(el.amount_minor) DESC
     LIMIT 100
  `);
      return {
        commission:
          rowsOf<{ total_minor: string; line_count: string }>(commissionRows)[0] ?? null,
        cost: rowsOf<{
          label: string;
          category: string;
          source: string;
          cost_minor: string;
          line_count: string;
        }>(costRows),
      };
    },
    ["finance", "mgmt-pnl", orgId, periodMonth],
    { revalidate: 300 },
  )();

  const commissionEarnedMinor = BigInt(commissionRow?.total_minor ?? "0");
  const commissionLineCount = Number(commissionRow?.line_count ?? "0");

  const breakdown: ManagementPnlBreakdownRow[] = costRowsData.map((r) => ({
    label: r.label?.replace(/^\[DEMO\] /, "").replace(/^\[DEMO2\] /, "") ?? "Management cost",
    category: r.category ?? "Management cost",
    source: r.source === "payroll" ? "payroll" : "expense",
    costMinor: BigInt(r.cost_minor ?? "0"),
    lineCount: Number(r.line_count ?? "0"),
  }));

  const managementCostMinor = breakdown.reduce<bigint>((acc, b) => acc + b.costMinor, 0n);
  const managementCostLineCount = breakdown.reduce((acc, b) => acc + b.lineCount, 0);

  const netMarginMinor = commissionEarnedMinor - managementCostMinor;
  const marginPct =
    commissionEarnedMinor > 0n
      ? Number(netMarginMinor) / Number(commissionEarnedMinor)
      : null;

  return {
    periodMonth,
    monthLabel: monthLabelOf(periodMonth),
    commissionEarnedMinor,
    commissionLineCount,
    managementCostMinor,
    managementCostLineCount,
    netMarginMinor,
    marginPct,
    breakdown,
  };
}
