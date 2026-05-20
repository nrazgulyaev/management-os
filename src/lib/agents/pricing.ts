import "server-only";

/**
 * P5.4.5 AGENT-PRICING — token-cost lookup table for budget enforcement
 * and per-run telemetry.
 *
 * Prices in USD per 1 million tokens, sourced from each provider's
 * public pricing page as of 2026-05. We store them in MINOR units
 * (USD cents) scaled by 1e6 so the arithmetic stays integer-safe.
 *
 * When OpenAI / Anthropic change pricing, edit this table. There is
 * no live pricing API — the discipline is "update here on price
 * change, redeploy."
 *
 * Fallback: an unknown (provider, model) tuple resolves to a worst-case
 * estimate (claude-opus-tier) so we over-charge against budget rather
 * than under-charge. Operator will see the unknown model in audit logs
 * and update the table.
 */

export interface ModelPricing {
  /** USD cents per 1,000,000 input tokens */
  inputUsdMinorPerMillion: number;
  /** USD cents per 1,000,000 output tokens */
  outputUsdMinorPerMillion: number;
}

const PRICING: Record<string, ModelPricing> = {
  // OpenAI — chat
  "openai:gpt-4o-mini": { inputUsdMinorPerMillion: 15, outputUsdMinorPerMillion: 60 },
  "openai:gpt-4o": { inputUsdMinorPerMillion: 250, outputUsdMinorPerMillion: 1000 },
  "openai:o1-mini": { inputUsdMinorPerMillion: 300, outputUsdMinorPerMillion: 1200 },
  // OpenAI — embeddings (per call accounting in document-processor)
  "openai:text-embedding-3-small": {
    inputUsdMinorPerMillion: 2,
    outputUsdMinorPerMillion: 0,
  },
  // Anthropic — chat
  "anthropic:claude-haiku-4-5": {
    inputUsdMinorPerMillion: 80,
    outputUsdMinorPerMillion: 400,
  },
  "anthropic:claude-sonnet-4-6": {
    inputUsdMinorPerMillion: 300,
    outputUsdMinorPerMillion: 1500,
  },
  "anthropic:claude-opus-4-7": {
    inputUsdMinorPerMillion: 1500,
    outputUsdMinorPerMillion: 7500,
  },
  // Google — chat
  "google:gemini-2.0-flash-exp": {
    inputUsdMinorPerMillion: 10,
    outputUsdMinorPerMillion: 40,
  },
  "google:gemini-1.5-pro": {
    inputUsdMinorPerMillion: 125,
    outputUsdMinorPerMillion: 500,
  },
};

const FALLBACK_PRICING: ModelPricing = {
  inputUsdMinorPerMillion: 1500,
  outputUsdMinorPerMillion: 7500,
};

export function lookupPricing(
  provider: string,
  model: string,
): ModelPricing {
  return PRICING[`${provider.toLowerCase()}:${model}`] ?? FALLBACK_PRICING;
}

/**
 * Cost of one inference call in USD minor units (cents).
 *
 * Math: (tokensIn × inputRate + tokensOut × outputRate) / 1e6.
 * Rounds up so we never under-charge a fractional cent against budget.
 */
export function computeCostUsdMinor(input: {
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
}): number {
  const p = lookupPricing(input.provider, input.model);
  const totalScaled =
    input.tokensIn * p.inputUsdMinorPerMillion +
    input.tokensOut * p.outputUsdMinorPerMillion;
  return Math.ceil(totalScaled / 1_000_000);
}

/**
 * Estimate cost BEFORE the call lands, used by the budget gate.
 * Assumes outputTokens ≈ maxTokens (the worst case), since we can't
 * predict actual output length.
 */
export function estimateCostUsdMinor(input: {
  provider: string;
  model: string;
  tokensIn: number;
  maxOutputTokens: number;
}): number {
  return computeCostUsdMinor({
    provider: input.provider,
    model: input.model,
    tokensIn: input.tokensIn,
    tokensOut: input.maxOutputTokens,
  });
}
