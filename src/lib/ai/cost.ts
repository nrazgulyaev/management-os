/**
 * AI cost calculator — pure module (no server-only) so tests can import.
 *
 * Public Anthropic + OpenAI per-million-token rates as of 2026-04. When
 * a model is not in the table we return null (cost is unknown — caller
 * decides whether to log it as ~0 or skip the cost columns entirely).
 *
 * Rates are deliberately a static lookup, not fetched at runtime. Pricing
 * changes are infrequent and a stale rate is preferable to a network
 * dependency on Stripe / a billing endpoint inside the request path.
 *
 * To add a model: append a row. To deprecate one: leave it — older
 * `ai_assistant_runs` rows still need it for back-cost calculation in
 * the cost dashboard.
 */

export interface ModelRate {
  /** Provider-reported model id, exact-match. */
  model: string;
  /** USD per million input tokens. */
  inputPerMTokens: number;
  /** USD per million output tokens. */
  outputPerMTokens: number;
  /** Optional vendor label for the cost dashboard. */
  vendor?: string;
}

const RATES: ReadonlyArray<ModelRate> = [
  // Anthropic — Claude 4.x family.
  { model: "claude-opus-4-7", inputPerMTokens: 5.0, outputPerMTokens: 25.0, vendor: "anthropic" },
  { model: "claude-opus-4-6", inputPerMTokens: 5.0, outputPerMTokens: 25.0, vendor: "anthropic" },
  { model: "claude-sonnet-4-6", inputPerMTokens: 3.0, outputPerMTokens: 15.0, vendor: "anthropic" },
  { model: "claude-haiku-4-5", inputPerMTokens: 1.0, outputPerMTokens: 5.0, vendor: "anthropic" },
  // Anthropic — Claude 3.5 family (legacy; existing operations-copilot uses haiku-3-5).
  { model: "claude-3-5-haiku-latest", inputPerMTokens: 0.8, outputPerMTokens: 4.0, vendor: "anthropic" },
  { model: "claude-3-5-haiku-20241022", inputPerMTokens: 0.8, outputPerMTokens: 4.0, vendor: "anthropic" },
  { model: "claude-3-5-sonnet-latest", inputPerMTokens: 3.0, outputPerMTokens: 15.0, vendor: "anthropic" },
  { model: "claude-3-5-sonnet-20241022", inputPerMTokens: 3.0, outputPerMTokens: 15.0, vendor: "anthropic" },
  // OpenAI — fallback path (Stage 3.B). Public rates as of 2026-04.
  { model: "gpt-4o", inputPerMTokens: 2.5, outputPerMTokens: 10.0, vendor: "openai" },
  { model: "gpt-4o-mini", inputPerMTokens: 0.15, outputPerMTokens: 0.6, vendor: "openai" },
  { model: "gpt-4-turbo", inputPerMTokens: 10.0, outputPerMTokens: 30.0, vendor: "openai" },
];

export interface CostBreakdown {
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
  rate: ModelRate;
}

/**
 * Compute USD cost for a single Claude / Anthropic call.
 *
 * Returns `null` when the model is not in the rate table — callers
 * should NOT default to zero (that silently underreports spend) but
 * may decide to record the run without cost columns.
 */
export function computeCallCost(args: {
  model: string;
  promptTokens: number;
  completionTokens: number;
}): CostBreakdown | null {
  const rate = RATES.find((r) => r.model === args.model);
  if (!rate) return null;

  // Round to 4 decimals to match the NUMERIC(12,4) precision the
  // schema uses. We round half-up so two equal calls always store the
  // same value regardless of float micro-noise.
  const inputCostUsd = round4(
    (args.promptTokens / 1_000_000) * rate.inputPerMTokens,
  );
  const outputCostUsd = round4(
    (args.completionTokens / 1_000_000) * rate.outputPerMTokens,
  );
  const totalCostUsd = round4(inputCostUsd + outputCostUsd);
  return { inputCostUsd, outputCostUsd, totalCostUsd, rate };
}

/** Lookup a model's rate or null. Useful for the cost dashboard. */
export function getModelRate(model: string): ModelRate | null {
  return RATES.find((r) => r.model === model) ?? null;
}

/** All known rates — exposed for the cost dashboard's "supported models" list. */
export function listModelRates(): ReadonlyArray<ModelRate> {
  return RATES;
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
