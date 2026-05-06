import "server-only";

import { aiModel, env, isAiConfigured, isAiDryRun } from "@/lib/env";
import {
  AIProviderError,
  AIProviderUnavailableError,
  type AICompletionRequest,
  type AICompletionResponse,
  type AIProvider,
} from "./types";

/**
 * Anthropic concrete provider.
 *
 * Reuses the same fetch pattern as the existing operations copilot
 * (`src/features/ai/operations-copilot/provider.ts`) so we don't add
 * `@anthropic-ai/sdk` as a dependency. To switch to the official SDK
 * later, replace the body of `complete()` — the surface stays the same.
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_TOKENS = 1500;

type AnthropicWireContent =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: string; data: string };
    };

interface AnthropicWireMessage {
  role: "user" | "assistant";
  content: string | AnthropicWireContent[];
}

interface AnthropicResponse {
  id?: string;
  model?: string;
  stop_reason?: string;
  content?: Array<{ type: "text"; text: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
}

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  readonly defaultModel: string;

  constructor(modelOverride?: string) {
    this.defaultModel = modelOverride ?? aiModel();
  }

  isAvailable(): boolean {
    return isAiConfigured() && !isAiDryRun();
  }

  async complete(req: AICompletionRequest): Promise<AICompletionResponse> {
    if (!isAiConfigured()) {
      throw new AIProviderUnavailableError(
        "ANTHROPIC_API_KEY is not configured.",
      );
    }
    if (isAiDryRun()) {
      throw new AIProviderUnavailableError(
        "AI_DRY_RUN=1 — live AI calls are disabled in this environment.",
      );
    }

    const apiKey = env.server.ANTHROPIC_API_KEY!;
    const model = req.model ?? this.defaultModel;
    const maxTokens = req.maxTokens ?? DEFAULT_MAX_TOKENS;
    const temperature = req.temperature ?? 0.3;
    const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const systems = req.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content);
    const conversation: AnthropicWireMessage[] = req.messages
      .filter((m) => m.role !== "system")
      .map((m) => {
        const role = m.role === "assistant" ? "assistant" : "user";
        // Image blocks only allowed on user turns. When present, build a
        // multi-block content array with images first, then the text.
        if (role === "user" && m.images && m.images.length > 0) {
          const blocks: AnthropicWireContent[] = m.images.map((img) => ({
            type: "image",
            source: {
              type: "base64",
              media_type: img.mediaType,
              data: img.base64,
            },
          }));
          if (m.content && m.content.length > 0) {
            blocks.push({ type: "text", text: m.content });
          }
          return { role, content: blocks };
        }
        return { role, content: m.content };
      });

    const payload: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      temperature,
      messages: conversation,
    };
    if (systems.length > 0) payload.system = systems.join("\n\n");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      throw new AIProviderError(
        this.name,
        err instanceof Error ? err.message : "anthropic fetch failed",
      );
    } finally {
      clearTimeout(timer);
    }

    let body: AnthropicResponse;
    try {
      body = (await res.json()) as AnthropicResponse;
    } catch {
      throw new AIProviderError(
        this.name,
        `Could not parse Anthropic response (HTTP ${res.status}).`,
        res.status,
      );
    }

    if (!res.ok || body.error) {
      throw new AIProviderError(
        this.name,
        body.error?.message ?? `Anthropic returned HTTP ${res.status}.`,
        res.status,
      );
    }

    const text = (body.content ?? [])
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("\n");

    return {
      content: text,
      usage: {
        promptTokens: body.usage?.input_tokens ?? 0,
        completionTokens: body.usage?.output_tokens ?? 0,
        totalTokens:
          (body.usage?.input_tokens ?? 0) + (body.usage?.output_tokens ?? 0),
      },
      model: body.model ?? model,
      finishReason: body.stop_reason ?? "unknown",
    };
  }
}
