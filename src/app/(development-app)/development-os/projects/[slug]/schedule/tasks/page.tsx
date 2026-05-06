import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getDevelopmentProjectBySlug } from "@/lib/development/server/projects";
import { listProjectTasks } from "@/lib/development/server/schedule/schedule-queries";

export const metadata: Metadata = { title: "Tasks · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "success" | "warning" | "neutral"> = {
  planned: "neutral",
  ready_to_start: "info",
  in_progress: "info",
  completed: "success",
  blocked: "warning",
  cancelled: "neutral",
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
        <PageHeader title="Tasks" />
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
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: project.name, href: `/development-os/projects/${slug}` },
          { label: "Schedule", href: `/development-os/projects/${slug}/schedule` },
          { label: "Tasks" },
        ]}
        eyebrow={`${tasks.length} task${tasks.length === 1 ? "" : "s"}`}
        title="Task list"
        description="Tabular view of all tasks. Click a task to see its details. Critical-path tasks are flagged."
        actions={
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
        }
      />

      {tasks.length === 0 ? (
        <EmptyState
          title="No tasks yet"
          description="Add a task to start populating the schedule."
        />
      ) : (
        <Section eyebrow="All" title="Tasks (chronological)">
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
                    <Badge tone={STATUS_TONE[t.status] ?? "neutral"}>
                      {t.status}
                    </Badge>
                  </TD>
                  <TD>
                    {t.isOnCriticalPath && <Badge tone="danger">CP</Badge>}
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
        </Section>
      )}
    </DevelopmentShell>
  );
}
