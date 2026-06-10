import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import {
  getAlertByCode,
  listSimilarAlerts,
} from "@/lib/development/server/risk-radar/risk-radar-queries";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { ExecutiveRiskActions } from "./_risk-actions";

/**
 * Dev OS Executive cabinet — single-risk investigation.
 *
 * Mock: cc-functional-handoff/cabinets/new/dev-executive.html §03
 * (`/executive/risk/[id]`). Reads the same risk_radar_alerts row the
 * legacy risk-radar drill-in uses (the [id] segment carries the alert
 * code), adds the executive framing: profile key-values · signals ·
 * similar-risk history · REAL lifecycle actions. The deeper mitigation
 * toolkit (RFQ / lock price / brief board / plan editor) lives on the
 * risk-radar drill-in — linked, not duplicated.
 */

export const metadata: Metadata = { title: "Risk · Executive · Development OS" };
export const dynamic = "force-dynamic";

function severityTone(sev: string): "danger" | "warn" | "soft" {
  if (sev === "critical" || sev === "high") return "danger";
  if (sev === "medium") return "warn";
  return "soft";
}

function daysAgo(d: Date | string): string {
  const ms = Date.now() - +new Date(d);
  const days = Math.floor(ms / 86_400_000);
  if (days <= 0) return "today";
  return `${days}d ago`;
}

function KvRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-3 py-[7px] border-b border-[var(--line-soft)] last:border-b-0 text-[12.5px]">
      <span className="mono text-[10.5px] text-[var(--ink-3)] uppercase tracking-[0.1em] pt-0.5">
        {k}
      </span>
      <span className="text-ink min-w-0 break-words">{v}</span>
    </div>
  );
}

