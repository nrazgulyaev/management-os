import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD} from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getDevelopmentProjectBySlug } from "@/lib/development/server/projects";
import { listProjectRisks } from "@/lib/development/server/risks/risk-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Risks · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "ok" | "warn" | "danger" | "soft"> = {
  identified: "warn",
  planning_mitigation: "info",
  mitigating: "info",
  monitored: "soft",
  closed_resolved: "ok",
  closed_realized: "danger",
};

function scoreTone(score: number | null): "danger" | "warn" | "info" | "soft" {
  if (score == null) return "soft";
  if (score >= 15) return "danger";
  if (score >= 8) return "warn";
  if (score >= 4) return "info";
  return "soft";
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
        <div className="page-header">
          <div className="left">
            <h1>Risks</h1>
          </div>
        </div>
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href={`/development-os/projects/${slug}`}>{project.name}</Link> /{" "}
            <span>Risks</span>
          </div>
          <h1>Risk Register</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Sorted by risk_score (probability × impact) descending. Score is a DB
            GENERATED column — never drifts from the inputs.
          </p>
        </div>
        <div className="actions">
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
        </div>
      </div>

      {risks.length === 0 ? (
        <EmptyState
          title="No risks logged yet"
          description="Capture risks as you spot them — the daily elevation cron flags scores ≥ 15."
        />
      ) : (
        <div>
          <div className="label mb-2.5">Register</div>
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
                    <HandoffBadge tone={scoreTone(r.riskScore)}>
                      {r.riskScore ?? "—"}
                    </HandoffBadge>
                  </TD>
                  <TD>
                    <HandoffBadge tone={STATUS_TONE[r.mitigationStatus] ?? "soft"}>
                      {r.mitigationStatus}
                    </HandoffBadge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </DevelopmentShell>
  );
}
