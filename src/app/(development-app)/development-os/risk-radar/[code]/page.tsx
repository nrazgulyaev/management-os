import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getAlertByCode } from "@/lib/development/server/risk-radar/risk-radar-queries";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { AlertActions } from "./_alert-actions";

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