export default async function ExecutiveRiskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [alert, me] = await Promise.all([
    getAlertByCode(decodeURIComponent(id)),
    getCurrentAppUser().catch(() => null),
  ]);
  if (!alert) notFound();

  const similar = await listSimilarAlerts({
    alertId: alert.id,
    alertCategory: alert.alertCategory,
    detectionMethod: alert.detectionMethod,
    limit: 6,
  }).catch(() => []);

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/executive">Executive</Link> / risk /{" "}
            {alert.alertCode}
          </div>
          <h1>
            {alert.title}{" "}
            <span className="text-[var(--danger)]">
              · {alert.severity.toUpperCase()}
            </span>
          </h1>
          <p className="mt-2 mb-0 mono text-[11px] text-[var(--ink-3)] uppercase tracking-[0.08em]">
            severity {alert.severity} · status{" "}
            {alert.status.replace(/_/g, " ")} · detected{" "}
            {daysAgo(alert.detectedAt)} ·{" "}
            {alert.alertCategory.replace(/_/g, " ")}
          </p>
        </div>
        <div className="actions">
          <Link
            href={`/development-os/risk-radar/${alert.alertCode}`}
            className="btn btn-secondary btn-sm"
          >
            Mitigation toolkit →
          </Link>
          <Link
            href="/development-os/executive"
            className="btn btn-secondary btn-sm"
          >
            ← Executive
          </Link>
        </div>
      </div>

      <div className="cfo-grid">
        {/* Left column — risk profile + similar-risk history. */}
        <div className="flex flex-col gap-[18px]">
          <Card padding="default">
            <div className="cfo-card-head">
              <h3 className="cfo-card-title">Risk profile</h3>
              <HandoffBadge tone={severityTone(alert.severity)}>
                {alert.severity}
              </HandoffBadge>
            </div>
            <div className="mt-1">
              <KvRow
                k="category"
                v={alert.alertCategory.replace(/_/g, " ")}
              />
              <KvRow
                k="detected"
                v={`${new Date(alert.detectedAt).toLocaleString()} (${daysAgo(alert.detectedAt)})`}
              />
              <KvRow
                k="source"
                v={`${alert.detectionSource.replace(/_/g, " ")}${alert.detectionMethod ? ` · ${alert.detectionMethod}` : ""}`}
              />
              {alert.confidenceLevel && (
                <KvRow k="confidence" v={alert.confidenceLevel} />
              )}
              <KvRow
                k="recurring"
                v={
                  alert.isRecurring
                    ? `yes · ${alert.similarAlertsCount} similar`
                    : "no"
                }
              />
              {alert.acknowledgedAt && (
                <KvRow
                  k="acknowledged"
                  v={new Date(alert.acknowledgedAt).toLocaleString()}
                />
              )}
              {alert.resolvedAt && (
                <KvRow
                  k="resolved"
                  v={new Date(alert.resolvedAt).toLocaleString()}
                />
              )}
            </div>
            <p className="cfo-card-sub mt-[14px] mb-0 leading-relaxed">
              {alert.description}
            </p>
          </Card>

          <Card padding="default">
            <div className="cfo-card-head">
              <h3 className="cfo-card-title">Similar risks · history</h3>
              <span className="label">{similar.length} matches</span>
            </div>
            {similar.length === 0 ? (
              <p className="cfo-card-sub mt-[14px] mb-0">
                First alert of its kind — no history in this category or
                detection method yet.
              </p>
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>Alert</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Resolution</th>
                  </tr>
                </thead>
                <tbody>
                  {similar.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <Link
                          href={`/development-os/executive/risk/${s.alertCode}`}
                          className="font-medium text-ink hover:underline"
                        >
                          {s.title}
                        </Link>
                        <div className="mono text-[10px] text-[var(--ink-3)]">
                          {s.alertCode} ·{" "}
                          {new Date(s.detectedAt).toLocaleDateString()}
                        </div>
                      </td>
                      <td>
                        <HandoffBadge tone={severityTone(s.severity)}>
                          {s.severity}
                        </HandoffBadge>
                      </td>
                      <td>
                        <HandoffBadge>
                          {s.status.replace(/_/g, " ")}
                        </HandoffBadge>
                      </td>
                      <td className="text-[12px] text-[var(--ink-3)]">
                        {s.resolutionNotes ?? (s.resolvedAt ? "Resolved" : "—")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        {/* Right column — signals, mitigation plan, lifecycle actions. */}
        <div className="flex flex-col gap-[18px]">
          {(alert.detectedPattern ||
            alert.recommendedAction ||
            alert.supportingData != null ||
            alert.affectedEntities != null) && (
            <Card padding="default">
              <div className="cfo-card-head">
                <h3 className="cfo-card-title">Signals</h3>
                <span className="label">
                  {alert.detectionSource.replace(/_/g, " ")}
                </span>
              </div>
              {alert.detectedPattern && (
                <KvRow
                  k="pattern"
                  v={<code className="mono text-[11px]">{alert.detectedPattern}</code>}
                />
              )}
              {alert.recommendedAction && (
                <KvRow k="recommended" v={alert.recommendedAction} />
              )}
              {alert.affectedEntities != null && (
                <KvRow
                  k="affects"
                  v={
                    <pre className="mono text-[10.5px] whitespace-pre-wrap m-0">
                      {JSON.stringify(alert.affectedEntities, null, 2)}
                    </pre>
                  }
                />
              )}
              {alert.supportingData != null && (
                <KvRow
                  k="data"
                  v={
                    <pre className="mono text-[10.5px] whitespace-pre-wrap m-0">
                      {JSON.stringify(alert.supportingData, null, 2)}
                    </pre>
                  }
                />
              )}
              {alert.aiReasoning && (
                <KvRow k="ai reasoning" v={alert.aiReasoning} />
              )}
            </Card>
          )}

          {alert.notes && (
            <Card padding="default">
              <div className="cfo-card-head">
                <h3 className="cfo-card-title">Mitigation plan</h3>
                <span className="label">from risk radar</span>
              </div>
              <pre className="text-[12.5px] whitespace-pre-wrap leading-relaxed text-[var(--ink-3)] m-0 font-[inherit]">
                {alert.notes}
              </pre>
              <p className="cfo-card-sub mt-[10px] mb-0">
                Edit the plan in the{" "}
                <Link
                  href={`/development-os/risk-radar/${alert.alertCode}`}
                  className="text-[var(--amber)] hover:underline"
                >
                  mitigation toolkit
                </Link>
                .
              </p>
            </Card>
          )}

          <Card padding="default">
            <div className="cfo-card-head">
              <h3 className="cfo-card-title">Actions</h3>
              <span className="label">lifecycle</span>
            </div>
            {me?.id ? (
              <ExecutiveRiskActions
                alertCode={alert.alertCode}
                status={alert.status}
                userId={me.id}
              />
            ) : (
              <p className="cfo-card-sub mt-[14px] mb-0">
                Sign in to acknowledge or resolve this risk.
              </p>
            )}
            {alert.resolutionNotes && (
              <p className="cfo-card-sub mt-[14px] mb-0">
                Resolution: {alert.resolutionNotes}
              </p>
            )}
          </Card>
        </div>
      </div>
    </DevelopmentShell>
  );
}
