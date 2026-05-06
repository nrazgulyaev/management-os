import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getProjectRiskByCode } from "@/lib/development/server/risks/risk-queries";

export const metadata: Metadata = { title: "Risk · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "success" | "warning" | "danger" | "neutral"> = {
  identified: "warning",
  planning_mitigation: "info",
  mitigating: "info",
  monitored: "neutral",
  closed_resolved: "success",
  closed_realized: "danger",
};

export default async function RiskDetailPage({
  params,
}: {
  params: Promise<{ slug: string; code: string }>;
}) {
  const { slug, code } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Risk" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const risk = await getProjectRiskByCode(decodeURIComponent(code));
  if (!risk) notFound();

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Risks", href: `/development-os/projects/${slug}/risks` },
          { label: risk.riskCode },
        ]}
        eyebrow={`Score ${risk.riskScore ?? "?"} · ${risk.mitigationStatus}`}
        title={risk.title}
        description={risk.description}
        actions={
          <Button asChild variant="secondary">
            <Link href={`/development-os/projects/${slug}/risks`}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Risks
            </Link>
          </Button>
        }
      />

      <Section eyebrow="Assessment" title="Probability + impact + score">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Field label="Category" value={risk.category} />
          <Field label="Probability" value={risk.probability} />
          <Field label="Impact" value={risk.impact} />
          <Field
            label="Risk score (P × I)"
            value={String(risk.riskScore ?? "—")}
          />
        </div>
        <div className="mt-3">
          <Badge tone={STATUS_TONE[risk.mitigationStatus] ?? "neutral"}>
            {risk.mitigationStatus}
          </Badge>
        </div>
      </Section>

      {risk.mitigationPlan && (
        <Section eyebrow="Mitigation" title="Plan">
          <p className="text-sm text-ink-secondary whitespace-pre-wrap leading-relaxed">
            {risk.mitigationPlan}
          </p>
          {risk.mitigationDeadline && (
            <p className="text-xs text-ink-tertiary mt-2">
              Deadline: {risk.mitigationDeadline}
            </p>
          )}
        </Section>
      )}

      <Section eyebrow="Impact estimates" title="Cost + schedule">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field
            label="Cost impact"
            value={
              risk.estimatedCostImpactMinor != null
                ? `$${(Number(risk.estimatedCostImpactMinor) / 100).toLocaleString()}`
                : "—"
            }
          />
          <Field
            label="Schedule impact (days)"
            value={String(risk.estimatedScheduleImpactDays ?? "—")}
          />
        </div>
      </Section>

      <Section eyebrow="Lifecycle" title="Identification + closure">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <Field label="Identified at" value={risk.identifiedAt} />
          <Field label="Closed at" value={risk.closedAt ?? "—"} />
          <Field label="Closed reason" value={risk.closedReason ?? "—"} />
          <Field
            label="Owner"
            value={risk.ownerId?.slice(0, 8) ?? "—"}
            mono
          />
        </div>
      </Section>
    </DevelopmentShell>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
        {label}
      </div>
      <div className={`mt-0.5 ${mono ? "font-mono text-xs" : "text-sm"}`}>
        {value}
      </div>
    </div>
  );
}
