import * as React from "react";
import { Sparkles } from "lucide-react";
import {
  loadInvestorCopilotOutputs,
  type InvestorCopilotOutput,
} from "@/lib/development/server/ai/investor-copilot-queries";

/**
 * feat/w1de-lp-dashboard-gp-waterfall-copilot — Investor copilot panel.
 *
 * Server component that surfaces the latest `investor_copilot`
 * agent_outputs (title / summary / recommendedActions) for the calling
 * investor. Replaces the dead "Coming soon" badge with a real AI surface
 * that gracefully shows an empty-state until the agent has produced runs.
 *
 * Stone-theme safe: only Tailwind tokens + a lucide glyph, no
 * @/components/ui/primitives import (10.J.2 guardrail).
 */

function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export interface InvestorCopilotPanelProps {
  investorId: string;
  /** How many recent outputs to surface. Defaults to 3. */
  limit?: number;
}

export async function InvestorCopilotPanel({
  investorId,
  limit = 3,
}: InvestorCopilotPanelProps) {
  let outputs: InvestorCopilotOutput[] = [];
  try {
    outputs = await loadInvestorCopilotOutputs({ investorId, limit });
  } catch {
    outputs = [];
  }

  return (
    <section
      className="rounded-3xl border border-line-soft bg-surface shadow-soft-card overflow-hidden"
      data-stage10="investor-copilot-panel"
    >
      <header className="flex items-center justify-between gap-3 px-5 md:px-6 py-4 border-b border-line-soft">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-canvas border border-line-soft">
            <Sparkles className="w-4 h-4 text-ink-secondary" strokeWidth={1.75} />
          </span>
          <div className="flex flex-col">
            <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-ink-tertiary">
              AI insights
            </span>
            <h3 className="text-display text-[18px] md:text-[20px] leading-tight font-medium text-ink">
              Investor copilot
            </h3>
          </div>
        </div>
        <span className="shrink-0 text-[10px] font-mono uppercase tracking-[0.16em] text-ink-tertiary">
          {outputs.length > 0 ? `${outputs.length} latest` : "Beta"}
        </span>
      </header>

      {outputs.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <p className="text-sm font-medium text-ink-secondary">
            No copilot insights yet.
          </p>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-ink-tertiary">
            When the investor copilot reviews your position, its
            briefings — what changed, what to watch, and suggested next
            steps — will appear here.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line-soft">
          {outputs.map((o) => (
            <li key={o.id} className="px-5 md:px-6 py-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-ink-tertiary">
                  {o.outputCode}
                </span>
                <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-ink-tertiary">
                  · {o.status}
                </span>
                {o.createdAt && (
                  <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-ink-tertiary tabular-nums">
                    · {formatStamp(o.createdAt)}
                  </span>
                )}
              </div>
              <h4 className="mt-1.5 text-base font-medium text-ink">
                {o.title}
              </h4>
              {o.summary && (
                <p className="mt-1.5 text-sm leading-relaxed text-ink-secondary whitespace-pre-line">
                  {o.summary}
                </p>
              )}
              {o.recommendedActions.length > 0 && (
                <div className="mt-3">
                  <div className="text-[11px] uppercase tracking-widest text-ink-tertiary mb-1.5">
                    Recommended actions
                  </div>
                  <ul className="space-y-1.5 text-sm text-ink-secondary">
                    {o.recommendedActions.slice(0, 5).map((a, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-ink">•</span>
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
