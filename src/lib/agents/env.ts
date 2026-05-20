import "server-only";

/**
 * P5.4.1 AGENT-RAG-ENV — environment-readiness guard for the RAG
 * pipeline.
 *
 * The pipeline pulls from two distinct env surfaces:
 *
 *   · System-level keys — `OPENAI_API_KEY` powers embeddings + tokenizer
 *     calls. It is NOT per-agent; every agent's documents are embedded
 *     with the same key so the vector space is consistent. If we ever
 *     rotate this, every chunk must be re-embedded. Treat it as global
 *     infrastructure, not per-tenant.
 *
 *   · Per-agent keys — provider API keys for inference (gpt-4o-mini,
 *     claude-sonnet-4, etc.). Stored encrypted in Supabase Vault per
 *     `src/lib/agents/vault.ts`, fetched at inference time. NEVER
 *     fall back to env for inference — agents without a Vault key
 *     should fail with a clear error so super_admin sees it.
 *
 * `assertAgentEnvReady()` only validates the system-level requirements.
 * Per-agent key presence is checked inside `inference.ts` after loading
 * the agent row.
 */

import { env } from "@/lib/env";

export class AgentEnvNotReadyError extends Error {
  readonly code = "AGENT_ENV_NOT_READY";
  constructor(message: string) {
    super(message);
  }
}

/**
 * Throws `AgentEnvNotReadyError` with an operator-facing message when
 * the system-level env isn't sufficient to run the RAG pipeline. Call
 * at every server-action entry point (upload, process, query) so the
 * UI surfaces a friendly message instead of a generic 500.
 */
export function assertAgentEnvReady(): void {
  if (!env.server.OPENAI_API_KEY) {
    throw new AgentEnvNotReadyError(
      "OPENAI_API_KEY is not set. Add it to .env.local (dev) or Vercel project env (prod) before uploading agent knowledge documents.",
    );
  }
}

export function isAgentEnvReady(): boolean {
  return Boolean(env.server.OPENAI_API_KEY);
}
