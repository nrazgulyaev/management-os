import {
  Kpi,
  SectionHeading,
  Card,
  Badge,
} from "@/components/dashboard/primitives";
import {
  listWorkPackagesByStatus,
  listAtRiskPackages,
  getLatestDailyDigest,
  getSevenDaySchedule,
  type WpStatus,
  type WorkPackageRow,
} from "@/lib/development/server/cabinets/project-manager-cabinet-queries";

/**
 * Sprint TASK-7-DATA-PART-2 — Dev OS Project Manager cabinet live wiring.
 *
 * Visual port from `_handoff/development/project-manager.html` (TASK-7-
 * VISUAL, commit `316dc65`); this commit replaces three mock arrays
 * with live, org-scoped reads in
 * `src/lib/development/server/cabinets/project-manager-cabinet-queries.ts`:
 *
 *   - mockKANBAN   → listWorkPackagesByStatus()  (org-scoped work_packages)
 *   - mockAT_RISK  → listAtRiskPackages(5)       (overdue planned_finish)
 *   - mockDIGEST   → getLatestDailyDigest()      (latest daily_digest run)
 *
 * KPI strip + construction schedule strip stay placeholder this sprint —
 * cross-project rollup + gantt feed land in TASK-7-DATA-PART-3.
 */

export const metadata = { title: "Project Manager · Cabinet" };
export const dynamic = "force-dynamic";

const KANBAN_COLUMNS: Array<{ key: WpStatus; title: string }> = [
  { key: "planned", title: "Backlog" },
  { key: "ready_to_start", title: "This week" },
  { key: "in_progress", title: "In progress" },
  { key: "completed", title: "Done · recent" },
];

