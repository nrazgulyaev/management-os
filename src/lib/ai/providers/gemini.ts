import "server-only";

/**
 * Stage 6.P6 — Google Gemini provider.
 *
 * Selected when `AI_PROVIDER=gemini` (operator opt-in). Uses the same
 * raw-fetch pattern as Anthropic + OpenAI — no SDK dependency. The
 * Gemini "generateContent" REST endpoint accepts the API key as a
 * query parameter.
 *
 * Vision: Gemini 1.5 Pro/Flash accept inline image bytes via the
 * `inlineData` part shape, mirroring Claude's `image` block + OpenAI's
 * `image_url` block. Same `AIImageAttachment` shape lifts cleanly to
 * the wire format.
 *
 * Cost tracking still goes through `lib/ai/cost.ts` — extend the rate
 * table when adding Gemini rates.
 */

import {
  AIProviderError,
  AIProviderUnavailableError,
  type AICompletionRequest,
  type AICompletionResponse,
  type AIProvider,
} from "./types";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_TOKENS = 1500;
const DEFAULT_MODEL = "gemini-1.5-flash";

type GeminiInlineData = {
  inlineData: { mimeType: string; data: string };
};
type GeminiTextPart = { text: string };
type GeminiPart = GeminiTextPart | GeminiInlineData;

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: { message?: string; code?: number };
}

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";
  readonly defaultModel: string;

  constructor(modelOverride?: string) {
    this.defaultModel =
      modelOverride ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  }

  isAvailable(): boolean {
    return Boolean(process.env.GEMINI_API_KEY);
  }

  async complete(req: AICompletionRequest): Promise<AICompletionResponse> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new AIProviderUnavailableError(
        "GEMINI_API_KEY is not configured.",
      );
    }

    const model = req.model ?? this.defaultModel;
    const maxTokens = req.maxTokens ?? DEFAULT_MAX_TOKENS;
    const temperature = req.temperature ?? 0.3;
    const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    // Gemini takes a separate `systemInstruction` field. Anthropic +
    // OpenAI both accept system-role messages inline; we project here.
    const systemMessage = req.messages.find((m) => m.role === "system");
    const conversation = req.messages.filter((m) => m.role !== "system");

    const contents: GeminiContent[] = conversation.map((m) => {
      const parts: GeminiPart[] = [];
      if (
        m.role === "user" &&
        m.images &&
        m.images.length > 0
      ) {
        for (const img of m.images) {
          parts.push({
            inlineData: { mimeType: img.mediaType, data: img.base64 },
          });
        }
      }
      if (m.content) parts.push({ text: m.content });
      return {
        role: m.role === "assistant" ? "model" : "user",
        parts,
      };
    });

    const payload: Record<string, unknown> = {
      contents,
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature,
        ...(req.responseFormat === "json"
          ? { responseMimeType: "application/json" }
          : {}),
      },
    };
    if (systemMessage) {
      payload.systemInstruction = {
        parts: [{ text: systemMessage.content }],
      };
    }

    const url = `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      throw new AIProviderError(
        this.name,
        err instanceof Error ? err.message : "gemini fetch failed",
      );
    } finally {
      clearTimeout(timer);
    }

    let body: GeminiResponse;
    try {
      body = (await res.json()) as GeminiResponse;
    } catch {
      throw new AIProviderError(
        this.name,
        `Could not parse Gemini response (HTTP ${res.status}).`,
        res.status,
      );
    }

    if (!res.ok || body.error) {
      throw new AIProviderError(
        this.name,
        body.error?.message ?? `Gemini returned HTTP ${res.status}.`,
        res.status,
      );
    }

    const candidate = body.candidates?.[0];
    const textParts =
      candidate?.content?.parts
        ?.filter((p): p is GeminiTextPart => "text" in p)
        .map((p) => p.text) ?? [];
    const text = textParts.join("");
    return {
      content: text,
      usage: {
        promptTokens: body.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
        totalTokens: body.usageMetadata?.totalTokenCount ?? 0,
      },
      model,
      finishReason: candidate?.finishReason ?? "unknown",
    };
  }
}
