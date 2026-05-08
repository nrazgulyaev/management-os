"use client";

import { useState, useTransition } from "react";
import { setAgentCustomPromptAction } from "@/features/ai-agents/agent-config-actions";
import type { ConfigurableAgentKey } from "@/features/ai-agents/agent-config-keys";

interface Props {
  agentKey: ConfigurableAgentKey;
  currentOverride: string | null;
  canonicalPrompt: string;
}

export function CustomPromptForm({
  agentKey,
  currentOverride,
  canonicalPrompt,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(currentOverride ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function save(formData: FormData): void {
    setError(null);
    setSuccess(null);
    const value = String(formData.get("customPrompt") ?? "").trim();
    startTransition(async () => {
      const r = await setAgentCustomPromptAction({
        agentKey,
        customPrompt: value.length > 0 ? value : null,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSuccess(
        r.hasOverride
          ? "Override saved. Future Run-now invocations will use this prompt."
          : "Override cleared. Future Run-now invocations will use the canonical prompt above.",
      );
    });
  }

  function reset(): void {
    setDraft("");
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const r = await setAgentCustomPromptAction({
        agentKey,
        customPrompt: null,
      });
      if (!r.ok) setError(r.error);
      else setSuccess("Override cleared.");
    });
  }

  return (
    <form action={save} className="space-y-3 max-w-3xl">
      <label className="block text-sm">
        <span className="text-ink-secondary">Custom prompt (your override)</span>
        <textarea
          name="customPrompt"
          rows={5}
          maxLength={2000}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="mt-1 w-full rounded border border-line-soft bg-canvas px-3 py-2 text-xs font-mono leading-relaxed"
          placeholder={canonicalPrompt}
        />
        <span className="block text-[10px] text-ink-tertiary mt-1">
          Leave empty to use the canonical prompt. Max 2000 characters.
        </span>
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center rounded-full bg-ink px-4 py-2 text-sm font-medium text-ink-inverse hover:bg-ink/90 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save override"}
        </button>
        {currentOverride !== null && (
          <button
            type="button"
            disabled={pending}
            onClick={reset}
            className="inline-flex items-center rounded-full border border-line-soft bg-surface px-4 py-2 text-sm hover:bg-muted/40 disabled:opacity-60"
          >
            Reset to canonical
          </button>
        )}
        {error && (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="text-xs text-success" role="status">
            {success}
          </p>
        )}
      </div>
    </form>
  );
}
