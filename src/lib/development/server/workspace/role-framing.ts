/**
 * UNIT build-workspace-roleviews — workspace role-framing (pure helpers).
 *
 * No I/O, no `import "server-only"` — runtime testable. These helpers
 * decide HOW the workspace command-center's shared reads (risk radar,
 * portfolio KPIs, latest QS anomaly, projects rollup) are *scoped,
 * ordered and framed* for a given RBAC role. They do NOT fetch
 * anything and they do NOT own access control — RLS + the layout's
 * `enforceProductAccess` guard remain the authorisation boundary.
 *
 * The role set is driven from the canonical RBAC config
 * (`VALID_CABINET_ROLES` in `@/features/team/role-keys`), so `[role]`
 * is enumerable from one source of truth and never fabricated.
 */

import {
  VALID_CABINET_ROLES,
  type CabinetRoleKey,
} from "@/features/team/role-keys";
import { ROLE_DESCRIPTIONS } from "@/features/team/role-descriptions";

export { VALID_CABINET_ROLES };
export type { CabinetRoleKey };

/** Which of the six portfolio KPIs a role leads with, in priority order.
 *  Keys map to `PortfolioKpis` fields; the workspace role view renders
 *  the leading KPIs first and tones them per role concern. */
export type KpiKey =
  | "activeProjects"
  | "activeVillas"
  | "bookingsThisMonth"
  | "openRisks"
  | "openWorkPackages"
  | "recentSiteReports";

export interface RoleFraming {
  /** Title-cased role label (from the shared role catalog). */
  label: string;
  /** One-line summary of the workspace lens for this role. */
  blurb: string;
  /** KPI keys in the order this role cares about them (most-critical first). */
  kpiOrder: KpiKey[];
  /** Attention-feed lens copy shown above the role's feed. */
  attentionLens: string;
  /**
   * Whether this role leads with the QS cost anomaly band. QS, PM, CFO,
   * procurement + exec/admin care about cost variance; site / sales /
   * marketing / warehouse do not, so the anomaly drops to the tail for
   * them (still surfaced — never hidden).
   */
  leadsWithAnomaly: boolean;
}

const DEFAULT_KPI_ORDER: KpiKey[] = [
  "activeProjects",
  "openRisks",
  "openWorkPackages",
  "recentSiteReports",
  "bookingsThisMonth",
  "activeVillas",
];

/**
 * Per-role framing. Every key in `VALID_CABINET_ROLES` MUST appear here
 * — the `Record<CabinetRoleKey, …>` type makes a missing role a compile
 * error, so adding a role to the RBAC config forces a framing decision.
 */
