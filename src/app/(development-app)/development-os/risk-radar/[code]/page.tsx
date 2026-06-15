import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
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
  "info" | "ok" | "warn" | "danger" | "soft"
> = {
  info: "info",
  low: "soft",
  medium: "info",
  high: "warn",
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/risk-radar">Risk radar</Link> /{" "}
            <span>{alert.alertCode}</span>
          </div>
          <h1>{alert.title}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {`${alert.alertCategory} · detected ${new Date(alert.detectedAt).toLocaleString()}`}
          </p>
        </div>
        <div className="actions">
          <Link href="/development-os/risk-radar" className="btn btn-secondary btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Back to inbox
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Status</div>
        <Card padding="default">
          <div className="flex gap-2">
            <HandoffBadge tone={SEVERITY_TONE[alert.severity] ?? "soft"}>
              severity: {alert.severity}
            </HandoffBadge>
            <HandoffBadge tone="info">status: {alert.status}</HandoffBadge>
            {alert.confidenceLevel && (
              <HandoffBadge tone="soft">confidence: {alert.confidenceLevel}</HandoffBadge>
            )}
            {alert.isRecurring && <HandoffBadge tone="warn">recurring pattern</HandoffBadge>}
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
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Description</div>
        <Card padding="default">
          <p className="text-sm leading-relaxed">{alert.description}</p>
        </Card>
      </div>

      {alert.detectedPattern && (
        <div>
          <div className="label mb-2.5">Pattern</div>
          <Card padding="default">
            <code className="text-xs bg-muted/40 px-2 py-1 rounded">
              {alert.detectedPattern}
            </code>
          </Card>
        </div>
      )}

      {alert.recommendedAction && (
        <div>
          <div className="label mb-2.5">Recommended action</div>
          <Card padding="default">
            <p className="text-sm leading-relaxed">{alert.recommendedAction}</p>
          </Card>
        </div>
      )}

      <div>
        <div className="label mb-2.5">Similar risks</div>
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
                    <HandoffBadge tone={SEVERITY_TONE[s.severity] ?? "soft"}>
                      {s.severity}
                    </HandoffBadge>
                  </TD>
                  <TD>
                    <HandoffBadge tone="soft">{s.status}</HandoffBadge>
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
      </div>

      {alert.notes && (
        <div>
          <div className="label mb-2.5">Mitigation plan</div>
          <Card padding="default">
            <pre className="text-sm whitespace-pre-wrap leading-relaxed bg-muted/20 p-3 rounded">
              {alert.notes}
            </pre>
          </Card>
        </div>
      )}

      {alert.aiReasoning && (
        <div>
          <div className="label mb-2.5">AI reasoning</div>
          <Card padding="default">
            <pre className="text-xs whitespace-pre-wrap leading-relaxed bg-muted/30 p-3 rounded">
              {alert.aiReasoning}
            </pre>
          </Card>
        </div>
      )}

      {alert.affectedEntities != null && (
        <div>
          <div className="label mb-2.5">Affected entities</div>
          <Card padding="default">
            <pre className="text-xs whitespace-pre-wrap font-mono bg-muted/30 p-3 rounded">
              {JSON.stringify(alert.affectedEntities as unknown, null, 2)}
            </pre>
          </Card>
        </div>
      )}

      {alert.supportingData != null && (
        <div>
          <div className="label mb-2.5">Supporting data</div>
          <Card padding="default">
            <pre className="text-xs whitespace-pre-wrap font-mono bg-muted/30 p-3 rounded">
              {JSON.stringify(alert.supportingData as unknown, null, 2)}
            </pre>
          </Card>
        </div>
      )}

      {alert.resolvedAt && (
        <div>
          <div className="label mb-2.5">Resolution</div>
          <Card padding="default">
            <p className="text-sm">
              Resolved at {new Date(alert.resolvedAt).toLocaleString()}.
            </p>
            {alert.resolutionNotes && (
              <p className="text-sm text-ink-secondary mt-2">
                {alert.resolutionNotes}
              </p>
            )}
          </Card>
        </div>
      )}
    </DevelopmentShell>
  );
}
