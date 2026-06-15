import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getDevelopmentProjectBySlug } from "@/lib/development/server/projects";
import { lookaheadTasks } from "@/lib/development/server/schedule/schedule-queries";

export const metadata: Metadata = { title: "Lookahead · Development OS" };
export const dynamic = "force-dynamic";

export default async function LookaheadPage({
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
            <h1>Lookahead</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const detail = await getDevelopmentProjectBySlug(slug);
  if (!detail || detail.source !== "db") notFound();
  const { project } = detail;

  const [twoWeek, fourWeek] = await Promise.all([
    lookaheadTasks(project.realProjectId, 14),
    lookaheadTasks(project.realProjectId, 28),
  ]);

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href={`/development-os/projects/${slug}`}>{project.name}</Link> /{" "}
            <Link href={`/development-os/projects/${slug}/schedule`}>Schedule</Link> /{" "}
            <span>Lookahead</span>
          </div>
          <h1>Lookahead</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Tasks active or starting within the next 2 / 4 weeks. Critical-path
            tasks bubble to top.
          </p>
        </div>
        <div className="actions">
          <Button asChild variant="secondary">
            <Link href={`/development-os/projects/${slug}/schedule`}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Gantt
            </Link>
          </Button>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">14 days</div>
        <LookaheadTable rows={twoWeek} />
      </div>

      <div>
        <div className="label mb-2.5">28 days</div>
        <LookaheadTable rows={fourWeek} />
      </div>
    </DevelopmentShell>
  );
}

function LookaheadTable({
  rows,
}: {
  rows: Array<Record<string, string | boolean>>;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-ink-tertiary">Nothing in this window.</p>;
  }
  return (
    <Table>
      <THead>
        <TR>
          <TH>Code</TH>
          <TH>Name</TH>
          <TH>Status</TH>
          <TH>CP</TH>
          <TH>Start</TH>
          <TH>Finish</TH>
          <TH>%</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((r) => (
          <TR key={String(r.id)}>
            <TD className="font-mono text-xs">{String(r.task_code)}</TD>
            <TD className="text-sm">{String(r.name)}</TD>
            <TD>
              <HandoffBadge tone="info">{String(r.status)}</HandoffBadge>
            </TD>
            <TD>
              {Boolean(r.is_on_critical_path) && <HandoffBadge tone="danger">CP</HandoffBadge>}
            </TD>
            <TD className="text-xs">{String(r.planned_start)}</TD>
            <TD className="text-xs">{String(r.planned_finish)}</TD>
            <TD className="text-xs">
              {Number(r.progress_percentage).toFixed(0)}%
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
