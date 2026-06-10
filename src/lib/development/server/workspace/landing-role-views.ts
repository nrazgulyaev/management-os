import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";

/**
 * UNIT build-workspace-roleviews · landing role switcher — per-role reads.
 *
 * The `/development-os` landing carries a `?role=` chip row that swaps the
 * KPI strip + attention-feed composition (mock:
 * `cc-functional-handoff/cabinets/new/dev-workspace.html` §01/§02). Only
 * roles with REAL backing queries are listed here (honest UI):
 *
 *   - pm         → the portfolio reads the landing already makes
 *                  (`getDevPortfolioKpis`, `getRiskRadar`, `getLatestQsAnomaly`)
 *   - cfo        → `getCfoKpis` (cash / AR / AP / spend / burn)
 *   - warehouse  → `loadWarehouseCabinet` (inbound POs / stock / movements)
 *   - supervisor → the org-scoped site snapshot below + the org-scoped
 *                  `listSafetyIncidents` / `listRecentSiteReports` readers
 *
 * QS / procurement / marketing / sales / admin are intentionally ABSENT
 * from the chip row until their cabinet queries expose landing-grade
 * KPIs — no empty shells. Role choice is `?role=` searchParam-only (no
 * cookie-persistence pattern exists in the dev app to reuse).
 */

export const LANDING_ROLES = ["pm", "cfo", "warehouse", "supervisor"] as const;
export type LandingRoleKey = (typeof LANDING_ROLES)[number];

export const LANDING_ROLE_META: Record<
  LandingRoleKey,
  { label: string; lens: string }
> = {
  pm: {
    label: "PM",
    lens: "Schedule, cost variance and site blockers across the portfolio.",
  },
  cfo: {
    label: "CFO",
    lens: "Cash, receivables, payables and burn — cost anomaly leads the feed.",
  },
  warehouse: {
    label: "Warehouse",
    lens: "Inbound deliveries, stock alerts and today's inventory movements.",
  },
  supervisor: {
    label: "Site supervisor",
    lens: "Today's site reports, open safety incidents and QA/QC issues.",
  },
};

/** Parse the `?role=` searchParam — unknown / absent values fall back to PM. */
export function parseLandingRole(
  value: string | string[] | undefined,
): LandingRoleKey {
  const v = Array.isArray(value) ? value[0] : value;
  return (LANDING_ROLES as readonly string[]).includes(v ?? "")
    ? (v as LandingRoleKey)
    : "pm";
}

export interface SupervisorLandingSnapshot {
  siteReportsToday: number;
  openSafetyIncidents: number;
  openQaQcIssues: number;
}

/**
 * Org-scoped counts for the supervisor KPI strip. The cabinet's
 * `loadSiteSupervisorCabinet` is keyed to a single user (assigned-to-me)
 * and predates the tenancy sweep, so the landing uses this org-wide,
 * org-scoped aggregate instead. Read-only — no audit entry.
 */
export async function getSupervisorLandingSnapshot(): Promise<SupervisorLandingSnapshot> {
  const empty: SupervisorLandingSnapshot = {
    siteReportsToday: 0,
    openSafetyIncidents: 0,
    openQaQcIssues: 0,
  };
  const db = getDb();
  if (!db) return empty;
  const orgId = await requireOrgId();
  const rows = await db.execute<{
    today_reports: string;
    open_incidents: string;
    open_qaqc: string;
  }>(sql`
    SELECT
      (SELECT COUNT(*)::text FROM site_reports
        WHERE organization_id = ${orgId}
          AND report_date = CURRENT_DATE) AS today_reports,
      (SELECT COUNT(*)::text FROM safety_incidents
        WHERE organization_id = ${orgId}
          AND status IN ('open','under_investigation')) AS open_incidents,
      (SELECT COUNT(*)::text FROM qa_qc_issues
        WHERE organization_id = ${orgId}
          AND status IN ('open','in_progress','assigned')) AS open_qaqc
  `);
  const r = rowsOf<{
    today_reports: string;
    open_incidents: string;
    open_qaqc: string;
  }>(rows)[0];
  if (!r) return empty;
  return {
    siteReportsToday: Number(r.today_reports ?? "0"),
    openSafetyIncidents: Number(r.open_incidents ?? "0"),
    openQaQcIssues: Number(r.open_qaqc ?? "0"),
  };
}
