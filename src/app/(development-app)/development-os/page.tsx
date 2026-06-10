import Link from "next/link";
import { RecentDigestsTile } from "@/components/digests/recent-digests-tile";
import {
  Kpi,
  SectionHeading,
  Card,
  HandoffBadge,
} from "@/components/dashboard/primitives";
import { mapPoolAll } from "@/lib/db/map-pool";
import {
  getActiveProjectsRollup,
  getTeamRoster,
  getLatestQsAnomaly,
  getRiskRadar,
  getSiteActivityFeed,
  getDevPortfolioKpis,
} from "@/lib/development/server/cabinets/dev-overview-queries";
import { getCfoKpis } from "@/lib/development/server/cabinets/cfo-cabinet-queries";
import { loadWarehouseCabinet } from "@/lib/development/server/cabinets/warehouse-cabinet-queries";
import {
  listRecentSiteReports,
  listSafetyIncidents,
  type SiteReportRow,
  type SafetyIncidentRow,
} from "@/lib/development/server/cabinets/site-supervisor-cabinet-queries";
import {
  LANDING_ROLES,
  LANDING_ROLE_META,
  parseLandingRole,
  getSupervisorLandingSnapshot,
  type SupervisorLandingSnapshot,
} from "@/lib/development/server/workspace/landing-role-views";
import { usdCompact } from "@/lib/development/server/workspace/usd-format";

/**
 * Sprint TASK-7-DATA-PART-2 — Dev OS Overview / Command Center live wiring.
 *
 * Visual port from `_handoff/development/index.html` (TASK-7-VISUAL,
 * commit `316dc65`); this commit replaces the four mock arrays with
 * live, org-scoped reads in
 * `src/lib/development/server/cabinets/dev-overview-queries.ts`:
 *
 *   - mockPROJECTS       → getActiveProjectsRollup()  (projects + villa count)
 *   - mockSTAFF          → getTeamRoster()            (org's active app_users)
 *   - qs-cost AI band    → getLatestQsAnomaly()       (last agent_outputs run)
 *   - mockRISK_RADAR     → empty state (no risk model schema yet)
 *   - mockSITE_ACTIVITY  → empty state (site events schema in PART-3)
 *
 * Pixel-dev-workspace — restyled to the `cabinets/new/dev-workspace.html`
 * "Hero · PM" workspace mock (page header · 5-KPI hero strip · AI band ·
 * 1.5fr/1fr attention-feed + AI-agents grid · cabinet-map projects rollup ·
 * team grid). Every read + prop above is preserved; only the layout, copy
 * and density move onto the Dev OS engineering palette + design-system
 * primitives.
 */

export const metadata = { title: "Development OS · Command center" };
export const dynamic = "force-dynamic";

const STAGE_BADGE: Record<string, string> = {
  active: "active",
  planning: "planning",
  under_construction: "construction",
  managed: "managed",
};

const ROLE_DISPLAY: Record<string, string> = {
  super_admin: "Super admin",
  operator: "Operator",
  director: "Director",
  finance_manager: "Finance Manager",
  project_manager: "Project Manager",
  site_supervisor: "Site Supervisor",
  qs: "QS / Cost Analyst",
  procurement_manager: "Procurement",
  marketing_staff: "Marketing",
  sales_manager: "Sales Manager",
};

type AttnTone = "urgent" | "warn" | "info";

function attnAccentClass(tone: AttnTone): string {
  return tone === "urgent"
    ? "border-l-[3px] border-l-danger"
    : tone === "warn"
      ? "border-l-[3px] border-l-warning"
      : "border-l-[3px] border-l-amber";
}

function attnIconClass(tone: AttnTone): string {
  return tone === "urgent"
    ? "bg-danger-weak text-danger"
    : tone === "warn"
      ? "bg-warning-weak text-warning"
      : "bg-accent-weak text-amber";
}