function initialsOf(name: string | null): string {
  if (!name) return "—";
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function severityForOverdue(days: number): {
  color: string;
  tone: "danger" | "warn";
  label: string;
} {
  if (days >= 7) return { color: "var(--danger)", tone: "danger", label: "Critical" };
  if (days >= 3) return { color: "var(--amber)", tone: "warn", label: "High" };
  return { color: "var(--warn)", tone: "warn", label: "Medium" };
}

export default async function ProjectManagerPage() {
  const [kanban, atRisk, digest, schedule] = await Promise.all([
    listWorkPackagesByStatus().catch(
      () =>
        ({
          planned: [],
          ready_to_start: [],
          in_progress: [],
          completed: [],
          on_hold: [],
          cancelled: [],
        }) as Record<WpStatus, WorkPackageRow[]>,
    ),
    listAtRiskPackages(5).catch(() => []),
    getLatestDailyDigest().catch(() => null),
    getSevenDaySchedule().catch(() => []),
  ]);

  const inProgressCount = kanban.in_progress.length;
  const totalOpen =
    kanban.planned.length +
    kanban.ready_to_start.length +
    kanban.in_progress.length;

  return (
    <>
      <SectionHeading
        eyebrow="My cabinet · Project manager"
        title={
          <>
            {totalOpen === 0
              ? "No open work packages yet."
              : `${inProgressCount} WPs in flight.`}{" "}
            {totalOpen > 0 && (
              <span style={{ color: "var(--amber)" }}>{totalOpen} open across board.</span>
            )}
          </>
        }
        subtitle="Portfolio at-risk view, kanban-style WP board, integrated daily digest from AI. Schedule strip + cross-project KPIs land in TASK-7-DATA-PART-3."
        actions={
          <>
            <button className="btn btn-dark btn-sm">Weekly plan PDF ↓</button>
            <button className="btn btn-amber btn-sm">+ Work package</button>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 18 }}>
        <Kpi
          label="WPs · in progress"
          value={inProgressCount === 0 ? "—" : String(inProgressCount)}
          sub={
            inProgressCount === 0
              ? "no active WPs"
              : `${kanban.ready_to_start.length} queued this week`
          }
          tone={inProgressCount > 0 ? "accent" : undefined}
        />
        <Kpi label="Schedule variance" value="—" sub="gantt rollup in PART-3" />
        <Kpi
          label="Overdue WPs"
          value={atRisk.length === 0 ? "0" : String(atRisk.length)}
          sub="vs planned_finish"
          tone={atRisk.length === 0 ? "success" : "accent"}
        />
        <Kpi label="Decisions awaiting me" value="—" sub="inbox feed in PART-3" />
        <Kpi label="Crew on site · today" value="—" sub="site report feed in PART-3" />
      </div>

      {/* Kanban — live work_packages grouped by status */}
      <Card style={{ padding: 18, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
          <h2 className="display" style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>
            Work package board
          </h2>
          <span
            className="mono"
            style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)" }}
          >
            {totalOpen} OPEN · {kanban.completed.length} DONE
          </span>
        </div>
        {totalOpen + kanban.completed.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--ink-3)", fontStyle: "italic", margin: 0 }}>
            No work packages yet. Create your first WP from a project to populate the board.
          </p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
            {KANBAN_COLUMNS.map(({ key, title }) => {
              const items = kanban[key];
              return (
                <div
                  key={key}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    padding: 14,
                    background: "var(--bg-3)",
                    borderRadius: 14,
                    minHeight: 280,
                    border: "1px solid var(--line)",
                  }}
                >
                  <div className="label">
                    {title} · {items.length}
                  </div>
                  {items.length === 0 ? (
                    <p
                      style={{
                        fontSize: 11,
                        color: "var(--ink-3)",
                        fontStyle: "italic",
                        margin: "4px 0 0",
                      }}
                    >
                      Empty
                    </p>
                  ) : (
                    items.slice(0, 6).map((c) => (
                      <div
                        key={c.id}
                        style={{
                          padding: "10px 12px",
                          background: "var(--panel)",
                          border: "1px solid var(--line)",
                          borderRadius: 10,
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <span className="mono" style={{ fontSize: 10, color: "var(--ink-3)" }}>
                            {c.packageCode}
                          </span>
                          {c.projectCode && (
                            <span className="mono" style={{ marginLeft: "auto", fontSize: 9, color: "var(--ink-3)" }}>
                              {c.projectCode}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 13 }}>{c.name}</div>
                        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
                          <div
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: 999,
                              background: "var(--amber)",
                              color: "var(--carbon)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 9,
                              fontWeight: 600,
                              fontFamily: "var(--font-space), sans-serif",
                            }}
                          >
                            {initialsOf(c.responsibleUserName)}
                          </div>
                          {c.progressPercentage > 0 && (
                            <span className="mono" style={{ fontSize: 9, color: "var(--ink-3)", marginLeft: "auto" }}>
                              {c.progressPercentage}%
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Portfolio at-risk + daily digest */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
        <Card style={{ padding: 20 }}>
          <h3 className="display" style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>
            Portfolio at-risk · overdue WPs
          </h3>
          {atRisk.length === 0 ? (
            <p
              style={{
                marginTop: 14,
                fontSize: 13,
                color: "var(--ink-3)",
                fontStyle: "italic",
              }}
            >
              No overdue work packages. Risks surface here once planned_finish slips.
            </p>
          ) : (
            <ul className="clean" style={{ marginTop: 14 }}>
              {atRisk.map((r) => {
                const sev = severityForOverdue(r.daysOverdue);
                return (
                  <li key={r.id}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: sev.color }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>
                        {r.projectCode ? `${r.projectCode} · ` : ""}
                        {r.packageCode} · {r.name}
                      </div>
                      <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                        {r.daysOverdue} {r.daysOverdue === 1 ? "day" : "days"} overdue
                        {r.responsibleUserName ? ` · ${r.responsibleUserName}` : ""}
                      </div>
                    </div>
                    <Badge tone={sev.tone}>{sev.label}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card style={{ padding: 20 }}>
          <h3 className="display" style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>
            Today · daily digest
          </h3>
          {digest ? (
            <>
              <div className="label label-amber" style={{ marginTop: 4 }}>
                FILED {new Date(digest.createdAt).toLocaleString()} BY AI · {digest.outputCode}
              </div>
              <div
                style={{
                  marginTop: 14,
                  fontSize: 13.5,
                  lineHeight: 1.6,
                  color: "var(--ink-2)",
                }}
              >
                <p style={{ margin: "0 0 10px", color: "var(--ink)", fontWeight: 500 }}>
                  {digest.title}
                </p>
                <p style={{ margin: 0 }}>{digest.summary}</p>
              </div>
            </>
          ) : (
            <>
              <div className="label" style={{ marginTop: 4 }}>
                NO DIGEST YET
              </div>
              <p
                style={{
                  marginTop: 14,
                  fontSize: 13,
                  color: "var(--ink-3)",
                  fontStyle: "italic",
                  lineHeight: 1.6,
                }}
              >
                The daily-construction-digest agent files yesterday&apos;s exceptions and
                today&apos;s plan at 06:00 once configured. Surface it here automatically
                the first time it runs.
              </p>
            </>
          )}
        </Card>
      </div>

      {/* 7-day schedule strip — TASK-7-DATA-PART-3 fill */}
      <Card style={{ padding: 20 }}>
        <div style={{ display: "flex", alignItems: "baseline", marginBottom: 14 }}>
          <h2 className="display" style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>
            Schedule · next 7 days
          </h2>
          <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)" }}>
            project_tasks · planned_finish
          </span>
        </div>
        {schedule.every((d) => d.tasks.length === 0) ? (
          <p style={{ fontSize: 13, color: "var(--ink-3)", fontStyle: "italic", margin: 0 }}>
            No tasks scheduled in the next 7 days.
          </p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
            {schedule.map((day) => (
              <div
                key={day.isoDate}
                style={{
                  padding: 10,
                  background: "var(--bg-3)",
                  borderRadius: 10,
                  border: "1px solid var(--line)",
                  minHeight: 120,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div className="label" style={{ fontSize: 9 }}>
                  {day.dayLabel}
                </div>
                {day.tasks.length === 0 ? (
                  <span className="mono" style={{ fontSize: 9, color: "var(--ink-3)" }}>
                    —
                  </span>
                ) : (
                  day.tasks.slice(0, 4).map((t) => (
                    <div
                      key={t.taskId}
                      style={{
                        padding: "6px 8px",
                        background: "var(--panel)",
                        border: "1px solid var(--line)",
                        borderRadius: 6,
                        fontSize: 10.5,
                      }}
                    >
                      <div
                        className="mono"
                        style={{ fontSize: 8.5, color: "var(--ink-3)", marginBottom: 2 }}
                      >
                        {t.projectCode ?? t.taskCode}
                      </div>
                      <div style={{ lineHeight: 1.3 }}>{t.name}</div>
                      {t.status === "in_progress" && (
                        <div className="mono" style={{ fontSize: 8, color: "var(--amber)", marginTop: 2 }}>
                          {t.progressPercentage}%
                        </div>
                      )}
                    </div>
                  ))
                )}
                {day.tasks.length > 4 && (
                  <span className="mono" style={{ fontSize: 9, color: "var(--ink-3)" }}>
                    +{day.tasks.length - 4} more
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
