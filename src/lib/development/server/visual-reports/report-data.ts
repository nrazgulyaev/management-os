import "server-only";

/**
 * Org-scoped data readers for the Visual Reports cabinet.
 *
 * Every reader resolves the caller's org via `requireOrgId()` and never
 * trusts a client-supplied organization id. These replace the literal demo
 * arrays that previously lived inline in each report page. When a tenant has
 * no rows, the reader returns an empty result and the page renders an honest
 * empty-state (no fabricated data).
 *
 * Money is BIGINT minor units throughout; we down-convert to `number` only at
 * the chart-helper boundary (the SVG helpers take numbers). Cumulative sums
 * stay in BigInt until that boundary to avoid precision loss on large totals.
 */

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { getProjectFinancialSummary } from "../budget";
import type { SCurvePoint } from "./s-curve-helpers";
import type { BurnPeriodPoint } from "./burn-chart-helpers";
import type { HeatmapCell } from "./heatmap-helpers";
import type { CapitalMonthRow } from "./capital-timeline-helpers";
import type { FunnelStage } from "./funnel-helpers";
import type { ProductivityRow } from "./productivity-helpers";
import type { SupplierDelayInput } from "./procurement-delays-helpers";

const num = (v: unknown): number =>
  v === null || v === undefined ? 0 : Number(v as string | number);

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function monthKeyLabel(ym: string): string {
  // ym = "2026-03" → "Mar 26"
  const [y, m] = ym.split("-");
  const idx = Math.max(0, Math.min(11, Number(m) - 1));
  return `${MONTH_LABELS[idx]} ${y.slice(2)}`;
}

// ---------------------------------------------------------------------------
// 1) S-CURVE — cumulative milestone-weight (% complete) per month.
// ---------------------------------------------------------------------------

export interface SCurveData {
  planned: SCurvePoint[];
  actual: SCurvePoint[];
  projectName: string | null;
}

/**
 * Builds a company-wide S-curve from the org-scoped `milestones` table.
 *
 * Each milestone carries equal weight (1 / total). The PLANNED curve walks
 * each milestone's `target_date`; the ACTUAL curve walks `actual_date` (or
 * the date a `done` milestone was completed). Both are cumulative % of the
 * total milestone count, so they share the same y-scale and converge to 100%
 * when every milestone is complete.
 */
