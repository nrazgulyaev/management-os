import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getDevelopmentProjectBySlug } from "@/lib/development/server/projects";
import { listProjectTasks } from "@/lib/development/server/schedule/schedule-queries";

export const metadata: Metadata = { title: "Tasks · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "ok" | "warn" | "soft"> = {
  planned: "soft",
  ready_to_start: "info",
  in_progress: "info",
  completed: "ok",
  blocked: "warn",
  cancelled: "soft",
};

export default async function TaskListPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Tasks</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const detail = await getDevelopmentProjectBySlug(slug);
  if (!detail || detail.source !== "db") notFound();
  const { project } = detail;
  const tasks = await listProjectTasks({ projectId: project.realProjectId });

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href={`/development-os/projects/${slug}`}>{project.name}</Link> /{" "}
            <Link href={`/development-os/projects/${slug}/schedule`}>Schedule</Link> /{" "}
            <span>Tasks</span>
          </div>
          <h1>Task list</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Tabular view of all tasks. Click a task to see its details.
            Critical-path tasks are flagged.
          </p>
        </div>
        <div className="actions">
          <div className="flex gap-2">
            <Button asChild>
              <Link
                href={`/development-os/projects/${slug}/schedule/tasks/new`}
              >
                <Plus className="w-4 h-4" strokeWidth={1.75} />
                New task
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href={`/development-os/projects/${slug}/schedule`}>
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Gantt
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          title="No tasks yet"
          description="Add a task to start populating the schedule."
        />
      ) : (
        <div>
          <div className="label mb-2.5">All</div>
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Name</TH>
                <TH>Status</TH>
                <TH>CP</TH>
                <TH>Start</TH>
                <TH>Finish</TH>
                <TH>Days</TH>
                <TH>Float</TH>
                <TH>Progress</TH>
              </TR>
            </THead>
            <TBody>
              {tasks.map((t) => (
                <TR key={t.id}>
                  <TD className="font-mono text-xs">
                    <Link
                      href={`/development-os/projects/${slug}/schedule/tasks/${t.taskCode}`}
                      className="hover:underline"
                    >
                      {t.taskCode}
                    </Link>
                  </TD>
                  <TD className="text-sm">{t.name}</TD>
                  <TD>
                    <HandoffBadge tone={STATUS_TONE[t.status] ?? "soft"}>
                      {t.status}
                    </HandoffBadge>
                  </TD>
                  <TD>
                    {t.isOnCriticalPath && <HandoffBadge tone="danger">CP</HandoffBadge>}
                  </TD>
                  <TD className="text-xs">{t.plannedStart}</TD>
                  <TD className="text-xs">{t.plannedFinish}</TD>
                  <TDNum>{t.durationDays ?? "—"}</TDNum>
                  <TDNum>{t.totalFloatDays != null ? t.totalFloatDays : "—"}</TDNum>
                  <TDNum>{Number(t.progressPercentage).toFixed(0)}%</TDNum>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </DevelopmentShell>
  );
}
