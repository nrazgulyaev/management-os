import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { DevelopmentShell } from "@/components/development/development-shell";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { getCycleRecommendationByCode } from "@/lib/development/server/project-cycle/cycle-queries";
import { CycleReviewActions } from "../_review-actions";

export const metadata: Metadata = {
  title: "Recommendation · Project cycle",
};
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "ok" | "info" | "warn" | "danger"> = {
  unreviewed: "warn",
  reviewed: "info",
  accepted: "ok",
  rejected: "danger",
  partially_accepted: "info",
};

const CONFIDENCE_TONE: Record<string, "ok" | "info" | "warn" | "danger"> = {
  low: "warn",
  medium: "info",
  high: "ok",
};

function formatMetricValue(value: unknown): string {
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? value.toLocaleString()
      : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  if (value == null) return "—";
  return String(value);
}

export default async function CycleRecommendationDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const rec = await getCycleRecommendationByCode(code);
  if (!rec) notFound();

  const metrics = (rec.supportingMetrics ?? {}) as Record<string, unknown>;
  const context = (rec.contextSnapshot ?? {}) as Record<string, unknown>;
  const reasoningLines = (rec.aiReasoning ?? "").split("\n").filter(Boolean);

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/project-cycle">Project cycle</Link> /{" "}
            <span>{rec.recommendationCode}</span>
          </div>
          <h1>{rec.recommendedAction.replace(/_/g, " ")}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {rec.recommendedTiming
              ? `Recommended timing: ${rec.recommendedTiming}`
              : "Advisory recommendation — operator review required."}
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/project-cycle"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Back
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Status</div>
        <Card padding="default">
          <div className="flex flex-wrap items-center gap-2">
            <HandoffBadge tone={STATUS_TONE[rec.operatorStatus] ?? "info"}>
              {rec.operatorStatus.replace(/_/g, " ")}
            </HandoffBadge>
            {rec.confidenceLevel && (
              <HandoffBadge tone={CONFIDENCE_TONE[rec.confidenceLevel] ?? "info"}>
                confidence: {rec.confidenceLevel}
              </HandoffBadge>
            )}
            <HandoffBadge tone="soft">{rec.generatedForDate}</HandoffBadge>
            <HandoffBadge tone="soft">{rec.generatedByAgent}</HandoffBadge>
            <div className="ml-auto">
              <CycleReviewActions
                recommendationId={rec.id}
                currentStatus={rec.operatorStatus}
              />
            </div>
          </div>
          {rec.operatorNotes && (
            <p className="mt-3 text-[13px] text-ink-secondary">
              <span className="font-medium text-ink">Operator notes:</span>{" "}
              {rec.operatorNotes}
            </p>
          )}
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">AI reasoning</div>
        <Card padding="default">
          {reasoningLines.length === 0 ? (
            <p className="text-sm text-ink-tertiary">No reasoning recorded.</p>
          ) : (
            <div className="space-y-2 text-[13.5px] leading-relaxed text-ink-secondary">
              {reasoningLines.map((line, i) => {
                if (line.startsWith("### ")) {
                  return (
                    <h3 key={i} className="text-[15px] font-medium text-ink mt-2">
                      {line.replace(/^###\s*/, "")}
                    </h3>
                  );
                }
                // Render simple **bold** spans inline.
                const parts = line.split(/(\*\*[^*]+\*\*)/g);
                return (
                  <p key={i}>
                    {parts.map((part, j) =>
                      part.startsWith("**") && part.endsWith("**") ? (
                        <strong key={j} className="text-ink font-medium">
                          {part.slice(2, -2)}
                        </strong>
                      ) : (
                        <span key={j}>{part}</span>
                      ),
                    )}
                  </p>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Supporting metrics</div>
        {Object.keys(metrics).length === 0 ? (
          <Card padding="default">
            <p className="text-sm text-ink-tertiary">No metrics recorded.</p>
          </Card>
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Metric</th>
                  <th scope="col" className="num">
                    Value
                  </th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(metrics).map(([key, value]) => (
                  <tr key={key}>
                    <td className="text-[13px] capitalize">
                      {key.replace(/([A-Z])/g, " $1").trim()}
                    </td>
                    <td className="num">{formatMetricValue(value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      <div>
        <div className="label mb-2.5">Context snapshot</div>
        <Card padding="default">
          <pre className="text-[11.5px] leading-relaxed text-ink-secondary whitespace-pre-wrap break-words font-mono">
            {JSON.stringify(context, null, 2)}
          </pre>
        </Card>
      </div>
    </DevelopmentShell>
  );
}