const ROLE_FRAMING: Record<CabinetRoleKey, Omit<RoleFraming, "label" | "blurb">> = {
  admin: {
    kpiOrder: [
      "activeProjects",
      "openRisks",
      "openWorkPackages",
      "recentSiteReports",
      "bookingsThisMonth",
      "activeVillas",
    ],
    attentionLens: "Everything that needs a decision, portfolio-wide.",
    leadsWithAnomaly: true,
  },
  executive_ceo: {
    kpiOrder: [
      "activeProjects",
      "openRisks",
      "bookingsThisMonth",
      "activeVillas",
      "openWorkPackages",
      "recentSiteReports",
    ],
    attentionLens: "Portfolio risk + the few items at exec altitude.",
    leadsWithAnomaly: true,
  },
  cfo_accountant: {
    kpiOrder: [
      "bookingsThisMonth",
      "openRisks",
      "activeProjects",
      "activeVillas",
      "openWorkPackages",
      "recentSiteReports",
    ],
    attentionLens: "Money-shaped risks: cost variance, capital, cashflow.",
    leadsWithAnomaly: true,
  },
  project_manager: {
    kpiOrder: [
      "openWorkPackages",
      "openRisks",
      "recentSiteReports",
      "activeProjects",
      "bookingsThisMonth",
      "activeVillas",
    ],
    attentionLens: "Schedule, cost variance and site blockers across your projects.",
    leadsWithAnomaly: true,
  },
  qs_analyst: {
    kpiOrder: [
      "openWorkPackages",
      "openRisks",
      "activeProjects",
      "recentSiteReports",
      "activeVillas",
      "bookingsThisMonth",
    ],
    attentionLens: "BOQ variance + cost risk, anomaly-led.",
    leadsWithAnomaly: true,
  },
  procurement_manager: {
    kpiOrder: [
      "openWorkPackages",
      "openRisks",
      "activeProjects",
      "recentSiteReports",
      "activeVillas",
      "bookingsThisMonth",
    ],
    attentionLens: "Open packages, awards and supply-side risk.",
    leadsWithAnomaly: true,
  },
  warehouse_manager: {
    kpiOrder: [
      "openWorkPackages",
      "recentSiteReports",
      "activeProjects",
      "openRisks",
      "activeVillas",
      "bookingsThisMonth",
    ],
    attentionLens: "Receiving, stock and on-site material flow.",
    leadsWithAnomaly: false,
  },
  site_supervisor: {
    kpiOrder: [
      "recentSiteReports",
      "openWorkPackages",
      "openRisks",
      "activeProjects",
      "activeVillas",
      "bookingsThisMonth",
    ],
    attentionLens: "Today's site activity, blockers and safety.",
    leadsWithAnomaly: false,
  },
  sales_manager: {
    kpiOrder: [
      "bookingsThisMonth",
      "activeProjects",
      "activeVillas",
      "openRisks",
      "openWorkPackages",
      "recentSiteReports",
    ],
    attentionLens: "Pipeline, contracts and anything blocking a close.",
    leadsWithAnomaly: false,
  },
  marketing_staff: {
    kpiOrder: [
      "bookingsThisMonth",
      "activeProjects",
      "activeVillas",
      "openRisks",
      "openWorkPackages",
      "recentSiteReports",
    ],
    attentionLens: "Demand signals and anything that affects launch.",
    leadsWithAnomaly: false,
  },
};

/** Type guard — is `value` a known RBAC role key? Drives `notFound()`. */
export function isCabinetRoleKey(value: string): value is CabinetRoleKey {
  return (VALID_CABINET_ROLES as readonly string[]).includes(value);
}

/** Resolve the full framing for a role (label + blurb from the shared
 *  catalog, ordering from this module). */
export function getRoleFraming(role: CabinetRoleKey): RoleFraming {
  const base = ROLE_FRAMING[role];
  const desc = ROLE_DESCRIPTIONS[role];
  return {
    label: desc?.label ?? role,
    blurb: desc?.blurb ?? "",
    kpiOrder: base.kpiOrder.length > 0 ? base.kpiOrder : DEFAULT_KPI_ORDER,
    attentionLens: base.attentionLens,
    leadsWithAnomaly: base.leadsWithAnomaly,
  };
}

export interface RoleSummary {
  role: CabinetRoleKey;
  label: string;
  blurb: string;
  /** First three KPI keys — the mobile-strip / role-card "kpi-line". */
  leadKpis: KpiKey[];
}

/** The full enumerable role list for the role-grid index + drives the
 *  `generateStaticParams`-style enumeration of `[role]`. */
export function listRoleSummaries(): RoleSummary[] {
  return VALID_CABINET_ROLES.map((role) => {
    const f = getRoleFraming(role);
    return {
      role,
      label: f.label,
      blurb: f.blurb,
      leadKpis: f.kpiOrder.slice(0, 3),
    };
  });
}

/** Human-readable label for a KPI key (used in role-card kpi-lines). */
export const KPI_LABEL: Record<KpiKey, string> = {
  activeProjects: "active projects",
  activeVillas: "villas",
  bookingsThisMonth: "bookings · MTD",
  openRisks: "open risks",
  openWorkPackages: "open packages",
  recentSiteReports: "site reports",
};
