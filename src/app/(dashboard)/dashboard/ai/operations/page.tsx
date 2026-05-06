import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { OperationsCopilotRefreshButton } from "@/components/ai/operations-copilot-refresh-button";
import {
  getLatestOperationsSummary,
  listOperationsSummaries,
} from "@/features/ai/operations-copilot/service";
import { isAiConfigured, isAiDryRun } from "@/lib/env";

export const metadata = { title: "AI Operations Co-pilot" };
export const dynamic = "force-dynamic";

const RISK_TONES: Record<string, "neutral" | "info" | "warning" | "danger" | "success"> = {
  normal: "success",
  elevated: "warning",
  high: "danger",
};

export default async function AIOperationsPage() {
  const [latest, history] = await Promise.all([
    getLatestOperationsSummary(),
    listOperationsSummaries({ limit: 30 }),
  ]);
  const aiActive = isAiConfigured() && !isAiDryRun();

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "AI assistants", href: "/dashboard/ai" },
          { label: "Operations Co-pilot" },
        ]}
        title="Operations Co-pilot v0"
        description="Read-only daily briefing built from a strict tool allowlist. The model never writes — every recommendation is for a human to action."
      />

      <div className="rounded-md border border-line-soft bg-surface p-4 flex flex-wrap items-center gap-3 text-sm">
        <Badge tone={aiActive ? "success" : "warning"}>
          {aiActive ? "Live" : "Fallback"}
        </Badge>
        <span className="text-ink-secondary">
          {aiActive
            ? "ANTHROPIC_API_KEY is set and AI_DRY_RUN=0 — model calls are live."
            : "AI is disabled. Showing deterministic fallback derived from the operations snapshot."}
        </span>
        <div className="ml-auto">
          <OperationsCopilotRefreshButton />
        </div>
      </div>

      {latest ? (
        <Section
          eyebrow="Latest"
          title={latest.title}
          description={`Generated ${latest.createdAt.slice(0, 16).replace("T", " ")}`}
        >
          <div className="rounded-md border border-line-soft bg-surface p-5 md:p-6">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge tone={RISK_TONES[latest.riskLevel] ?? "neutral"}>
                Risk: {latest.riskLevel}
              </Badge>
              {latest.runId && (
                <Link
                  href={`/dashboard/ai/runs/${latest.runId}`}
                  className="text-xs text-ink-tertiary hover:text-ink underline-offset-4 hover:underline"
                >
                  View run detail →
                </Link>
              )}
            </div>
            <p className="text-sm text-ink-secondary mt-3 whitespace-pre-line leading-relaxed">
              {latest.executiveSummary}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-6">
              <Column title="Highlights" items={latest.highlights} />
              <Column title="Risks" items={latest.risks} />
              <Column title="Recommended actions" items={latest.recommendedActions} />
            </div>
          </div>
        </Section>
      ) : (
        <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
          No briefing yet. Click refresh to generate one.
        </p>
      )}

      <Section eyebrow="History" title="Past briefings">
        {history.length <= 1 ? (
          <p className="text-sm text-ink-tertiary">
            History will populate as briefings are generated.
          </p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <ul className="divide-y divide-line-soft">
              {history.slice(1).map((s) => (
                <li
                  key={s.id}
                  className="p-4 flex items-start justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge tone={RISK_TONES[s.riskLevel] ?? "neutral"}>
                        {s.riskLevel}
                      </Badge>
                      <Badge tone="neutral">{s.status}</Badge>
                      <span className="text-[11px] text-ink-tertiary tabular-nums">
                        {s.createdAt.slice(0, 16).replace("T", " ")}
                      </span>
                    </div>
                    <div className="text-sm text-ink mt-1.5">{s.title}</div>
                  </div>
                  {s.runId && (
                    <Link
                      href={`/dashboard/ai/runs/${s.runId}`}
                      className="text-xs text-ink-tertiary hover:text-ink underline-offset-4 hover:underline"
                    >
                      Run →
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>
    </div>
  );
}

function Column({
  title,
  items,
}: {
  title: string;
  items: Array<{ title: string; detail?: string; source?: string }>;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-widest text-ink-tertiary mb-2">
        {title}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-ink-tertiary">None.</p>
      ) : (
        <ul className="text-sm text-ink-secondary space-y-2">
          {items.map((it, i) => (
            <li key={i}>
              <div className="text-ink">{it.title}</div>
              {it.detail && (
                <div className="text-ink-tertiary text-xs mt-0.5">
                  {it.detail}
                </div>
              )}
              {it.source && (
                <div className="text-[10px] text-ink-tertiary uppercase tracking-widest mt-0.5">
                  {it.source}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
