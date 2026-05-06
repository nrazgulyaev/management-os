import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getDevelopmentProjectBySlug } from "@/lib/development/server/projects";
import { listProjectDecisions } from "@/lib/development/server/decisions/decision-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Decisions · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "success" | "warning" | "neutral"> = {
  draft: "neutral",
  active: "success",
  superseded: "neutral",
  reversed: "warning",
};

export default async function ProjectDecisionsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Decisions" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const detail = await getDevelopmentProjectBySlug(slug);
  if (!detail || detail.source !== "db") notFound();
  const { project } = detail;
  const decisions = await safeQuery(
    "listProjectDecisions",
    listProjectDecisions({ projectId: project.realProjectId }),
    [],
    4000,
  );

  const active = decisions.filter((d) => d.status === "active").length;

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: project.name, href: `/development-os/projects/${slug}` },
          { label: "Decisions" },
        ]}
        eyebrow={`${active} active · ${decisions.length} total`}
        title="Decision Log"
        description="Important project decisions captured for institutional memory. Supersede flow preserves audit trail — old decisions stay readable but marked 'superseded'."
        actions={
          <div className="flex gap-2">
            <Button asChild>
              <Link href={`/development-os/projects/${slug}/decisions/new`}>
                <Plus className="w-4 h-4" strokeWidth={1.75} />
                New decision
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href={`/development-os/projects/${slug}`}>
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Project
              </Link>
            </Button>
          </div>
        }
      />

      {decisions.length === 0 ? (
        <EmptyState
          title="No decisions logged yet"
          description="Capture an important decision so it lives beyond a Slack thread."
        />
      ) : (
        <Section eyebrow="Log" title="All decisions (most recent first)">
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Title</TH>
                <TH>Category</TH>
                <TH>Status</TH>
                <TH>Date</TH>
              </TR>
            </THead>
            <TBody>
              {decisions.map((d) => (
                <TR key={d.id}>
                  <TD className="font-mono text-xs">
                    <Link
                      href={`/development-os/projects/${slug}/decisions/${d.decisionCode}`}
                      className="hover:underline"
                    >
                      {d.decisionCode}
                    </Link>
                  </TD>
                  <TD className="text-sm">{d.title}</TD>
                  <TD className="text-xs">{d.category ?? "—"}</TD>
                  <TD>
                    <Badge tone={STATUS_TONE[d.status] ?? "neutral"}>
                      {d.status}
                    </Badge>
                  </TD>
                  <TD className="text-xs">{d.decisionDate}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Section>
      )}
    </DevelopmentShell>
  );
}
