import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import {
  getAlertByCode,
  listSimilarAlerts,
} from "@/lib/development/server/risk-radar/risk-radar-queries";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { AlertActions } from "./_alert-actions";

/** Pull a project id out of the alert's affectedEntities JSONB, if present. */
function firstProjectId(affected: unknown): string | null {
  if (!affected || typeof affected !== "object") return null;
  const rec = affected as Record<string, unknown>;
  const ids = rec.projectIds ?? rec.projectId;
  if (Array.isArray(ids)) {
    const v = ids.find((x) => typeof x === "string");
    return typeof v === "string" ? v : null;
  }
  return typeof ids === "string" ? ids : null;
}

export const metadata: Metadata = { title: "Risk alert · Development OS" };
export const dynamic = "force-dynamic";

const SEVERITY_TONE: Record<
  string,
  "info" | "success" | "warning" | "danger" | "neutral"
> = {
  info: "info",
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger",
};

export default async function RiskAlertDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const [alert, me] = await Promise.all([
    getAlertByCode(code),
    getCurrentAppUser().catch(() => null),
  ]);
  if (!alert) notFound();

  const similar = await listSimilarAlerts({
    alertId: alert.id,
    alertCategory: alert.alertCategory,
    detectionMethod: alert.detectionMethod,
  }).catch(() => []);
  const rfqProjectId = firstProjectId(alert.affectedEntities);

  return (
    <DevelopmentShell>
      <PageHeader
        title={alert.title}
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Risk radar", href: "/development-os/risk-radar" },
          { label: alert.alertCode },
        ]}
        description={`${alert.alertCategory} · detected ${new Date(alert.detectedAt).toLocaleString()}`}
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/risk-radar">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Back to inbox
            </Link>
          </Button>
        }
      />

      <Section title="Status">
        <div className="flex gap-2">
          <Badge tone={SEVERITY_TONE[alert.severity] ?? "neutral"}>
            severity: {alert.severity}
          </Badge>
          <Badge tone="info">status: {alert.status}</Badge>
          {alert.confidenceLevel && (
            <Badge tone="neutral">confidence: {alert.confidenceLevel}</Badge>
          )}
          {alert.isRecurring && <Badge tone="warning">recurring pattern</Badge>}
        </div>
        {me?.id && (
          <div className="mt-4">
            <AlertActions
              alertCode={alert.alertCode}
              status={alert.status}
              userId={me.id}
              initialPlan={alert.notes ?? null}
              rfqProjectId={rfqProjectId}
            />
          </div>
        )}
      </Section>

      <Section title="Description">
        <p className="text-sm leading-relaxed">{alert.description}</p>
      </Section>

      {alert.detectedPattern && (
        <Section title="Pattern">
          <code className="text-xs bg-muted/40 px-2 py-1 rounded">
            {alert.detectedPattern}
          </code>
        </Section>
      )}

      {alert.recommendedAction && (
        <Section title="Recommended action">
          <p className="text-sm leading-relaxed">{alert.recommendedAction}</p>
        </Section>
      )}

      <Section
        title="Similar risks"
        description="Other alerts in this category / detection method and how they were handled."
      >
        {similar.length === 0 ? (
          <EmptyState
            title="No similar risks yet"
            description="This is the first alert of its kind."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Alert</TH>
                <TH>Severity</TH>
                <TH>Status</TH>
                <TH>Detected</TH>
                <TH>Resolution</TH>
              </TR>
            </THead>
            <TBody>
              {similar.map((s) => (
                <TR key={s.id}>
                  <TD>
                    <Link
                      href={`/development-os/risk-radar/${s.alertCode}`}
                      className="font-medium hover:underline"
                    >
                      {s.title}
                    </Link>
                    <div className="text-xs text-ink-secondary">
                      {s.alertCode}
                    </div>
                  </TD>
                  <TD>
                    <Badge tone={SEVERITY_TONE[s.severity] ?? "neutral"}>
                      {s.severity}
                    </Badge>
                  </TD>
                  <TD>
                    <Badge tone="neutral">{s.status}</Badge>
                  </TD>
                  <TD>{new Date(s.detectedAt).toLocaleDateString()}</TD>
                  <TD className="max-w-xs">
                    <span className="text-xs text-ink-secondary line-clamp-2">
                      {s.resolutionNotes ??
                        (s.resolvedAt ? "Resolved" : "—")}
                    </span>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>

      {alert.notes && (
        <Section title="Mitigation plan">
          <pre className="text-sm whitespace-pre-wrap leading-relaxed bg-muted/20 p-3 rounded">
            {alert.notes}
          </pre>
        </Section>
      )}

      {alert.aiReasoning && (
        <Section title="AI reasoning">
          <pre className="text-xs whitespace-pre-wrap leading-relaxed bg-muted/30 p-3 rounded">
            {alert.aiReasoning}
          </pre>
        </Section>
      )}

      {alert.affectedEntities != null && (
        <Section title="Affected entities">
          <pre className="text-xs whitespace-pre-wrap font-mono bg-muted/30 p-3 rounded">
            {JSON.stringify(alert.affectedEntities as unknown, null, 2)}
          </pre>
        </Section>
      )}

      {alert.supportingData != null && (
        <Section title="Supporting data">
          <pre className="text-xs whitespace-pre-wrap font-mono bg-muted/30 p-3 rounded">
            {JSON.stringify(alert.supportingData as unknown, null, 2)}
          </pre>
        </Section>
      )}

      {alert.resolvedAt && (
        <Section title="Resolution">
          <p className="text-sm">
            Resolved at {new Date(alert.resolvedAt).toLocaleString()}.
          </p>
          {alert.resolutionNotes && (
            <p className="text-sm text-ink-secondary mt-2">
              {alert.resolutionNotes}
            </p>
          )}
        </Section>
      )}
    </DevelopmentShell>
  );
}
