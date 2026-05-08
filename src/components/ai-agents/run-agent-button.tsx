"use client";

/**
 * Stage 8.B.1 — "Run now" CTA shipped on each of the 7 agent pages.
 *
 * Posts to runAgentAction, surfaces pending / success / error states,
 * and on success refreshes the page so the new output row appears.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { runAgentAction } from "@/features/ai-agents/run-agent-action";
import type { RunNowAgentKey } from "@/features/ai-agents/run-agent-config";

export function RunAgentButton({
  agentKey,
  label = "Run now",
}: {
  agentKey: RunNowAgentKey;
  label?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lastOutputCode, setLastOutputCode] = useState<string | null>(null);

  function handleClick(): void {
    setError(null);
    setLastOutputCode(null);
    startTransition(async () => {
      const result = await runAgentAction({ agentKey });
      if (result.ok) {
        setLastOutputCode(result.outputCode);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="inline-flex items-center gap-2 self-start rounded-full bg-ink px-4 py-2 text-sm font-medium text-ink-inverse transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
        ) : (
          <Sparkles className="h-4 w-4" strokeWidth={1.75} />
        )}
        {isPending ? "Running…" : label}
      </button>
      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
      {lastOutputCode && (
        <p className="text-xs text-ink-secondary">
          Output created:{" "}
          <span className="font-mono text-ink">{lastOutputCode}</span>
        </p>
      )}
    </div>
  );
}
