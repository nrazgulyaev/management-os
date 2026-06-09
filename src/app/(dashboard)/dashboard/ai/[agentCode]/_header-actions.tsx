"use client";

/**
 * AI Cabinet depth pass — agent detail header actions.
 *
 * Replaces the three disabled stub buttons with wired controls:
 *   · Logs       → scrolls to / links the agent's run history panel.
 *   · Pause/Resume → toggles org_ai_agent_config.isEnabled via the
 *                    existing setAgentEnabledAction; reflects state.
 *   · Test run   → fires runMgmtAgentAction; surfaces the reply runId.
 *
 * Cream/stone/ink Layer-B btn classes only — no raw bg-black buttons.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setAgentEnabledAction } from "@/features/ai-agents/agent-config-actions";
import { runMgmtAgentAction } from "@/features/ai-agents/mgmt-agent-run-action";
import type { ConfigurableAgentKey } from "@/features/ai-agents/agent-config-keys";

export interface AgentHeaderActionsProps {
  agentCode: string;
  assistantKey: string;
  configurable: boolean;
  initialEnabled: boolean;
  logsHref: string;
}

export function AgentHeaderActions({
  agentCode,
  assistantKey,
  configurable,
  initialEnabled,
  logsHref,
}: AgentHeaderActionsProps) {
  const router = useRouter();
  const [enabled, setEnabled] = React.useState(initialEnabled);
  const [togglePending, startToggle] = React.useTransition();
  const [runPending, startRun] = React.useTransition();
  const [feedback, setFeedback] = React.useState<
    { tone: "ok" | "err"; text: string; runId?: string } | null
  >(null);

  function handleToggle() {
    if (!configurable) return;
    setFeedback(null);
    const next = !enabled;
    startToggle(async () => {
      const r = await setAgentEnabledAction({
        agentKey: assistantKey as ConfigurableAgentKey,
        enabled: next,
      });
      if (r.ok) {
        setEnabled(next);
        router.refresh();
      } else {
        setFeedback({ tone: "err", text: r.error });
      }
    });
  }

  function handleTestRun() {
    setFeedback(null);
    startRun(async () => {
      const r = await runMgmtAgentAction({
        agentCode,
        prompt: "Produce a concise current snapshot for this agent's domain.",
        mode: "test",
      });
      if (r.ok) {
        setFeedback({
          tone: "ok",
          text: `Run complete · ${r.totalTokens ?? 0} tokens`,
          runId: r.runId,
        });
        router.refresh();
      } else {
        setFeedback({ tone: "err", text: r.error });
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <Link href={logsHref} className="btn btn-ghost btn-sm">
          Logs
        </Link>
        {configurable && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleToggle}
            disabled={togglePending}
          >
            {togglePending ? "…" : enabled ? "Pause agent" : "Resume agent"}
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={handleTestRun}
          disabled={runPending}
        >
          {runPending ? "Running…" : "▶ Test run"}
        </button>
      </div>
      {feedback && (
        <p
          className={`text-[11px] m-0 ${feedback.tone === "err" ? "text-danger" : "text-ink-3"}`}
          role={feedback.tone === "err" ? "alert" : undefined}
        >
          {feedback.text}
          {feedback.runId && (
            <>
              {" · "}
              <Link
                href={`/dashboard/ai/runs/${feedback.runId}`}
                className="underline underline-offset-2"
              >
                view run
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}
