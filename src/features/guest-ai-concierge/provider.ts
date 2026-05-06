import "server-only";

import { aiModel, env, isAiConfigured, isAiDryRun } from "@/lib/env";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_TOKENS = 700;

export interface CallConciergeResult {
  ok: boolean;
  text?: string;
  inputTokens?: number;
  outputTokens?: number;
  errorMessage?: string;
  model?: string;
}

interface AnthropicResponse {
  model?: string;
  stop_reason?: string;
  content?: Array<{ type: "text"; text: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
}

/**
 * Single-shot Anthropic call for the guest concierge. No tool use,
 * no agent loop — the system prompt + prebuilt context drive
 * everything. Returns `ok: false` on any failure; the caller flips
 * to the deterministic fallback.
 */
export async function callGuestConcierge(
  systemPrompt: string,
  userPrompt: string,
): Promise<CallConciergeResult> {
  if (!isAiConfigured() || isAiDryRun()) {
    return {
      ok: false,
      errorMessage: !isAiConfigured()
        ? "ANTHROPIC_API_KEY not configured"
        : "AI_DRY_RUN=1",
    };
  }
  const apiKey = env.server.ANTHROPIC_API_KEY!;
  const model = aiModel();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let resp: Response;
  try {
    resp = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeout);
    const isAbort = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      errorMessage: isAbort
        ? `Anthropic request timed out after ${REQUEST_TIMEOUT_MS}ms`
        : e instanceof Error
          ? e.message
          : "anthropic fetch failed",
    };
  }
  clearTimeout(timeout);

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return {
      ok: false,
      errorMessage: `Anthropic HTTP ${resp.status}: ${text.slice(0, 200)}`,
    };
  }

  const json = (await resp.json().catch(() => ({}))) as AnthropicResponse;
  if (json.error?.message) {
    return { ok: false, errorMessage: json.error.message };
  }
  const text = (json.content ?? [])
    .filter(
      (b): b is { type: "text"; text: string } => b.type === "text",
    )
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (!text) {
    return { ok: false, errorMessage: "empty response" };
  }
  return {
    ok: true,
    text,
    inputTokens: json.usage?.input_tokens ?? 0,
    outputTokens: json.usage?.output_tokens ?? 0,
    model: json.model ?? model,
  };
}
