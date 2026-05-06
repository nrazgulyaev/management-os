import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
        <PageHeader title="Lookahead" />
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
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: project.name, href: `/development-os/projects/${slug}` },
          { label: "Schedule", href: `/development-os/projects/${slug}/schedule` },
          { label: "Lookahead" },
        ]}
        eyebrow={`${twoWeek.length} in 2 weeks · ${fourWeek.length} in 4 weeks`}
        title="Lookahead"
        description="Tasks active or starting within the next 2 / 4 weeks. Critical-path tasks bubble to top."
        actions={
          <Button asChild variant="secondary">
            <Link href={`/development-os/projects/${slug}/schedule`}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Gantt
            </Link>
          </Button>
        }
      />

      <Section eyebrow="14 days" title={`Two-week lookahead (${twoWeek.length})`}>
        <LookaheadTable rows={twoWeek} />
      </Section>

      <Section eyebrow="28 days" title={`Four-week lookahead (${fourWeek.length})`}>
        <LookaheadTable rows={fourWeek} />
      </Section>
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
              <Badge tone="info">{String(r.status)}</Badge>
            </TD>
            <TD>
              {Boolean(r.is_on_critical_path) && <Badge tone="danger">CP</Badge>}
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
