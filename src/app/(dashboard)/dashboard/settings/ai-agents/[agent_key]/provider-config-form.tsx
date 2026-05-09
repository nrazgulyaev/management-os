"use client";

import { useState, useTransition } from "react";
import {
  setAgentProviderConfigAction,
  testAgentConnectionAction,
  clearAgentApiKeyAction,
  type SetAgentProviderConfigResult,
  type TestAgentConnectionResult,
} from "@/features/ai-agents/agent-provider-actions";
import type { ConfigurableAgentKey } from "@/features/ai-agents/agent-config-keys";

/**
 * Stage 10.5.B — per-agent provider + API key + test-connection UI.
 *
 * Three operations from one form:
 *   - Save (provider + model + optional new API key) — persists; clears
 *     last test status (operator must retest after a save)
 *   - Test connection (provider + model + key — saved key used if no
 *     fresh key supplied)
 *   - Clear API key — wipes the encrypted key and provider override
 */

const PROVIDERS = [
  { value: "anthropic", label: "Anthropic (Claude)" },
  { value: "openai", label: "OpenAI (GPT)" },
  { value: "gemini", label: "Google Gemini" },
] as const;

interface Props {
  agentKey: ConfigurableAgentKey;
  currentProvider: "anthropic" | "openai" | "gemini" | null;
  currentModel: string | null;
  hasApiKey: boolean;
  apiKeySetAt: string | null;
  lastTestStatus: "ok" | "failed" | null;
  lastTestAt: string | null;
  lastTestError: string | null;
}

