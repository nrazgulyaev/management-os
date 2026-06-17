import Link from "next/link";
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
 * Phase 2.2 dev-01 — PM cabinet reframed as the personal queue
 * (cross-project) per `_handoff/cabinets/dev-p1/projects.html`.
 *
 * The project-list + project-detail surfaces are at
 * `/development-os/projects` — this cabinet is the PM's *personal*
 * working board: every WP they own (across all projects), the
 * at-risk shortlist, and the daily digest they read first thing.
 *
 * Live data (kept from the original TASK-7 wiring):
 *   - mockKANBAN   → listWorkPackagesByStatus()
 *   - mockAT_RISK  → listAtRiskPackages(5)
 *   - mockDIGEST   → getLatestDailyDigest()
 *
 * Real PM personal-queue filtering (WPs owned by current user,
 * cross-project rollup, due-today aggregation) lands in the 2.2
 * data-wiring slice.
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
  const tasksNext7Days = schedule.reduce((s, d) => s + d.tasks.length, 0);
  const completedCount = kanban.completed.length;

  return (
    <>
      <SectionHeading
        eyebrow="PM · personal queue · cross-project"
        title={
          <>
            {totalOpen === 0
              ? "Inbox zero. Nothing in your queue."
              : `${inProgressCount} WPs in flight.`}{" "}
            {totalOpen > 0 && (
              <span className="text-amber">{totalOpen} open across board.</span>
            )}
          </>
        }
        subtitle="Your personal at-risk view, kanban-style WP board, integrated daily digest. For project shapes + milestones open the project detail from /development-os/projects."
        actions={
          <Link href="/development-os/projects" className="btn btn-amber btn-sm">
            + Work package
          </Link>
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
        <Kpi
          label="Tasks · next 7 days"
          value={tasksNext7Days === 0 ? "—" : String(tasksNext7Days)}
          sub={tasksNext7Days === 0 ? "nothing scheduled" : "by planned_finish"}
          tone={tasksNext7Days > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Overdue WPs"
          value={atRisk.length === 0 ? "0" : String(atRisk.length)}
          sub="vs planned_finish"
          tone={atRisk.length === 0 ? "success" : "accent"}
        />
        <Kpi
          label="Queued · this week"
          value={
            kanban.ready_to_start.length === 0
              ? "—"
              : String(kanban.ready_to_start.length)
          }
          sub={kanban.ready_to_start.length === 0 ? "nothing queued" : "ready to start"}
          tone={kanban.ready_to_start.length > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Done · recent"
          value={completedCount === 0 ? "—" : String(completedCount)}
          sub={completedCount === 0 ? "none completed yet" : "completed WPs"}
          tone={completedCount > 0 ? "success" : undefined}
        />
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
                    items.slice(0, 6).map((c) => {
                      const cardInner = (
                        <>
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
                        </>
                      );
                      return c.projectSlug ? (
                        <Link
                          key={c.id}
                          href={`/development-os/projects/${c.projectSlug}/work-packages/${encodeURIComponent(c.packageCode)}`}
                          className="block px-3 py-2.5 bg-panel border border-line rounded-[10px] hover:border-amber transition-colors"
                        >
                          {cardInner}
                        </Link>
                      ) : (
                        <div
                          key={c.id}
                          className="px-3 py-2.5 bg-panel border border-line rounded-[10px]"
                        >
                          {cardInner}
                        </div>
                      );
                    })
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
