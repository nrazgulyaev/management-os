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

export default async function DevelopmentOverviewPage() {
  const [projects, team, latestAnomaly, risks, siteActivity, kpis] = await mapPoolAll([
    () => getActiveProjectsRollup().catch(() => []),
    () => getTeamRoster().catch(() => []),
    () => getLatestQsAnomaly().catch(() => null),
    () => getRiskRadar(5).catch(() => []),
    () => getSiteActivityFeed(6).catch(() => []),
    () => getDevPortfolioKpis().catch(() => null),
  ] as const, 4);

  const totalVillas = projects.reduce((s, p) => s + p.villaCount, 0);
  const projectCount = projects.length;

  return (
    <>
      <SectionHeading
        eyebrow="Command center"
        title={
          <>
            {projectCount === 0 ? "No projects yet." : `${projectCount} project${projectCount === 1 ? "" : "s"} in motion.`}{" "}
            {projectCount > 0 && (
              <span className="text-amber">
                Real portfolio rollup below.
              </span>
            )}
          </>
        }
        subtitle="Live counts from the active projects table. Risk radar and site activity feeds populate as project data accumulates."
        actions={
          <>
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

      <div className="grid grid-cols-5 gap-3 mb-6">
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
          tone={kpis && kpis.openRisks > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Site reports · 14d"
          value={kpis && kpis.recentSiteReports > 0 ? String(kpis.recentSiteReports) : "—"}
          sub="recent jobsite activity"
        />
      </div>

      {/* AI band — live qs-cost-analyst output or friendly empty state */}
      <Card className="corner-marks p-6 mb-[18px] border-amber">
        <div className="flex gap-4 items-start">
          <span className="flex-shrink-0 w-[42px] h-[42px] bg-[rgba(255,107,53,0.15)] border border-amber rounded-xl flex items-center justify-center text-amber">
            ✦
          </span>
          <div className="flex-1">
            {latestAnomaly ? (
              <>
                <div className="label label-amber">
                  qs-cost-analyst · {latestAnomaly.outputCode} ·{" "}
                  {new Date(latestAnomaly.createdAt).toLocaleString()}
                </div>
                <p className="mt-2 mb-3.5 text-[15px] leading-[1.55] text-ink">
                  <strong>{latestAnomaly.title}</strong>
                  <br />
                  <span className="text-ink-2">{latestAnomaly.summary}</span>
                </p>
                <Link
                  href={`/development-os/ai-agents/qs-cost-analyst`}
                  className="btn btn-amber btn-sm"
                >
                  Open run →
                </Link>
              </>
            ) : (
              <>
                <div className="label label-amber">qs-cost-analyst</div>
                <p className="mt-2 mb-3.5 text-[15px] leading-[1.55] text-ink">
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
          </div>
        </div>
      </Card>

      {/* DAILY-DIGEST-SPRINT-1 P4.4 — Recent digests tile */}
      <div className="mb-[18px]">
        <RecentDigestsTile basePath="/development-os/agent-digests" />
      </div>

      {/* Projects roll-up — live `projects` rows */}
      <Card padding="none" overflowHidden className="mb-[18px]">
        <div className="px-[22px] py-3.5 border-b border-line flex items-center">
          <h2 className="display text-[20px] font-medium m-0">
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
                <th>Villas</th>
                <th>Stage</th>
                <th>Mgmt status</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.projectId}>
                  <td className="font-[var(--font-space),sans-serif] font-medium">
                    {p.name}
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

      {/* Risk radar + Site activity — live */}
      <div className="grid grid-cols-2 gap-3.5 mb-[18px]">
        <Card className="p-5">
          <h3 className="display text-[18px] font-medium m-0">Risk radar</h3>
          {risks.length === 0 ? (
            <p className="mt-3.5 text-[13px] text-ink-3 italic">
              No open project risks. Risks surface here automatically as the
              register populates.
            </p>
          ) : (
            <ul className="clean mt-3.5">
              {risks.map((r) => {
                const tone: "danger" | "warn" | undefined =
                  r.impact === "severe" || r.impact === "catastrophic"
                    ? "danger"
                    : r.impact === "major"
                      ? "warn"
                      : undefined;
                return (
                  <li key={r.riskId}>
                    <span
                      className={
                        "w-2 h-2 rounded-full " +
                        (tone === "danger"
                          ? "bg-danger"
                          : tone === "warn"
                            ? "bg-amber"
                            : "bg-ink-3")
                      }
                    />
                    <div className="flex-1">
                      <div className="text-[13px] font-medium">
                        {r.projectCode ? `${r.projectCode} · ` : ""}
                        {r.title}
                      </div>
                      <div className="mono text-[10px] text-ink-3">
                        {r.category.replace(/_/g, " ")} · {r.probability} × {r.impact} = {r.riskScore}
                        {r.ownerName ? ` · ${r.ownerName}` : ""}
                      </div>
                    </div>
                    <HandoffBadge tone={tone}>{r.mitigationStatus.replace(/_/g, " ")}</HandoffBadge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <h3 className="display text-[18px] font-medium m-0">
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
                    <div className="text-[12.5px] font-medium">
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

      {/* Team grid — live app_users */}
      <Card padding="none" overflowHidden>
        <div className="px-[22px] py-3.5 border-b border-line">
          <h2 className="display text-[20px] font-medium m-0">
            Team · {team.length} {team.length === 1 ? "member" : "members"}
          </h2>
        </div>
        {team.length === 0 ? (
          <p className="p-5 text-[13px] text-ink-3 italic">
            No active team members. Invite users to populate the roster.
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-3.5 p-5">
            {team.map((p) => (
              <div
                key={p.userId}
                className="flex items-center gap-2.5 px-3 py-2.5 border border-line rounded-xl bg-bg-3"
              >
                <div className="w-9 h-9 rounded-full bg-amber text-carbon flex items-center justify-center text-[12px] font-semibold font-[var(--font-space),sans-serif]">
                  {p.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium">{p.fullName}</div>
                  <div className="mono text-[10px] text-ink-3">
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
