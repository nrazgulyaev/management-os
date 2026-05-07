/**
 * Provider-agnostic AI completion interface.
 *
 * Concrete providers live in this directory (`anthropic.ts` today, possibly
 * `openai.ts` or `gemini.ts` later). Agents (`lib/ai/agents/*`) call only the
 * abstract `AIProvider` — they never see the wire format.
 *
 * Switching providers is a one-file swap behind `getAIProvider()`.
 */

export interface AIImageAttachment {
  /** Base64-encoded image bytes (no data: prefix). */
  base64: string;
  /** Wire MIME type — Anthropic accepts image/jpeg, image/png, image/webp, image/gif. */
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
}

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
  /**
   * Optional inline images. Only honoured by the Anthropic provider on
   * `user` messages; ignored by the dry-run provider (which short-circuits
   * with a deterministic response).
   */
  images?: AIImageAttachment[];
}

export interface AICompletionRequest {
  messages: AIMessage[];
  /** Hard cap on tokens the model may emit. */
  maxTokens?: number;
  /** 0 = deterministic, 1 = creative. Most agent calls should be ≤ 0.4. */
  temperature?: number;
  /** When `'json'`, the agent expects parseable JSON in `content`. */
  responseFormat?: "text" | "json";
  /** Optional override of the provider's default model. */
  model?: string;
  /** Hard upper bound on wall-clock latency. */
  timeoutMs?: number;
}

export interface AICompletionResponse {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  /** Provider-reported reason: `end_turn` | `max_tokens` | `stop_sequence` | … */
  finishReason: string;
}

/**
 * Stage 6.P6 — embedding request shape. Vector dimensionality is
 * model-dependent (768 for text-embedding-3-small, 3072 for
 * text-embedding-3-large, 768 for Gemini text-embedding-004). The
 * provider returns its native dimensionality — caller normalizes if
 * needed.
 */
export interface AIEmbeddingRequest {
  /** Plain-text input. Up to a model-specific token cap. */
  input: string;
  /** Optional model override. Caller must check provider capabilities. */
  model?: string;
}

export interface AIEmbeddingResponse {
  /** Float32 embedding vector. Length equals model dimensionality. */
  vector: number[];
  /** Reported by the provider (used for cost accounting). */
  tokensUsed: number;
  model: string;
}

export interface AIProvider {
  readonly name: string;
  readonly defaultModel: string;
  /** True when env (API key) is present and AI is not in dry-run. */
  isAvailable(): boolean;
  complete(req: AICompletionRequest): Promise<AICompletionResponse>;
  /**
   * Optional. Implemented by providers with an embeddings endpoint
   * (Anthropic via Voyage, OpenAI, Gemini). Callers must guard with
   * `'embed' in provider` before invoking.
   */
  embed?(req: AIEmbeddingRequest): Promise<AIEmbeddingResponse>;
}

/**
 * Thrown when the provider is configured but the call fails (network,
 * rate limit, provider error). Agents may choose to fall back to a
 * deterministic stub or surface the error to the user.
 */
export class AIProviderError extends Error {
  readonly providerName: string;
  readonly status?: number;
  constructor(providerName: string, message: string, status?: number) {
    super(message);
    this.name = "AIProviderError";
    this.providerName = providerName;
    this.status = status;
  }
}

/** Thrown when a caller tries to invoke a provider that is not configured. */
export class AIProviderUnavailableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "AIProviderUnavailableError";
  }
}