export default async function DevelopmentOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  // Role switcher (mock §01/§02) — `?role=` searchParam, default PM. Only
  // roles with real backing queries are in `LANDING_ROLES`; no cookie
  // persistence (no such pattern exists in the dev app to reuse).
  const role = parseLandingRole((await searchParams).role);

  const [projects, team, latestAnomaly, risks, siteActivity, kpis] = await mapPoolAll([
    () => getActiveProjectsRollup().catch(() => []),
    () => getTeamRoster().catch(() => []),
    () => getLatestQsAnomaly().catch(() => null),
    () => getRiskRadar(5).catch(() => []),
    () => getSiteActivityFeed(6).catch(() => []),
    () => getDevPortfolioKpis().catch(() => null),
  ] as const, 4);

  // Role-specific reads — fetched only for the active lens, reusing the
  // existing cabinet queries read-only (CFO money strip, warehouse
  // dock/stock strip, supervisor site snapshot).
  const cfoKpis = role === "cfo" ? await getCfoKpis().catch(() => null) : null;
  const warehouse =
    role === "warehouse" ? await loadWarehouseCabinet().catch(() => null) : null;
  let supervisorSnapshot: SupervisorLandingSnapshot | null = null;
  let safetyIncidents: SafetyIncidentRow[] = [];
  let recentSiteReports: SiteReportRow[] = [];
  if (role === "supervisor") {
    [supervisorSnapshot, safetyIncidents, recentSiteReports] = await mapPoolAll(
      [
        () => getSupervisorLandingSnapshot().catch(() => null),
        () => listSafetyIncidents(8).catch(() => []),
        () => listRecentSiteReports(4).catch(() => []),
      ] as const,
      3,
    );
  }

  const totalVillas = projects.reduce((s, p) => s + p.villaCount, 0);
  const projectCount = projects.length;

  // Compose the role-aware "attention feed" (mock §02 — the composition
  // swaps per role, never just re-sorts). PM/CFO read the live risk
  // register + most recent QS anomaly; warehouse reads stock alerts +
  // inbound POs + recent movements; supervisor reads open safety
  // incidents + recent site reports. Pure shaping of already-fetched
  // role data — no extra reads here.
  const attentionItems: {
    key: string;
    tone: AttnTone;
    icon: string;
    title: string;
    meta: string;
    href: string;
  }[] = [];

  if (role === "warehouse" && warehouse) {
    if (warehouse.zeroStockItemsCount > 0) {
      attentionItems.push({
        key: "zero-stock",
        tone: "urgent",
        icon: "!",
        title: `${warehouse.zeroStockItemsCount} SKU${warehouse.zeroStockItemsCount === 1 ? "" : "s"} at zero stock`,
        meta: "stock balances · picks blocked",
        href: "/development-os/inventory/items",
      });
    }
    if (warehouse.lowStockItemsCount > 0) {
      attentionItems.push({
        key: "low-stock",
        tone: "warn",
        icon: "∇",
        title: `${warehouse.lowStockItemsCount} SKU${warehouse.lowStockItemsCount === 1 ? "" : "s"} at/below reorder point`,
        meta: "reorder point breached",
        href: "/development-os/inventory/items",
      });
    }
    if (warehouse.pendingDeliveriesCount > 0) {
      attentionItems.push({
        key: "inbound-pos",
        tone: "info",
        icon: "⇣",
        title: `${warehouse.pendingDeliveriesCount} purchase order${warehouse.pendingDeliveriesCount === 1 ? "" : "s"} inbound`,
        meta: "ordered + partially delivered",
        href: "/development-os/inventory/receiving",
      });
    }
    for (const m of warehouse.recentMovements.slice(0, 3)) {
      attentionItems.push({
        key: m.id,
        tone: "info",
        icon: "✦",
        title: `${m.movementType.replace(/_/g, " ")} · ${m.itemName ?? "item"}`,
        meta: `qty ${m.quantity} · ${m.movementDate}`,
        href: "/development-os/inventory/movements",
      });
    }
  } else if (role === "supervisor") {
    const openIncidents = safetyIncidents.filter(
      (i) => i.status === "open" || i.status === "under_investigation",
    );
    for (const i of openIncidents) {
      const tone: AttnTone =
        i.severity === "fatal" || i.severity === "severe"
          ? "urgent"
          : i.severity === "moderate"
            ? "warn"
            : "info";
      attentionItems.push({
        key: i.id,
        tone,
        icon: tone === "urgent" ? "!" : tone === "warn" ? "∇" : "✦",
        title: `${i.projectCode ? `${i.projectCode} · ` : ""}${i.description}`,
        meta: `${i.incidentCode} · ${i.severity} · ${i.category.replace(/_/g, " ")} · ${i.incidentDate}`,
        href: "/development-os/safety",
      });
    }
    for (const rpt of recentSiteReports.slice(0, 3)) {
      attentionItems.push({
        key: rpt.id,
        tone: "info",
        icon: "✦",
        title: `${rpt.projectCode ? `${rpt.projectCode} · ` : ""}${rpt.summary ?? "Site report filed"}`,
        meta: `${rpt.reportDate} · ${rpt.reporterName ?? "—"} · ${rpt.workersPresent} workers`,
        href: `/development-os/site-reports/${rpt.id}`,
      });
    }
  } else {
    // PM (default) + CFO — cost anomaly leads, then the risk register
    // mapped impact → urgent/warn/info, urgency-sorted like the mock.
    if (latestAnomaly) {
      attentionItems.push({
        key: "anomaly",
        tone: "info",
        icon: "★",
        title: latestAnomaly.title,
        meta: `qs-cost-analyst · ${latestAnomaly.outputCode}`,
        href: "/development-os/ai-agents/qs-cost-analyst",
      });
    }

    for (const r of risks) {
      const tone: AttnTone =
        r.impact === "severe" || r.impact === "catastrophic"
          ? "urgent"
          : r.impact === "major"
            ? "warn"
            : "info";
      attentionItems.push({
        key: r.riskId,
        tone,
        icon: tone === "urgent" ? "!" : tone === "warn" ? "∇" : "✦",
        title: `${r.projectCode ? `${r.projectCode} · ` : ""}${r.title}`,
        meta: `${r.category.replace(/_/g, " ")} · ${r.probability} × ${r.impact} = ${r.riskScore}`,
        href: "/development-os/risk-radar",
      });
    }
  }

  return (
    <>
      {/* Page header — mock `.page-h` (greeting eyebrow · amber-em headline ·
          sub-line · action cluster). Preserves the disabled digest CTA +
          New-project link. */}
      <SectionHeading
        eyebrow={
          projectCount === 0
            ? "Command center"
            : `Command center · ${projectCount} ${projectCount === 1 ? "project" : "projects"}`
        }
        title={
          <>
            {projectCount === 0 ? "No projects yet." : `${projectCount} project${projectCount === 1 ? "" : "s"} in motion.`}{" "}
            {projectCount > 0 && (
              <em>{attentionItems.length} need you.</em>
            )}
          </>
        }
        subtitle="Live counts from the active projects table. Risk radar and site activity feeds populate as project data accumulates."
        actions={
          <>
            <Link
              href="/development-os/workspace/role"
              className="btn btn-dark btn-sm"
            >
              Role views
            </Link>
            <button
              className="btn btn-dark btn-sm opacity-55 cursor-not-allowed"
              disabled
              title="Coming soon"
            >
              Daily digest PDF ↓
            </button>
            <Link
              href="/development-os/projects/new"
              className="btn btn-amber btn-sm"
            >
              New project +
            </Link>
          </>
        }
      />

      {/* Role switcher — chip row driven by `?role=` (mock §02 role
          variants: "same workspace shell, different KPIs"). Only roles
          with real backing queries render a chip; the choice swaps the
          KPI strip + attention-feed composition below. */}
      <div className="flex flex-wrap items-center gap-2 mb-[14px]">
        <span className="mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
          Acting as
        </span>
        {LANDING_ROLES.map((r) => (
          <Link
            key={r}
            href={r === "pm" ? "/development-os" : `/development-os?role=${r}`}
            className={"btn btn-sm " + (r === role ? "btn-amber" : "btn-dark")}
            aria-current={r === role ? "page" : undefined}
          >
            {LANDING_ROLE_META[r].label}
          </Link>
        ))}
      </div>

      {/* KPI hero strip — role-tuned figures (mock `.kpi-hero`): PM =
          portfolio/schedule, CFO = money, warehouse = dock/stock,
          supervisor = site/safety. */}
      {role === "cfo" ? (
        <div className="grid grid-cols-2 min-[600px]:grid-cols-3 min-[900px]:grid-cols-5 gap-3.5 mb-[18px]">
          <Kpi
            label="Cash on hand"
            value={usdCompact(cfoKpis?.cashOnHandMinor)}
            sub="latest snapshot"
            tone={cfoKpis && cfoKpis.cashOnHandMinor > 0 ? "success" : undefined}
          />
          <Kpi
            label="Receivables"
            value={usdCompact(cfoKpis?.receivablesMinor)}
            sub="outstanding AR"
            tone={cfoKpis && cfoKpis.receivablesMinor > 0 ? "accent" : undefined}
          />
          <Kpi
            label="Payables · 30d"
            value={usdCompact(cfoKpis?.payablesNext30Minor)}
            sub="due next 30 days"
            tone={cfoKpis && cfoKpis.payablesNext30Minor > 0 ? "warn" : undefined}
          />
          <Kpi
            label="Spend · MTD"
            value={usdCompact(cfoKpis?.spendMtdMinor)}
            sub="outflows this month"
          />
          <Kpi
            label="Burn · 30d"
            value={usdCompact(cfoKpis?.forecastBurn30dMinor)}
            sub="trailing 30-day outflow"
          />
        </div>
      ) : role === "warehouse" ? (
        <div className="grid grid-cols-2 min-[600px]:grid-cols-3 min-[900px]:grid-cols-5 gap-3.5 mb-[18px]">
          <Kpi
            label="Inbound POs"
            value={
              warehouse && warehouse.pendingDeliveriesCount > 0
                ? String(warehouse.pendingDeliveriesCount)
                : "—"
            }
            sub="ordered + partially delivered"
            tone={
              warehouse && warehouse.pendingDeliveriesCount > 0
                ? "accent"
                : undefined
            }
          />
          <Kpi
            label="Low stock"
            value={
              warehouse && warehouse.lowStockItemsCount > 0
                ? String(warehouse.lowStockItemsCount)
                : "—"
            }
            sub="at/below reorder point"
            tone={
              warehouse && warehouse.lowStockItemsCount > 0 ? "warn" : undefined
            }
          />
          <Kpi
            label="Zero stock"
            value={
              warehouse && warehouse.zeroStockItemsCount > 0
                ? String(warehouse.zeroStockItemsCount)
                : "—"
            }
            sub="stock balances"
            tone={
              warehouse && warehouse.zeroStockItemsCount > 0
                ? "danger"
                : undefined
            }
          />
          <Kpi
            label="Movements · today"
            value={
              warehouse && warehouse.todayMovementsCount > 0
                ? String(warehouse.todayMovementsCount)
                : "—"
            }
            sub="inventory movements"
          />
          <Kpi
            label="Active SKUs"
            value={
              warehouse && warehouse.totalSkuCount > 0
                ? String(warehouse.totalSkuCount)
                : "—"
            }
            sub="inventory items"
          />
        </div>
      ) : role === "supervisor" ? (
        <div className="grid grid-cols-2 min-[600px]:grid-cols-3 min-[900px]:grid-cols-5 gap-3.5 mb-[18px]">
          <Kpi
            label="Site reports · today"
            value={
              supervisorSnapshot && supervisorSnapshot.siteReportsToday > 0
                ? String(supervisorSnapshot.siteReportsToday)
                : "—"
            }
            sub="filed today"
            tone={
              supervisorSnapshot && supervisorSnapshot.siteReportsToday > 0
                ? "accent"
                : undefined
            }
          />
          <Kpi
            label="Site reports · 14d"
            value={
              kpis && kpis.recentSiteReports > 0
                ? String(kpis.recentSiteReports)
                : "—"
            }
            sub="recent jobsite activity"
          />
          <Kpi
            label="Open incidents"
            value={
              supervisorSnapshot && supervisorSnapshot.openSafetyIncidents > 0
                ? String(supervisorSnapshot.openSafetyIncidents)
                : "—"
            }
            sub="safety register"
            tone={
              supervisorSnapshot && supervisorSnapshot.openSafetyIncidents > 0
                ? "danger"
                : undefined
            }
          />
          <Kpi
            label="Open QA/QC"
            value={
              supervisorSnapshot && supervisorSnapshot.openQaQcIssues > 0
                ? String(supervisorSnapshot.openQaQcIssues)
                : "—"
            }
            sub="open + assigned + in-progress"
            tone={
              supervisorSnapshot && supervisorSnapshot.openQaQcIssues > 0
                ? "warn"
                : undefined
            }
          />
          <Kpi
            label="Open work packages"
            value={
              kpis && kpis.openWorkPackages > 0
                ? String(kpis.openWorkPackages)
                : "—"
            }
            sub="planned + in-progress"
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 min-[600px]:grid-cols-3 min-[900px]:grid-cols-5 gap-3.5 mb-[18px]">
          <Kpi
            label="Active projects"
            value={kpis && kpis.activeProjects > 0 ? String(kpis.activeProjects) : "—"}
            sub={kpis && kpis.activeVillas > 0 ? `${kpis.activeVillas} villas in portfolio` : "create your first"}
            tone={kpis && kpis.activeProjects > 0 ? "accent" : undefined}
          />
          <Kpi
            label="Bookings · MTD"
            value={kpis && kpis.bookingsThisMonth > 0 ? String(kpis.bookingsThisMonth) : "—"}
            sub="this month"
          />
          <Kpi
            label="Open work packages"
            value={kpis && kpis.openWorkPackages > 0 ? String(kpis.openWorkPackages) : "—"}
            sub="planned + in-progress"
          />
          <Kpi
            label="Open risks"
            value={kpis && kpis.openRisks > 0 ? String(kpis.openRisks) : "—"}
            sub="project_risks register"
            tone={kpis && kpis.openRisks > 0 ? "warn" : undefined}
          />
          <Kpi
            label="Site reports · 14d"
            value={kpis && kpis.recentSiteReports > 0 ? String(kpis.recentSiteReports) : "—"}
            sub="recent jobsite activity"
          />
        </div>
      )}

      {/* Main grid — mock `.main-grid` (1.5fr attention feed · 1fr rail). */}
      <div className="grid grid-cols-[1.5fr_1fr] gap-[18px] mb-[18px] max-[900px]:grid-cols-1">
        {/* Attention feed — composed from live risks + latest anomaly. */}
        <div>
          <h2 className="display text-[22px] font-normal text-ink m-0 mb-1">
            {attentionItems.length === 0 ? (
              "Nothing needs you"
            ) : (
              <>
                <em>{attentionItems.length} attention</em> ·{" "}
                {LANDING_ROLE_META[role].label} view
              </>
            )}
          </h2>
          <p className="mono text-[11px] text-ink-3 m-0 mb-3">
            {LANDING_ROLE_META[role].lens}
          </p>
          {attentionItems.length === 0 ? (
            <Card className="p-5">
              <p className="text-[13px] text-ink-3 italic m-0">
                {role === "warehouse"
                  ? "No stock alerts, inbound POs or recent movements. Items surface here as inventory activity accumulates."
                  : role === "supervisor"
                    ? "No open safety incidents or recent site reports. Items surface here as supervisors file reports."
                    : "No open risks or anomaly runs. Items surface here automatically as the risk register and QS agents populate."}
              </p>
            </Card>
          ) : (
            <div className="flex flex-col gap-2.5">
              {attentionItems.map((a) => (
                <Link
                  key={a.key}
                  href={a.href}
                  className={
                    "card grid grid-cols-[32px_1fr_auto] gap-3 items-center px-4 py-3.5 no-underline " +
                    attnAccentClass(a.tone)
                  }
                >
                  <span
                    className={
                      "w-8 h-8 rounded-lg inline-flex items-center justify-center display text-[15px] " +
                      attnIconClass(a.tone)
                    }
                  >
                    {a.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-medium text-ink truncate">
                      {a.title}
                    </span>
                    <span className="block mono text-[10.5px] text-ink-3 mt-0.5 truncate">
                      {a.meta}
                    </span>
                  </span>
                  <span className="text-ink-4" aria-hidden>
                    →
                  </span>
                </Link>
              ))}
            </div>
          )}

          {/* Site activity · recent — kept live, restyled below the feed. */}
          <Card className="p-5 mt-[18px]">
            <h3 className="display text-[18px] font-normal text-ink m-0">
              Site activity · recent
            </h3>
            {siteActivity.length === 0 ? (
              <p className="mt-3.5 text-[13px] text-ink-3 italic">
                No site reports yet. Daily activity surfaces here once
                supervisors file their first log.
              </p>
            ) : (
              <ul className="clean mt-3.5">
                {siteActivity.map((a, i) => (
                  <li key={`${a.occurredAt}-${i}`}>
                    <span className="mono text-[10px] text-ink-3 w-16">
                      {a.occurredAt}
                    </span>
                    <div className="flex-1">
                      <div className="text-[12.5px] font-medium text-ink">
                        {a.projectCode ? `${a.projectCode} · ` : ""}
                        {a.summary}
                      </div>
                      <div className="mono text-[10px] text-ink-3">
                        {a.authorName ?? "—"}
                        {a.workersPresent > 0 ? ` · ${a.workersPresent} workers` : ""}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Right rail — AI agent band (live qs-cost-analyst) + recent digests. */}
        <div className="flex flex-col gap-[18px]">
          <Card className="corner-marks p-4 border-amber">
            <h3 className="display text-[18px] font-normal text-ink m-0 mb-2.5 flex items-baseline">
              <em>AI agents</em>
              <span className="ml-auto mono text-[10px] text-ink-3">
                qs-cost-analyst
              </span>
            </h3>
            {latestAnomaly ? (
              <>
                <div className="label text-amber">
                  {latestAnomaly.outputCode} ·{" "}
                  {new Date(latestAnomaly.createdAt).toLocaleString()}
                </div>
                <p className="mt-2 mb-3.5 text-[14px] leading-[1.55] text-ink">
                  <strong>{latestAnomaly.title}</strong>
                  <br />
                  <span className="text-ink-2">{latestAnomaly.summary}</span>
                </p>
                <Link
                  href="/development-os/ai-agents/qs-cost-analyst"
                  className="btn btn-amber btn-sm"
                >
                  Open run →
                </Link>
              </>
            ) : (
              <>
                <p className="mt-2 mb-3.5 text-[14px] leading-[1.55] text-ink">
                  No anomaly runs yet — the qs-cost-analyst agent surfaces here
                  the first time it catches a BOQ line outside its baseline.
                </p>
                <Link
                  href="/development-os/ai-agents"
                  className="btn btn-dark btn-sm"
                >
                  Configure agent
                </Link>
              </>
            )}
          </Card>

          {/* DAILY-DIGEST-SPRINT-1 P4.4 — Recent digests tile */}
          <RecentDigestsTile basePath="/development-os/agent-digests" />
        </div>
      </div>

      {/* Cabinet map — projects rollup (mock `.cab-map`). */}
      <Card padding="none" overflowHidden className="mb-[18px]">
        <div className="px-[22px] py-3.5 border-b border-line flex items-center bg-muted">
          <h2 className="display text-[20px] font-normal text-ink m-0">
            Projects · {projectCount} active
          </h2>
          {projectCount > 0 && (
            <span className="mono ml-auto text-[11px] text-ink-3">
              {totalVillas} VILLAS · {projectCount} {projectCount === 1 ? "PROJECT" : "PROJECTS"}
            </span>
          )}
        </div>
        {projectCount === 0 ? (
          <p className="p-5 text-[13px] text-ink-3 italic">
            No active projects. Create one to start the portfolio rollup.
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Project</th>
                <th>Code</th>
                <th className="num">Villas</th>
                <th>Stage</th>
                <th>Mgmt status</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.projectId}>
                  <td className="display font-medium text-ink">
                    <Link
                      href={`/development-os/workspace/project/${p.projectId}`}
                      className="hover:underline"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="mono">{p.projectCode}</td>
                  <td className="num">{p.villaCount}</td>
                  <td>
                    <HandoffBadge>{STAGE_BADGE[p.status] ?? p.status}</HandoffBadge>
                  </td>
                  <td>
                    <HandoffBadge>{p.managementStatus}</HandoffBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Team grid — live app_users (mock role/team cards). */}
      <Card padding="none" overflowHidden>
        <div className="px-[22px] py-3.5 border-b border-line bg-muted">
          <h2 className="display text-[20px] font-normal text-ink m-0">
            Team · {team.length} {team.length === 1 ? "member" : "members"}
          </h2>
        </div>
        {team.length === 0 ? (
          <p className="p-5 text-[13px] text-ink-3 italic">
            No active team members. Invite users to populate the roster.
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-3.5 p-5 max-[900px]:grid-cols-2 max-[600px]:grid-cols-1">
            {team.map((p) => (
              <div
                key={p.userId}
                className="flex items-center gap-2.5 px-3 py-2.5 border border-line rounded-[10px] bg-bg-3"
              >
                <div className="w-9 h-9 rounded-full bg-amber text-carbon flex items-center justify-center text-[12px] font-semibold display">
                  {p.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-ink truncate">{p.fullName}</div>
                  <div className="mono text-[10px] text-ink-3 truncate">
                    {p.primaryRole ? ROLE_DISPLAY[p.primaryRole] ?? p.primaryRole : p.email}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
