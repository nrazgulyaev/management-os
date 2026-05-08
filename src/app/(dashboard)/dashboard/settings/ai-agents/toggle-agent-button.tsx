"use client";

import { useState, useTransition } from "react";
import { setAgentEnabledAction } from "@/features/ai-agents/agent-config-actions";
import type { ConfigurableAgentKey } from "@/features/ai-agents/agent-config-keys";

export function ToggleAgentButton({
  agentKey,
  currentEnabled,
}: {
  agentKey: ConfigurableAgentKey;
  currentEnabled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleToggle(): void {
    setError(null);
    const next = !currentEnabled;
    startTransition(async () => {
      const r = await setAgentEnabledAction({ agentKey, enabled: next });
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={handleToggle}
        className={
          currentEnabled
            ? "rounded-full border border-line-soft bg-surface px-3 py-1 text-xs hover:bg-muted/40 disabled:opacity-60"
            : "rounded-full bg-ink px-3 py-1 text-xs font-medium text-ink-inverse hover:bg-ink/90 disabled:opacity-60"
        }
        title={
          currentEnabled
            ? "Disable this agent for your workspace"
            : "Enable this agent for your workspace"
        }
      >
        {pending ? "…" : currentEnabled ? "Disable" : "Enable"}
      </button>
      {error && (
        <p className="text-[10px] text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
