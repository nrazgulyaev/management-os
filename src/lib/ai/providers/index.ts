import "server-only";

import { isAiConfigured, isAiDryRun } from "@/lib/env";
import { AnthropicProvider } from "./anthropic";
import { DryRunProvider } from "./dry-run";
import { GeminiProvider } from "./gemini";
import { OpenAIProvider } from "./openai";
import type { AIProvider } from "./types";

export type {
  AIProvider,
  AICompletionRequest,
  AICompletionResponse,
  AIMessage,
  AIImageAttachment,
} from "./types";
export { AIProviderError, AIProviderUnavailableError } from "./types";
export { PHOTO_ANALYST_PROMPT_MARKER } from "./dry-run";

let cached: AIProvider | null = null;

/**
 * Returns the configured AI provider for the current process.
 *
 * Selection (Stage 3.B + Stage 6.P6):
 *   1. AI_DRY_RUN=1 (default in tests/dev) OR no AI key configured →
 *      DryRunProvider. Deterministic, free, no network.
 *   2. AI_PROVIDER=openai → OpenAIProvider. Operator opt-in;
 *      requires OPENAI_API_KEY.
 *   3. AI_PROVIDER=gemini → GeminiProvider. Operator opt-in;
 *      requires GEMINI_API_KEY.
 *   4. Otherwise → AnthropicProvider (default live path).
 *
 * Agents must never bypass this factory. Per-agent provider override
 * comes via `getAIProviderByName` (P6.B) — invocation-time
 * not process-time.
 */
export function getAIProvider(): AIProvider {
  if (cached) return cached;
  if (isAiDryRun() || !hasAnyAIKey()) {
    cached = new DryRunProvider();
  } else if (process.env.AI_PROVIDER === "openai") {
    cached = new OpenAIProvider();
  } else if (process.env.AI_PROVIDER === "gemini") {
    cached = new GeminiProvider();
  } else {
    cached = new AnthropicProvider();
  }
  return cached;
}

function hasAnyAIKey(): boolean {
  return (
    isAiConfigured() ||
    Boolean(process.env.OPENAI_API_KEY) ||
    Boolean(process.env.GEMINI_API_KEY)
  );
}

/**
 * Stage 6.P6 — explicit provider lookup by name. Used by agents that
 * support per-agent provider overrides (e.g. an agent set to
 * `provider_override = 'gemini'` in `agent_definitions`). Returns
 * null when the named provider has no API key configured — caller
 * falls back to `getAIProvider()`.
 */
export function getAIProviderByName(
  name: "anthropic" | "openai" | "gemini" | "dry_run",
): AIProvider | null {
  if (isAiDryRun()) return new DryRunProvider();
  switch (name) {
    case "anthropic":
      return isAiConfigured() ? new AnthropicProvider() : null;
    case "openai":
      return process.env.OPENAI_API_KEY ? new OpenAIProvider() : null;
    case "gemini":
      return process.env.GEMINI_API_KEY ? new GeminiProvider() : null;
    case "dry_run":
      return new DryRunProvider();
    default:
      return null;
  }
}

/** Test seam: allows specs to inject a fake provider. */
export function _setAIProviderForTest(provider: AIProvider | null): void {
  cached = provider;
}

/**
 * Stage 10.5.B — construct a fresh provider instance with caller-supplied
 * credentials. Used by:
 *   - the test-connection action (validates user-typed API keys before
 *     they're encrypted + persisted)
 *   - the agent runner (uses per-org API keys at invocation time, when
 *     `org_ai_agent_config.api_key_encrypted` is non-NULL)
 *
 * Returns null for `dry_run` provider name (no creds needed) and for
 * unrecognised provider names. Does NOT cache — every caller gets a
 * fresh instance because credentials may differ per org per call.
 */
export function getAIProviderForCredentials(opts: {
  provider: "anthropic" | "openai" | "gemini";
  apiKey: string;
  model?: string;
}): AIProvider | null {
  if (!opts.apiKey || opts.apiKey.length === 0) return null;
  switch (opts.provider) {
    case "anthropic":
      return new AnthropicProvider({ apiKey: opts.apiKey, model: opts.model });
    case "openai":
      return new OpenAIProvider({ apiKey: opts.apiKey, model: opts.model });
    case "gemini":
      return new GeminiProvider({ apiKey: opts.apiKey, model: opts.model });
    default:
      return null;
  }
}