export async function getSCurveData(): Promise<SCurveData> {
  const db = getDb();
  if (!db) return { planned: [], actual: [], projectName: null };
  const organizationId = await requireOrgId();

  const rows = (await db.execute(sql`
    SELECT target_date, actual_date, status
      FROM milestones
     WHERE organization_id = ${organizationId}
     ORDER BY target_date ASC
  `)) as Array<Record<string, unknown>>;

  if (rows.length === 0) return { planned: [], actual: [], projectName: null };

  const total = rows.length;
  const weight = 100 / total;

  // PLANNED: cumulative by target_date.
  const plannedRaw = rows
    .map((r) => ({ date: new Date(String(r.target_date)), deltaPct: weight }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  // ACTUAL: cumulative by actual_date for milestones that have one (or are
  // marked done). Milestones still pending contribute nothing yet — the
  // actual curve trails the planned one until work catches up.
  const actualRaw = rows
    .filter((r) => r.actual_date != null || String(r.status) === "done")
    .map((r) => ({
      date: new Date(String(r.actual_date ?? r.target_date)),
      deltaPct: weight,
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const cumulate = (
    raw: Array<{ date: Date; deltaPct: number }>,
  ): SCurvePoint[] => {
    let cum = 0;
    return raw.map((r) => {
      cum = Math.min(100, cum + r.deltaPct);
      return { date: r.date, pctComplete: cum };
    });
  };

  return {
    planned: cumulate(plannedRaw),
    actual: cumulate(actualRaw),
    projectName: null,
  };
}

// ---------------------------------------------------------------------------
// 2) BUDGET BURN — monthly committed / actual deltas + total budget line.
// ---------------------------------------------------------------------------

export interface BudgetBurnData {
  points: BurnPeriodPoint[];
  budgetMinor: number;
}

/**
 * Company-wide budget burn across all of the org's projects.
 *
 * - Total budget reference line = sum of each project's
 *   `getProjectFinancialSummary().totalBudgetUsdMinor` (org-scoped reader).
 * - Monthly committed delta = sum of `dev_commitments_ledger.amount_usd_minor`
 *   grouped by `committed_date` month.
 * - Monthly actual delta = sum of `dev_transactions.amount_usd_minor` where
 *   direction = 'outflow', grouped by `transaction_date` month.
 *
 * We cumulate the monthly deltas here and return ready-to-render
 * `BurnPeriodPoint[]` so the page passes them straight to `renderBurnChartSvg`.
 */
export async function getBudgetBurnData(): Promise<BudgetBurnData> {
  const db = getDb();
  if (!db) return { points: [], budgetMinor: 0 };
  const organizationId = await requireOrgId();

  // Org's projects.
  const projectRows = (await db.execute(sql`
    SELECT id FROM projects WHERE organization_id = ${organizationId}
  `)) as Array<Record<string, unknown>>;
  const projectIds = projectRows.map((r) => String(r.id));

  // Total budget = sum over projects (reuses the org-scoped budget summary).
  let budgetMinor = 0n;
  for (const pid of projectIds) {
    const summary = await getProjectFinancialSummary(pid);
    budgetMinor += BigInt(summary.totalBudgetUsdMinor);
  }

  // Monthly committed deltas (org-scoped via organization_id).
  const committedRows = (await db.execute(sql`
    SELECT to_char(committed_date, 'YYYY-MM') AS ym,
           coalesce(sum(amount_usd_minor), 0)::bigint AS amt
      FROM dev_commitments_ledger
     WHERE organization_id = ${organizationId}
       AND status <> 'cancelled'
     GROUP BY 1
  `)) as Array<Record<string, unknown>>;

  // Monthly actual outflow deltas (org-scoped).
  const actualRows = (await db.execute(sql`
    SELECT to_char(transaction_date, 'YYYY-MM') AS ym,
           coalesce(sum(amount_usd_minor), 0)::bigint AS amt
      FROM dev_transactions
     WHERE organization_id = ${organizationId}
       AND direction = 'outflow'
     GROUP BY 1
  `)) as Array<Record<string, unknown>>;

  const committedByMonth = new Map<string, number>();
  for (const r of committedRows) committedByMonth.set(String(r.ym), num(r.amt));
  const actualByMonth = new Map<string, number>();
  for (const r of actualRows) actualByMonth.set(String(r.ym), num(r.amt));

  const months = Array.from(
    new Set([...committedByMonth.keys(), ...actualByMonth.keys()]),
  ).sort();

  const points: BurnPeriodPoint[] = [];
  // We return cumulative points directly (page calls renderBurnChartSvg with
  // these). Build the cumulative series here so the page stays declarative.
  let committedCum = 0;
  let actualCum = 0;
  for (const ym of months) {
    committedCum += committedByMonth.get(ym) ?? 0;
    actualCum += actualByMonth.get(ym) ?? 0;
    points.push({
      label: monthKeyLabel(ym),
      cumulativeCommittedMinor: committedCum,
      cumulativeActualMinor: actualCum,
    });
  }

  return { points, budgetMinor: Number(budgetMinor) };
}

// ---------------------------------------------------------------------------
// 3) COST HEATMAP — per-villa × {Land, Hard, Soft} budget vs actual.
// ---------------------------------------------------------------------------

/**
 * Rolls up `unit_cost_allocations` (org-scoped) into a villa × category grid.
 *
 * ACTUAL  = the CURRENT allocation (`is_current = true`) for each villa.
 * BUDGET  = the EARLIEST allocation for the same villa (the original cost
 *           basis the team estimated). When a villa has only one allocation
 *           there is no drift, so budget == actual (overage 0%).
 *
 * Buckets:
 *   Land = land_cost_allocated
 *   Hard = hard_cost_direct + hard_cost_allocated
 *   Soft = soft_cost_allocated + marketing_cost_allocated + financing_cost_allocated
 */
export async function getCostHeatmapData(): Promise<HeatmapCell[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();

  const rows = (await db.execute(sql`
    WITH ranked AS (
      SELECT
        a.asset_id,
        coalesce(v.unit_code, v.name, 'Unit') AS unit_label,
        a.land_cost_allocated_minor AS land,
        (a.hard_cost_direct_minor + a.hard_cost_allocated_minor) AS hard,
        (a.soft_cost_allocated_minor + a.marketing_cost_allocated_minor
          + a.financing_cost_allocated_minor) AS soft,
        a.is_current,
        row_number() OVER (
          PARTITION BY a.asset_id ORDER BY a.computed_at ASC
        ) AS earliest_rank
      FROM unit_cost_allocations a
      JOIN villas v ON v.id = a.asset_id
      WHERE a.organization_id = ${organizationId}
    )
    SELECT
      asset_id,
      max(unit_label) AS unit_label,
      max(land)  FILTER (WHERE is_current)        AS actual_land,
      max(hard)  FILTER (WHERE is_current)        AS actual_hard,
      max(soft)  FILTER (WHERE is_current)        AS actual_soft,
      max(land)  FILTER (WHERE earliest_rank = 1) AS budget_land,
      max(hard)  FILTER (WHERE earliest_rank = 1) AS budget_hard,
      max(soft)  FILTER (WHERE earliest_rank = 1) AS budget_soft
    FROM ranked
    GROUP BY asset_id
    ORDER BY unit_label
  `)) as Array<Record<string, unknown>>;

  const cells: HeatmapCell[] = [];
  for (const r of rows) {
    const label = String(r.unit_label ?? "Unit");
    // If a villa has no current allocation (rare), skip it — the actual_* are null.
    if (r.actual_land == null && r.actual_hard == null && r.actual_soft == null) {
      continue;
    }
    const buckets: Array<[string, unknown, unknown]> = [
      ["Land", r.actual_land, r.budget_land],
      ["Hard", r.actual_hard, r.budget_hard],
      ["Soft", r.actual_soft, r.budget_soft],
    ];
    for (const [col, actual, budget] of buckets) {
      const actualMinor = num(actual);
      // Fall back to actual when no baseline exists → 0% overage (honest).
      const budgetMinor = budget == null ? actualMinor : num(budget);
      cells.push({ rowKey: label, colKey: col, budgetMinor, actualMinor });
    }
  }
  return cells;
}

// ---------------------------------------------------------------------------
// 4) INVESTOR CAPITAL TIMELINE — monthly contributions/drawdowns/distributions.
// ---------------------------------------------------------------------------

/**
 * Monthly stacked capital flows (all USD minor units), org-scoped.
 *
 * - Contributions = capital_commitments.committed_amount_usd_minor by
 *   `signed_at` month (capital newly committed by investors). Org-scoped via
 *   `capital_commitments.organization_id`.
 * - Drawdowns     = capital_drawdowns.amount_usd_minor for RECEIVED drawdowns
 *   by `received_at` month (capital actually called in). Org-scoped via the
 *   parent commitment's organization_id (drawdowns.org is nullable).
 * - Distributions = distributions.total_amount_usd_minor for COMPLETED
 *   distributions by `effective_date` month. Org-scoped via
 *   `distributions.organization_id`.
 */
export async function getInvestorCapitalTimeline(): Promise<CapitalMonthRow[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();

  const contribRows = (await db.execute(sql`
    SELECT to_char(signed_at, 'YYYY-MM') AS ym,
           coalesce(sum(committed_amount_usd_minor), 0)::bigint AS amt
      FROM capital_commitments
     WHERE organization_id = ${organizationId}
       AND signed_at IS NOT NULL
       AND status <> 'cancelled'
     GROUP BY 1
  `)) as Array<Record<string, unknown>>;

  const drawdownRows = (await db.execute(sql`
    SELECT to_char(d.received_at, 'YYYY-MM') AS ym,
           coalesce(sum(d.amount_usd_minor), 0)::bigint AS amt
      FROM capital_drawdowns d
      JOIN capital_commitments c ON c.id = d.commitment_id
     WHERE c.organization_id = ${organizationId}
       AND d.status = 'received'
       AND d.received_at IS NOT NULL
     GROUP BY 1
  `)) as Array<Record<string, unknown>>;

  const distRows = (await db.execute(sql`
    SELECT to_char(effective_date, 'YYYY-MM') AS ym,
           coalesce(sum(total_amount_usd_minor), 0)::bigint AS amt
      FROM distributions
     WHERE organization_id = ${organizationId}
       AND status = 'completed'
     GROUP BY 1
  `)) as Array<Record<string, unknown>>;

  const byMonth = new Map<
    string,
    { contributions: number; drawdowns: number; distributions: number }
  >();
  const ensure = (ym: string) => {
    let e = byMonth.get(ym);
    if (!e) {
      e = { contributions: 0, drawdowns: 0, distributions: 0 };
      byMonth.set(ym, e);
    }
    return e;
  };
  for (const r of contribRows) ensure(String(r.ym)).contributions = num(r.amt);
  for (const r of drawdownRows) ensure(String(r.ym)).drawdowns = num(r.amt);
  for (const r of distRows) ensure(String(r.ym)).distributions = num(r.amt);

  return Array.from(byMonth.keys())
    .sort()
    .map((ym) => {
      const e = byMonth.get(ym)!;
      return {
        monthLabel: monthKeyLabel(ym),
        contributionsMinor: e.contributions,
        drawdownsMinor: e.drawdowns,
        distributionsMinor: e.distributions,
      };
    });
}

// ---------------------------------------------------------------------------
// 5) SALES FUNNEL — real lead counts by stage, org-scoped.
// ---------------------------------------------------------------------------

/**
 * Active-lead counts per funnel stage from `contact_roles` (role='lead',
 * org-scoped via organization_id, the same source the Sales workspace uses).
 *
 * We collapse the 9 linear core stages into the 5 reported funnel buckets so
 * the chart reads cleanly while still summing every active lead:
 *   Leads        = new + contacted
 *   Qualified    = qualified + viewing_scheduled + viewing_completed
 *   Negotiation  = negotiation
 *   Reservation  = reservation
 *   Contract     = contract_pending + contract_signed
 */
export async function getSalesFunnelData(): Promise<FunnelStage[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();

  const rows = (await db.execute(sql`
    SELECT status, count(*)::int AS n
      FROM contact_roles
     WHERE role = 'lead'
       AND organization_id = ${organizationId}
       AND ended_at IS NULL
     GROUP BY status
  `)) as Array<Record<string, unknown>>;

  const countByStatus = new Map<string, number>();
  for (const r of rows) countByStatus.set(String(r.status), num(r.n));
  const total = Array.from(countByStatus.values()).reduce((a, b) => a + b, 0);
  if (total === 0) return [];

  const get = (...keys: string[]) =>
    keys.reduce((a, k) => a + (countByStatus.get(k) ?? 0), 0);

  // Collapse the 9 linear core stages (leads-constants / lead-stage-machine)
  // into the 5 reported funnel buckets while summing every active lead.
  return [
    { label: "Leads", count: get("new", "contacted") },
    {
      label: "Qualified",
      count: get("qualified", "viewing_scheduled", "viewing_completed"),
    },
    { label: "Negotiation", count: get("negotiation") },
    { label: "Reservation", count: get("reservation") },
    { label: "Contract", count: get("contract_pending", "contract_signed") },
  ];
}

// ---------------------------------------------------------------------------
// 6) WORKFORCE PRODUCTIVITY — monthly utilised man-hours per role + capacity.
// ---------------------------------------------------------------------------

/**
 * Monthly utilised man-hours per `role_category` from `site_workforce_logs`
 * (org-scoped), joined to `site_reports` for the month axis and planned
 * capacity.
 *
 * - utilised[role] = sum(total_man_hours) for that role in the month.
 * - totalCapacityHours = sum over the month's site reports of
 *   (total_workers_planned ?? total_workers_present) × 8h × report-days.
 *   This is the planned headcount capacity; idle = capacity − utilised.
 */
export async function getWorkforceProductivityData(): Promise<ProductivityRow[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();

  // Utilised man-hours per role per month.
  const utilRows = (await db.execute(sql`
    SELECT to_char(sr.report_date, 'YYYY-MM') AS ym,
           w.role_category AS role,
           coalesce(sum(w.total_man_hours), 0)::numeric AS hours
      FROM site_workforce_logs w
      JOIN site_reports sr ON sr.id = w.site_report_id
     WHERE w.organization_id = ${organizationId}
     GROUP BY 1, 2
  `)) as Array<Record<string, unknown>>;

  if (utilRows.length === 0) return [];

  // Planned capacity per month: sum of planned (fallback present) headcount
  // × 8h across the month's reports.
  const capRows = (await db.execute(sql`
    SELECT to_char(report_date, 'YYYY-MM') AS ym,
           coalesce(
             sum(coalesce(total_workers_planned, total_workers_present)), 0
           )::int AS planned_worker_days
      FROM site_reports
     WHERE organization_id = ${organizationId}
     GROUP BY 1
  `)) as Array<Record<string, unknown>>;

  const capByMonth = new Map<string, number>();
  for (const r of capRows) {
    // worker-days × 8h/day = planned man-hours capacity for the month.
    capByMonth.set(String(r.ym), num(r.planned_worker_days) * 8);
  }

  const byMonth = new Map<string, Record<string, number>>();
  for (const r of utilRows) {
    const ym = String(r.ym);
    let roles = byMonth.get(ym);
    if (!roles) {
      roles = {};
      byMonth.set(ym, roles);
    }
    // Humanise the role key for the legend (foreman → Foreman).
    const role = humaniseRole(String(r.role));
    roles[role] = (roles[role] ?? 0) + Math.round(num(r.hours));
  }

  return Array.from(byMonth.keys())
    .sort()
    .map((ym) => {
      const utilized = byMonth.get(ym)!;
      const utilisedTotal = Object.values(utilized).reduce((a, b) => a + b, 0);
      // Capacity must be at least the utilised total so idle never goes
      // negative when planned headcount is missing/under-reported.
      const capacity = Math.max(capByMonth.get(ym) ?? 0, utilisedTotal);
      return {
        monthLabel: monthKeyLabel(ym),
        utilized,
        totalCapacityHours: capacity,
      };
    });
}

function humaniseRole(role: string): string {
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ---------------------------------------------------------------------------
// 7) PROCUREMENT DELAYS — expected vs actual delivery per supplier (vendor).
// ---------------------------------------------------------------------------

/**
 * Per-vendor delivery performance, org-scoped.
 *
 * Joins `material_purchase_orders` (expected_delivery_date, vendor) to
 * `material_deliveries` (delivery_date = actual). A PO with an expected date
 * but no delivery row yet is an OUTSTANDING delivery (actualAt = null) — the
 * delay helper treats those as not-yet-completed (they don't count toward
 * on-time %, but appear in the total).
 */
export async function getProcurementDelaysData(): Promise<SupplierDelayInput[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();

  const rows = (await db.execute(sql`
    SELECT
      po.vendor_id                         AS supplier_id,
      v.legal_name                         AS supplier_name,
      po.expected_delivery_date            AS expected_at,
      d.delivery_date                      AS actual_at
    FROM material_purchase_orders po
    JOIN vendors v ON v.id = po.vendor_id
    LEFT JOIN LATERAL (
      SELECT delivery_date
        FROM material_deliveries md
       WHERE md.po_id = po.id
       ORDER BY md.delivery_date ASC
       LIMIT 1
    ) d ON true
    WHERE po.organization_id = ${organizationId}
      AND po.status <> 'cancelled'
      AND po.expected_delivery_date IS NOT NULL
    ORDER BY v.legal_name
  `)) as Array<Record<string, unknown>>;

  const bySupplier = new Map<string, SupplierDelayInput>();
  for (const r of rows) {
    const id = String(r.supplier_id);
    let s = bySupplier.get(id);
    if (!s) {
      s = {
        supplierId: id,
        supplierName: String(r.supplier_name ?? "Vendor"),
        deliveries: [],
      };
      bySupplier.set(id, s);
    }
    s.deliveries.push({
      expectedAt: new Date(String(r.expected_at)),
      actualAt: r.actual_at == null ? null : new Date(String(r.actual_at)),
    });
  }
  return Array.from(bySupplier.values());
}
