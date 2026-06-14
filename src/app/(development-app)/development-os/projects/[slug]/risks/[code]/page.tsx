import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getProjectRiskByCode } from "@/lib/development/server/risks/risk-queries";

export const metadata: Metadata = { title: "Risk · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "ok" | "warn" | "danger" | "soft"> = {
  identified: "warn",
  planning_mitigation: "info",
  mitigating: "info",
  monitored: "soft",
  closed_resolved: "ok",
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
        <div className="page-header">
          <div className="left">
            <h1>Risk</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const risk = await getProjectRiskByCode(decodeURIComponent(code));
  if (!risk) notFound();

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href={`/development-os/projects/${slug}/risks`}>Risks</Link> /{" "}
            <span>{risk.riskCode}</span>
          </div>
          <h1>{risk.title}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">{risk.description}</p>
        </div>
        <div className="actions">
          <Link
            href={`/development-os/projects/${slug}/risks`}
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Risks
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Assessment</div>
        <Card padding="default">
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
            <HandoffBadge tone={STATUS_TONE[risk.mitigationStatus] ?? "soft"}>
              {risk.mitigationStatus}
            </HandoffBadge>
          </div>
        </Card>
      </div>

      {risk.mitigationPlan && (
        <div>
          <div className="label mb-2.5">Mitigation</div>
          <Card padding="default">
            <p className="text-sm text-ink-secondary whitespace-pre-wrap leading-relaxed">
              {risk.mitigationPlan}
            </p>
            {risk.mitigationDeadline && (
              <p className="text-xs text-ink-tertiary mt-2">
                Deadline: {risk.mitigationDeadline}
              </p>
            )}
          </Card>
        </div>
      )}

      <div>
        <div className="label mb-2.5">Impact estimates</div>
        <Card padding="default">
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
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Lifecycle</div>
        <Card padding="default">
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
        </Card>
      </div>
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
