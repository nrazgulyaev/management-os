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
import { listProjectRisks } from "@/lib/development/server/risks/risk-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Risks · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "success" | "warning" | "danger" | "neutral"> = {
  identified: "warning",
  planning_mitigation: "info",
  mitigating: "info",
  monitored: "neutral",
  closed_resolved: "success",
  closed_realized: "danger",
};

function scoreTone(score: number | null): "danger" | "warning" | "info" | "neutral" {
  if (score == null) return "neutral";
  if (score >= 15) return "danger";
  if (score >= 8) return "warning";
  if (score >= 4) return "info";
  return "neutral";
}

export default async function ProjectRisksPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Risks" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const detail = await getDevelopmentProjectBySlug(slug);
  if (!detail || detail.source !== "db") notFound();
  const { project } = detail;
  const risks = await safeQuery(
    "listProjectRisks",
    listProjectRisks({ projectId: project.realProjectId }),
    [],
    4000,
  );

  const open = risks.filter(
    (r) => !r.mitigationStatus.startsWith("closed_"),
  ).length;

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: project.name, href: `/development-os/projects/${slug}` },
          { label: "Risks" },
        ]}
        eyebrow={`${open} open · ${risks.length} total`}
        title="Risk Register"
        description="Sorted by risk_score (probability × impact) descending. Score is a DB GENERATED column — never drifts from the inputs."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="secondary">
              <Link href={`/development-os/projects/${slug}/risks/heatmap`}>
                Heatmap
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/development-os/projects/${slug}/risks/new`}>
                <Plus className="w-4 h-4" strokeWidth={1.75} />
                New risk
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

      {risks.length === 0 ? (
        <EmptyState
          title="No risks logged yet"
          description="Capture risks as you spot them — the daily elevation cron flags scores ≥ 15."
        />
      ) : (
        <Section eyebrow="Register" title="All risks (highest score first)">
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Title</TH>
                <TH>Category</TH>
                <TH>Probability</TH>
                <TH>Impact</TH>
                <TH>Score</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {risks.map((r) => (
                <TR key={r.id}>
                  <TD className="font-mono text-xs">
                    <Link
                      href={`/development-os/projects/${slug}/risks/${r.riskCode}`}
                      className="hover:underline"
                    >
                      {r.riskCode}
                    </Link>
                  </TD>
                  <TD className="text-sm">{r.title}</TD>
                  <TD className="text-xs">{r.category}</TD>
                  <TD className="text-xs">{r.probability}</TD>
                  <TD className="text-xs">{r.impact}</TD>
                  <TD>
                    <Badge tone={scoreTone(r.riskScore)}>
                      {r.riskScore ?? "—"}
                    </Badge>
                  </TD>
                  <TD>
                    <Badge tone={STATUS_TONE[r.mitigationStatus] ?? "neutral"}>
                      {r.mitigationStatus}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Section>
      )}
    </DevelopmentShell>
  );
}
