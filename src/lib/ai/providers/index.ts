import "server-only";

import { isAiConfigured, isAiDryRun } from "@/lib/env";
import { AnthropicProvider } from "./anthropic";
import { DryRunProvider } from "./dry-run";
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
 * Selection (Stage 3.B):
 *   1. AI_DRY_RUN=1 (default in tests/dev) OR no AI key configured →
 *      DryRunProvider. Deterministic, free, no network.
 *   2. AI_PROVIDER=openai → OpenAIProvider. Operator opt-in fallback;
 *      requires OPENAI_API_KEY.
 *   3. Otherwise → AnthropicProvider (default live path).
 *
 * Agents must never bypass this factory.
 */
export function getAIProvider(): AIProvider {
  if (cached) return cached;
  if (isAiDryRun() || !hasAnyAIKey()) {
    cached = new DryRunProvider();
  } else if (process.env.AI_PROVIDER === "openai") {
    cached = new OpenAIProvider();
  } else {
    cached = new AnthropicProvider();
  }
  return cached;
}

function hasAnyAIKey(): boolean {
  return (
    isAiConfigured() ||
    Boolean(process.env.OPENAI_API_KEY)
  );
}

/** Test seam: allows specs to inject a fake provider. */
export function _setAIProviderForTest(provider: AIProvider | null): void {
  cached = provider;
}
