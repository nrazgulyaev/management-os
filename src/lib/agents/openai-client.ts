import "server-only";

/**
 * P5.4.2b AGENT-RAG-OPENAI-CLIENT — server-only OpenAI wrapper for
 * embeddings + tokenizer utilities.
 *
 * Why a thin wrapper instead of the AI SDK's `embed()` directly?
 *   · We need batched embeddings (100 chunks per call) for throughput;
 *     `embed()` is single-input, `embedMany()` would work but the AI
 *     SDK's batch ergonomics for retries-with-cost-accounting aren't
 *     better than rolling our own one-call wrapper.
 *   · We want a single place to return both the embedding vectors AND
 *     the token counts in the same call so the processor can update
 *     telemetry. The AI SDK's surface drops the token-usage object on
 *     the floor for embeddings as of v6.
 *   · This file is `server-only`; it must never end up in a client
 *     bundle, since it reads OPENAI_API_KEY directly.
 *
 * Pricing constants live in src/lib/agents/pricing.ts so this file
 * stays purely transport.
 */

import { encode } from "gpt-tokenizer";
import { env } from "@/lib/env";
import { AgentEnvNotReadyError } from "./env";

const OPENAI_BASE = "https://api.openai.com/v1";
const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

interface EmbeddingsResponse {
  data: Array<{ embedding: number[]; index: number }>;
  model: string;
  usage: { prompt_tokens: number; total_tokens: number };
}

export interface BatchEmbedResult {
  embeddings: number[][];
  tokensUsed: number;
  model: string;
}

function openAiKey(): string {
  const key = env.server.OPENAI_API_KEY;
  if (!key) throw new AgentEnvNotReadyError("OPENAI_API_KEY missing");
  return key;
}

/**
 * Embed up to 100 inputs in a single OpenAI call. The model returns
 * one 1536-dim float vector per input. Order is preserved by `index`.
 *
 * Retries: 3 attempts with exponential backoff on 429 / 5xx. We log
 * fingerprinted token cost on each attempt — never the key itself.
 */
export async function embedTextsBatch(
  inputs: string[],
  options: { signal?: AbortSignal } = {},
): Promise<BatchEmbedResult> {
  if (inputs.length === 0) {
    return { embeddings: [], tokensUsed: 0, model: EMBEDDING_MODEL };
  }
  if (inputs.length > 100) {
    throw new Error(
      `embedTextsBatch: max 100 inputs per call, got ${inputs.length}`,
    );
  }

  const key = openAiKey();
  const body = JSON.stringify({
    model: EMBEDDING_MODEL,
    input: inputs,
    encoding_format: "float",
  });

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${OPENAI_BASE}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body,
        signal: options.signal,
      });

      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`OpenAI HTTP ${res.status}`);
        await sleep(250 * Math.pow(2, attempt - 1));
        continue;
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`OpenAI embeddings ${res.status}: ${text.slice(0, 200)}`);
      }

      const json = (await res.json()) as EmbeddingsResponse;
      const sorted = [...json.data].sort((a, b) => a.index - b.index);
      return {
        embeddings: sorted.map((d) => d.embedding),
        tokensUsed: json.usage.total_tokens,
        model: json.model,
      };
    } catch (err) {
      lastError = err;
      if (attempt === 3) break;
      await sleep(250 * Math.pow(2, attempt - 1));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("OpenAI embeddings failed after retries");
}

/**
 * Token count via the local cl100k_base tokenizer. Matches OpenAI's
 * embedding + gpt-4o tokenization closely enough for chunk sizing.
 */
export function countTokens(text: string): number {
  return encode(text).length;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
