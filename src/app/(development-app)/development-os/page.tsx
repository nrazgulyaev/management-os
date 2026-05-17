import Link from "next/link";
import {
  Kpi,
  SectionHeading,
  Card,
  Badge,
} from "@/components/dashboard/primitives";
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
  const [projects, team, latestAnomaly, risks, siteActivity, kpis] = await Promise.all([
    getActiveProjectsRollup().catch(() => []),
    getTeamRoster().catch(() => []),
    getLatestQsAnomaly().catch(() => null),
    getRiskRadar(5).catch(() => []),
    getSiteActivityFeed(6).catch(() => []),
    getDevPortfolioKpis().catch(() => null),
  ]);

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
              <span style={{ color: "var(--amber)" }}>
                Real portfolio rollup below.
              </span>
            )}
          </>
        }
        subtitle="Live counts from the active projects table. Risk radar and site activity feeds populate as project data accumulates."
        actions={
          <>
            <button className="btn btn-dark btn-sm">Daily digest PDF ↓</button>
            <Link
              href="/development-os/projects/new"
              className="btn btn-amber btn-sm"
            >
              New project +
            </Link>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 24 }}>
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
      <Card
        className="corner-marks"
        style={{ padding: 24, marginBottom: 18, borderColor: "var(--amber)" }}
      >
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <span
            style={{
              flexShrink: 0,
              width: 42,
              height: 42,
              background: "rgba(255,107,53,0.15)",
              border: "1px solid var(--amber)",
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--amber)",
            }}
          >
            ✦
          </span>
          <div style={{ flex: 1 }}>
            {latestAnomaly ? (
              <>
                <div className="label label-amber">
                  qs-cost-analyst · {latestAnomaly.outputCode} ·{" "}
                  {new Date(latestAnomaly.createdAt).toLocaleString()}
                </div>
                <p
                  style={{
                    margin: "8px 0 14px",
                    fontSize: 15,
                    lineHeight: 1.55,
                    color: "var(--ink)",
                  }}
                >
                  <strong>{latestAnomaly.title}</strong>
                  <br />
                  <span style={{ color: "var(--ink-2)" }}>{latestAnomaly.summary}</span>
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
                <p
                  style={{
                    margin: "8px 0 14px",
                    fontSize: 15,
                    lineHeight: 1.55,
                    color: "var(--ink)",
                  }}
                >
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

      {/* Projects roll-up — live `projects` rows */}
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
        <div
          style={{
            padding: "14px 22px",
            borderBottom: "1px solid var(--line)",
            display: "flex",
            alignItems: "center",
          }}
        >
          <h2 className="display" style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>
            Projects · {projectCount} active
          </h2>
          {projectCount > 0 && (
            <span
              className="mono"
              style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)" }}
            >
              {totalVillas} VILLAS · {projectCount} {projectCount === 1 ? "PROJECT" : "PROJECTS"}
            </span>
          )}
        </div>
        {projectCount === 0 ? (
          <p
            style={{
              padding: 20,
              fontSize: 13,
              color: "var(--ink-3)",
              fontStyle: "italic",
            }}
          >
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
                  <td style={{ fontFamily: "var(--font-space), sans-serif", fontWeight: 500 }}>
                    {p.name}
                  </td>
                  <td className="mono">{p.projectCode}</td>
                  <td className="num">{p.villaCount}</td>
                  <td>
                    <Badge>{STAGE_BADGE[p.status] ?? p.status}</Badge>
                  </td>
                  <td>
                    <Badge>{p.managementStatus}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Risk radar + Site activity — live */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
        <Card style={{ padding: 20 }}>
          <h3 className="display" style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>
            Risk radar
          </h3>
          {risks.length === 0 ? (
            <p style={{ marginTop: 14, fontSize: 13, color: "var(--ink-3)", fontStyle: "italic" }}>
              No open project risks. Risks surface here automatically as the
              register populates.
            </p>
          ) : (
            <ul className="clean" style={{ marginTop: 14 }}>
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
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        background:
                          tone === "danger"
                            ? "var(--danger)"
                            : tone === "warn"
                              ? "var(--amber)"
                              : "var(--ink-3)",
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>
                        {r.projectCode ? `${r.projectCode} · ` : ""}
                        {r.title}
                      </div>
                      <div className="mono" style={{ fontSize: 10, color: "var(--ink-3)" }}>
                        {r.category.replace(/_/g, " ")} · {r.probability} × {r.impact} = {r.riskScore}
                        {r.ownerName ? ` · ${r.ownerName}` : ""}
                      </div>
                    </div>
                    <Badge tone={tone}>{r.mitigationStatus.replace(/_/g, " ")}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card style={{ padding: 20 }}>
          <h3 className="display" style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>
            Site activity · recent
          </h3>
          {siteActivity.length === 0 ? (
            <p style={{ marginTop: 14, fontSize: 13, color: "var(--ink-3)", fontStyle: "italic" }}>
              No site reports yet. Daily activity surfaces here once
              supervisors file their first log.
            </p>
          ) : (
            <ul className="clean" style={{ marginTop: 14 }}>
              {siteActivity.map((a, i) => (
                <li key={`${a.occurredAt}-${i}`}>
                  <span className="mono" style={{ fontSize: 10, color: "var(--ink-3)", width: 64 }}>
                    {a.occurredAt}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500 }}>
                      {a.projectCode ? `${a.projectCode} · ` : ""}
                      {a.summary}
                    </div>
                    <div className="mono" style={{ fontSize: 10, color: "var(--ink-3)" }}>
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
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 22px", borderBottom: "1px solid var(--line)" }}>
          <h2 className="display" style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>
            Team · {team.length} {team.length === 1 ? "member" : "members"}
          </h2>
        </div>
        {team.length === 0 ? (
          <p
            style={{
              padding: 20,
              fontSize: 13,
              color: "var(--ink-3)",
              fontStyle: "italic",
            }}
          >
            No active team members. Invite users to populate the roster.
          </p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, padding: 20 }}>
            {team.map((p) => (
              <div
                key={p.userId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  border: "1px solid var(--line)",
                  borderRadius: 12,
                  background: "var(--bg-3)",
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 999,
                    background: "var(--amber)",
                    color: "var(--carbon)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: "var(--font-space), sans-serif",
                  }}
                >
                  {p.initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{p.fullName}</div>
                  <div className="mono" style={{ fontSize: 10, color: "var(--ink-3)" }}>
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
