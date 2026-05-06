import "server-only";

import {
  AIProviderError,
  AIProviderUnavailableError,
  type AICompletionRequest,
  type AICompletionResponse,
  type AIProvider,
} from "./types";

/**
 * OpenAI fallback provider.
 *
 * Selected when `AI_PROVIDER=openai` (operator opt-in). Uses the same
 * raw-fetch pattern as Anthropic — no SDK dependency, mirrors the
 * Stage 3.A architectural decision documented in `architecture.md`
 * → "AI provider abstraction".
 *
 * Uses GPT-4o (or `OPENAI_MODEL` override) which supports vision via
 * the same `image_url` content block. Cost tracking still goes through
 * `lib/ai/cost.ts` — extend the rate table when adding OpenAI rates.
 */

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_TOKENS = 1500;
const DEFAULT_MODEL = "gpt-4o-mini";

type OpenAIWireContent =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

interface OpenAIWireMessage {
  role: "system" | "user" | "assistant";
  content: string | OpenAIWireContent[];
}

interface OpenAIResponse {
  id?: string;
  model?: string;
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string };
}

export class OpenAIProvider implements AIProvider {
  readonly name = "openai";
  readonly defaultModel: string;

  constructor(modelOverride?: string) {
    this.defaultModel =
      modelOverride ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
  }

  isAvailable(): boolean {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  async complete(req: AICompletionRequest): Promise<AICompletionResponse> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new AIProviderUnavailableError(
        "OPENAI_API_KEY is not configured.",
      );
    }

    const model = req.model ?? this.defaultModel;
    const maxTokens = req.maxTokens ?? DEFAULT_MAX_TOKENS;
    const temperature = req.temperature ?? 0.3;
    const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const messages: OpenAIWireMessage[] = req.messages.map((m) => {
      // Image attachments only on user turns.
      if (m.role === "user" && m.images && m.images.length > 0) {
        const blocks: OpenAIWireContent[] = m.images.map((img) => ({
          type: "image_url",
          image_url: {
            url: `data:${img.mediaType};base64,${img.base64}`,
          },
        }));
        if (m.content) blocks.push({ type: "text", text: m.content });
        return { role: "user", content: blocks };
      }
      return { role: m.role, content: m.content };
    });

    const payload: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      temperature,
      messages,
    };
    if (req.responseFormat === "json") {
      payload.response_format = { type: "json_object" };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      throw new AIProviderError(
        this.name,
        err instanceof Error ? err.message : "openai fetch failed",
      );
    } finally {
      clearTimeout(timer);
    }

    let body: OpenAIResponse;
    try {
      body = (await res.json()) as OpenAIResponse;
    } catch {
      throw new AIProviderError(
        this.name,
        `Could not parse OpenAI response (HTTP ${res.status}).`,
        res.status,
      );
    }

    if (!res.ok || body.error) {
      throw new AIProviderError(
        this.name,
        body.error?.message ?? `OpenAI returned HTTP ${res.status}.`,
        res.status,
      );
    }

    const choice = body.choices?.[0];
    const text = choice?.message?.content ?? "";
    return {
      content: text,
      usage: {
        promptTokens: body.usage?.prompt_tokens ?? 0,
        completionTokens: body.usage?.completion_tokens ?? 0,
        totalTokens: body.usage?.total_tokens ?? 0,
      },
      model: body.model ?? model,
      finishReason: choice?.finish_reason ?? "unknown",
    };
  }
}