export function ProviderConfigForm({
  agentKey,
  currentProvider,
  currentModel,
  hasApiKey,
  apiKeySetAt,
  lastTestStatus,
  lastTestAt,
  lastTestError,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [provider, setProvider] = useState<string>(currentProvider ?? "");
  const [model, setModel] = useState<string>(currentModel ?? "");
  const [apiKey, setApiKey] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestAgentConnectionResult | null>(
    null,
  );

  function handleSave(): void {
    setError(null);
    setSuccess(null);
    setTestResult(null);
    startTransition(async () => {
      const result: SetAgentProviderConfigResult =
        await setAgentProviderConfigAction({
          agentKey,
          provider:
            provider === "" ? null : (provider as "anthropic" | "openai" | "gemini"),
          model: model.trim().length === 0 ? null : model.trim(),
          apiKey: apiKey.length === 0 ? null : apiKey,
        });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setApiKey(""); // wipe the typed key from the field
      setSuccess(
        result.hasKey
          ? "Configuration saved. The API key is encrypted and stored. Test the connection to verify."
          : "Configuration saved. (No new API key supplied — the existing one stays in place if it was set.)",
      );
    });
  }

  function handleTest(): void {
    if (provider === "") {
      setError("Pick a provider before testing.");
      return;
    }
    setError(null);
    setSuccess(null);
    setTestResult(null);
    startTransition(async () => {
      const result = await testAgentConnectionAction({
        agentKey,
        provider: provider as "anthropic" | "openai" | "gemini",
        apiKey: apiKey.length > 0 ? apiKey : undefined,
        model: model.trim().length > 0 ? model.trim() : undefined,
      });
      setTestResult(result);
      if (!result.ok) setError(result.error);
    });
  }

  function handleClear(): void {
    if (
      !confirm(
        "Clear the saved API key for this agent? The agent will fall back to the system-wide key.",
      )
    ) {
      return;
    }
    setError(null);
    setSuccess(null);
    setTestResult(null);
    startTransition(async () => {
      const result = await clearAgentApiKeyAction({ agentKey });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setApiKey("");
      setSuccess("API key cleared. Reload to see the updated state.");
    });
  }

  return (
    <div className="rounded border border-line-soft bg-surface p-4 space-y-4 max-w-3xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block text-sm">
          <span className="text-ink-secondary">Provider</span>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="mt-1 w-full rounded border border-line-soft bg-canvas px-3 py-2 text-sm"
            disabled={pending}
          >
            <option value="">Use system default</option>
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <span className="block text-[11px] text-ink-tertiary mt-1">
            Per-agent override. Leave blank to inherit the platform default.
          </span>
        </label>

        <label className="block text-sm">
          <span className="text-ink-secondary">Model</span>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Provider default"
            maxLength={120}
            className="mt-1 w-full rounded border border-line-soft bg-canvas px-3 py-2 text-sm font-mono"
            disabled={pending}
          />
          <span className="block text-[11px] text-ink-tertiary mt-1">
            E.g. <span className="font-mono">claude-opus-4-7</span>,{" "}
            <span className="font-mono">gpt-4o</span>,{" "}
            <span className="font-mono">gemini-1.5-pro</span>.
          </span>
        </label>
      </div>

      <label className="block text-sm">
        <span className="text-ink-secondary">
          API key {hasApiKey && <span className="text-success ml-1">(saved)</span>}
        </span>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={
            hasApiKey
              ? "Leave empty to keep the existing key"
              : "Paste your provider API key"
          }
          maxLength={500}
          className="mt-1 w-full rounded border border-line-soft bg-canvas px-3 py-2 text-xs font-mono"
          autoComplete="off"
          spellCheck={false}
          disabled={pending}
        />
        <span className="block text-[11px] text-ink-tertiary mt-1">
          Encrypted at rest with AES-256-GCM. Never logged.
          {hasApiKey && apiKeySetAt && (
            <>
              {" "}
              Last saved <RelativeDate iso={apiKeySetAt} />.
            </>
          )}
        </span>
      </label>

      {(lastTestStatus || testResult) && (
        <div
          className={`rounded border px-3 py-2 text-xs ${
            (testResult?.ok ?? lastTestStatus === "ok")
              ? "border-success/40 bg-success/5 text-success"
              : "border-danger/40 bg-danger/5 text-danger"
          }`}
        >
          {testResult ? (
            testResult.ok ? (
              <>
                Connection OK — {testResult.provider} ·{" "}
                <span className="font-mono">{testResult.model}</span> ·{" "}
                {testResult.sampleTokens} tokens used.
              </>
            ) : (
              <>Connection failed: {testResult.error}</>
            )
          ) : lastTestStatus === "ok" ? (
            <>
              Last test: OK
              {lastTestAt && (
                <>
                  {" · "}
                  <RelativeDate iso={lastTestAt} />
                </>
              )}
            </>
          ) : (
            <>
              Last test: failed
              {lastTestAt && (
                <>
                  {" · "}
                  <RelativeDate iso={lastTestAt} />
                </>
              )}
              {lastTestError && <div className="mt-1 font-mono">{lastTestError}</div>}
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={handleSave}
          className="inline-flex items-center rounded-full bg-ink px-4 py-2 text-sm font-medium text-ink-inverse hover:bg-ink/90 disabled:opacity-60"
        >
          {pending ? "Working…" : "Save configuration"}
        </button>
        <button
          type="button"
          disabled={pending || provider === ""}
          onClick={handleTest}
          className="inline-flex items-center rounded-full border border-line-soft bg-surface px-4 py-2 text-sm hover:bg-muted/40 disabled:opacity-60"
        >
          Test connection
        </button>
        {hasApiKey && (
          <button
            type="button"
            disabled={pending}
            onClick={handleClear}
            className="inline-flex items-center rounded-full border border-danger/40 bg-surface px-4 py-2 text-sm text-danger hover:bg-danger/5 disabled:opacity-60"
          >
            Clear API key
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
    </div>
  );
}

function RelativeDate({ iso }: { iso: string }) {
  const date = new Date(iso);
  const now = Date.now();
  const diffSec = Math.round((now - date.getTime()) / 1000);
  let copy: string;
  if (diffSec < 60) copy = "just now";
  else if (diffSec < 3600) copy = `${Math.floor(diffSec / 60)}m ago`;
  else if (diffSec < 86400) copy = `${Math.floor(diffSec / 3600)}h ago`;
  else copy = `${Math.floor(diffSec / 86400)}d ago`;
  return <span title={iso}>{copy}</span>;
}
