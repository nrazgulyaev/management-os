import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, AlertCircle, CheckCircle2 } from "lucide-react";
import { sql } from "drizzle-orm";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { getDb, rowsOf } from "@/lib/db/client";
import { safeQuery } from "@/lib/development/safe-query";
import { ExportButton } from "@/components/development/bulk-import/export-button";

export const metadata: Metadata = { title: "Schedule · Development OS" };
export const dynamic = "force-dynamic";

interface ProjectScheduleRow {
  project_id: string;
  slug: string;
  name: string;
  task_count: number;
  critical_path_count: number;
  in_progress_count: number;
  completed_count: number;
  earliest_start: string | null;
  latest_finish: string | null;
  remaining_critical_days: number | null;
  delayed_count: number;
}

async function getProjectScheduleSummary(): Promise<ProjectScheduleRow[]> {
  const db = getDb();
  if (!db) return [];
  const result = await db.execute(sql`
    SELECT
      p.id::text AS project_id,
      p.slug,
      p.name,
      COUNT(t.id)::int AS task_count,
      COUNT(t.id) FILTER (WHERE t.is_on_critical_path)::int AS critical_path_count,
      COUNT(t.id) FILTER (WHERE t.status = 'in_progress')::int AS in_progress_count,
      COUNT(t.id) FILTER (WHERE t.status = 'completed')::int AS completed_count,
      MIN(t.planned_start)::text AS earliest_start,
      MAX(t.planned_finish)::text AS latest_finish,
      SUM(
        CASE WHEN t.is_on_critical_path AND t.status NOT IN ('completed', 'cancelled')
             AND t.planned_finish >= CURRENT_DATE
             THEN GREATEST((t.planned_finish - CURRENT_DATE)::int, 0)
             ELSE 0 END
      )::int AS remaining_critical_days,
      COUNT(t.id) FILTER (
        WHERE t.status NOT IN ('completed', 'cancelled')
          AND t.planned_finish < CURRENT_DATE
      )::int AS delayed_count
    FROM projects p
    JOIN work_packages wp ON wp.project_id = p.id
    JOIN project_tasks t ON t.work_package_id = wp.id
    GROUP BY p.id, p.slug, p.name
    ORDER BY p.name
  `);
  return (rowsOf<ProjectScheduleRow>(result)) as ProjectScheduleRow[];
}

export default async function GlobalSchedulePage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os">Development OS</Link> /{" "}
              <span>Schedule</span>
            </div>
            <h1>Schedule</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const projects = await safeQuery(
    "getProjectScheduleSummary",
    getProjectScheduleSummary(),
    [],
    4000,
  );

  const totalTasks = projects.reduce((acc, p) => acc + p.task_count, 0);
  const totalCritical = projects.reduce(
    (acc, p) => acc + p.critical_path_count,
    0,
  );
  const projectsDelayed = projects.filter((p) => p.delayed_count > 0).length;

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Schedule</span>
          </div>
          <h1>Master schedule</h1>
          <div className="label mt-2">{`${projects.length} project${projects.length === 1 ? "" : "s"} · ${totalTasks} task${totalTasks === 1 ? "" : "s"} · ${totalCritical} on critical path · ${projectsDelayed} project${projectsDelayed === 1 ? "" : "s"} with delayed tasks`}</div>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Per-project schedule overview. Critical path is recomputed nightly
            via dev_os_critical_path_recompute. Click a project to open its full
            Gantt + tasks.
          </p>
        </div>
        <div className="actions">
          <div className="flex items-center gap-2">
            <ExportButton entity="tasks" />
            <Link href="/development-os" className="btn btn-secondary btn-sm">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Command center
            </Link>
          </div>
        </div>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          title="No tasks scheduled across any project"
          description="Add work packages + tasks via Projects → [project] → Work packages."
        />
      ) : (
        <div>
          <div className="label mb-2.5">Per project</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => {
              const isOnTrack = p.delayed_count === 0;
              return (
                <Link
                  key={p.project_id}
                  href={`/development-os/projects/${p.slug}/schedule`}
                  className="rounded-lg border border-line-soft bg-surface p-5 hover:shadow-sm transition space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-medium text-ink">{p.name}</h4>
                      <p className="text-[11px] text-ink-tertiary mt-0.5 font-mono">
                        {p.slug}
                      </p>
                    </div>
                    <HandoffBadge tone={isOnTrack ? "ok" : "warn"}>
                      {isOnTrack ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 mr-1" /> on track
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-3 h-3 mr-1" />
                          {p.delayed_count} delayed
                        </>
                      )}
                    </HandoffBadge>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <Stat
                      label="Total tasks"
                      value={String(p.task_count)}
                    />
                    <Stat
                      label="On critical path"
                      value={String(p.critical_path_count)}
                      tone="danger"
                    />
                    <Stat
                      label="In progress"
                      value={String(p.in_progress_count)}
                      tone="info"
                    />
                  </div>

                  <div className="border-t border-line-soft pt-2 text-[11px] text-ink-tertiary space-y-0.5">
                    <div>
                      Window: {p.earliest_start ?? "—"} → {p.latest_finish ?? "—"}
                    </div>
                    <div>
                      Critical-path remaining:{" "}
                      <span className="font-mono">
                        {p.remaining_critical_days ?? 0} days
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </DevelopmentShell>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger" | "info";
}) {
  const valueClass =
    tone === "danger"
      ? "text-danger"
      : tone === "info"
        ? "text-info"
        : "text-ink";
  return (
    <div className="rounded border border-line-soft p-2">
      <div className={`text-lg font-medium tabular-nums ${valueClass}`}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-ink-tertiary">
        {label}
      </div>
    </div>
  );
}
