import {
  Kpi,
  SectionHeading,
  Card,
  HandoffBadge,
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
              <span className="text-amber">{totalOpen} open across board.</span>
            )}
          </>
        }
        subtitle="Portfolio at-risk view, kanban-style WP board, integrated daily digest from AI. Schedule strip and cross-project KPIs coming soon."
        actions={
          <>
            <button
              className="btn btn-dark btn-sm opacity-55 cursor-not-allowed"
              disabled
              title="Coming soon"
            >
              Weekly plan PDF ↓
            </button>
            <button
              className="btn btn-amber btn-sm opacity-55 cursor-not-allowed"
              disabled
              title="Coming soon"
            >
              + Work package
            </button>
          </>
        }
      />

      <div className="grid grid-cols-5 gap-3 mb-[18px]">
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
        <Kpi label="Schedule variance" value="—" sub="gantt rollup coming soon" />
        <Kpi
          label="Overdue WPs"
          value={atRisk.length === 0 ? "0" : String(atRisk.length)}
          sub="vs planned_finish"
          tone={atRisk.length === 0 ? "success" : "accent"}
        />
        <Kpi label="Decisions awaiting me" value="—" sub="decision inbox coming soon" />
        <Kpi label="Crew on site · today" value="—" sub="site report feed coming soon" />
      </div>

      {/* Kanban — live work_packages grouped by status */}
      <Card className="p-[18px] mb-[18px]">
        <div className="flex items-center mb-3.5">
          <h2 className="display text-[20px] font-medium m-0">
            Work package board
          </h2>
          <span className="mono ml-auto text-[11px] text-ink-3">
            {totalOpen} OPEN · {kanban.completed.length} DONE
          </span>
        </div>
        {totalOpen + kanban.completed.length === 0 ? (
          <p className="text-[13px] text-ink-3 italic m-0">
            No work packages yet. Create your first WP from a project to populate the board.
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-3.5">
            {KANBAN_COLUMNS.map(({ key, title }) => {
              const items = kanban[key];
              return (
                <div
                  key={key}
                  className="flex flex-col gap-2 p-3.5 bg-bg-3 rounded-[14px] min-h-[280px] border border-line"
                >
                  <div className="label">
                    {title} · {items.length}
                  </div>
                  {items.length === 0 ? (
                    <p className="text-[11px] text-ink-3 italic mt-1 mb-0">
                      Empty
                    </p>
                  ) : (
                    items.slice(0, 6).map((c) => (
                      <div
                        key={c.id}
                        className="px-3 py-2.5 bg-panel border border-line rounded-[10px] cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="mono text-[10px] text-ink-3">
                            {c.packageCode}
                          </span>
                          {c.projectCode && (
                            <span className="mono ml-auto text-[9px] text-ink-3">
                              {c.projectCode}
                            </span>
                          )}
                        </div>
                        <div className="text-[13px]">{c.name}</div>
                        <div className="mt-2 flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-amber text-carbon flex items-center justify-center text-[9px] font-semibold font-[var(--font-space),sans-serif]">
                            {initialsOf(c.responsibleUserName)}
                          </div>
                          {c.progressPercentage > 0 && (
                            <span className="mono text-[9px] text-ink-3 ml-auto">
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
      <div className="grid grid-cols-2 gap-3.5 mb-[18px]">
        <Card className="p-5">
          <h3 className="display text-[18px] font-medium m-0">
            Portfolio at-risk · overdue WPs
          </h3>
          {atRisk.length === 0 ? (
            <p className="mt-3.5 text-[13px] text-ink-3 italic">
              No overdue work packages. Risks surface here once planned_finish slips.
            </p>
          ) : (
            <ul className="clean mt-3.5">
              {atRisk.map((r) => {
                const sev = severityForOverdue(r.daysOverdue);
                return (
                  <li key={r.id}>
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: sev.color }}
                    />
                    <div className="flex-1">
                      <div className="text-[13px] font-medium">
                        {r.projectCode ? `${r.projectCode} · ` : ""}
                        {r.packageCode} · {r.name}
                      </div>
                      <div className="mono text-[11px] text-ink-3">
                        {r.daysOverdue} {r.daysOverdue === 1 ? "day" : "days"} overdue
                        {r.responsibleUserName ? ` · ${r.responsibleUserName}` : ""}
                      </div>
                    </div>
                    <HandoffBadge tone={sev.tone}>{sev.label}</HandoffBadge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="display text-[18px] font-medium m-0">
            Today · daily digest
          </h3>
          {digest ? (
            <>
              <div className="label label-amber mt-1">
                FILED {new Date(digest.createdAt).toLocaleString()} BY AI · {digest.outputCode}
              </div>
              <div className="mt-3.5 text-[13.5px] leading-[1.6] text-ink-2">
                <p className="m-0 mb-2.5 text-ink font-medium">{digest.title}</p>
                <p className="m-0">{digest.summary}</p>
              </div>
            </>
          ) : (
            <>
              <div className="label mt-1">NO DIGEST YET</div>
              <p className="mt-3.5 text-[13px] text-ink-3 italic leading-[1.6]">
                The daily-construction-digest agent files yesterday&apos;s exceptions and
                today&apos;s plan at 06:00 once configured. Surface it here automatically
                the first time it runs.
              </p>
            </>
          )}
        </Card>
      </div>

      {/* 7-day schedule strip — TASK-7-DATA-PART-3 fill */}
      <Card className="p-5">
        <div className="flex items-baseline mb-3.5">
          <h2 className="display text-[20px] font-medium m-0">
            Schedule · next 7 days
          </h2>
          <span className="mono ml-auto text-[11px] text-ink-3">
            project_tasks · planned_finish
          </span>
        </div>
        {schedule.every((d) => d.tasks.length === 0) ? (
          <p className="text-[13px] text-ink-3 italic m-0">
            No tasks scheduled in the next 7 days.
          </p>
        ) : (
          <div className="grid grid-cols-7 gap-2">
            {schedule.map((day) => (
              <div
                key={day.isoDate}
                className="p-2.5 bg-bg-3 rounded-[10px] border border-line min-h-[120px] flex flex-col gap-1.5"
              >
                <div className="label text-[9px]">{day.dayLabel}</div>
                {day.tasks.length === 0 ? (
                  <span className="mono text-[9px] text-ink-3">—</span>
                ) : (
                  day.tasks.slice(0, 4).map((t) => (
                    <div
                      key={t.taskId}
                      className="px-2 py-1.5 bg-panel border border-line rounded-md text-[10.5px]"
                    >
                      <div className="mono text-[8.5px] text-ink-3 mb-0.5">
                        {t.projectCode ?? t.taskCode}
                      </div>
                      <div className="leading-[1.3]">{t.name}</div>
                      {t.status === "in_progress" && (
                        <div className="mono text-[8px] text-amber mt-0.5">
                          {t.progressPercentage}%
                        </div>
                      )}
                    </div>
                  ))
                )}
                {day.tasks.length > 4 && (
                  <span className="mono text-[9px] text-ink-3">
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
