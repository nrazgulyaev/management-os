/**
 * Pure helpers for the Distribution Preview agent. Extracted from
 * `distribution-preview.ts` so unit tests can import them without
 * pulling in `server-only`.
 *
 * Conservative clamps are the load-bearing safety helper — they
 * enforce the architecture's HITL-strict rules in CODE, not just in
 * the LLM prompt. The agent's tests live or die on this module.
 */

export const COOLDOWN_DAYS = 30;
export const BUFFER_MONTHS = 6;

export interface DistributionContextSnapshot {
  projectId: string;
  projectName: string;
  isSelfSustaining: boolean;
  projectBalanceUsdMinor: bigint;
  companyBalanceUsdMinor: bigint;
  inflows90dUsdMinor: bigint;
  outflows90dUsdMinor: bigint;
  netCashFlow90dUsdMinor: bigint;
  bufferUsdMinor: bigint;
  outstandingCapitalUsdMinor: bigint;
  outstandingInvoicesUsdMinor: bigint;
  outstandingCommitmentsUsdMinor: bigint;
  safeEnvelopeUsdMinor: bigint;
  daysSinceLastDistribution: number | null;
  lastDistributionType: string | null;
  cooldownActive: boolean;
}

export interface RawSuggestion {
  suggested_amount_usd_minor: number;
  suggested_distribution_type:
    | "capital_return"
    | "profit_distribution"
    | "mixed"
    | "none";
  suggested_effective_date: string;
  reasoning: string;
  confidence_level: "low" | "medium" | "high";
  risk_factors: string[];
  recommendations: string[];
}

export interface ClampOutput {
  suggestedAmountUsdMinor: bigint;
  suggestedDistributionType:
    | "capital_return"
    | "profit_distribution"
    | "mixed"
    | "none";
  confidenceLevel: "low" | "medium" | "high";
  riskFactors: string[];
  adjustedReasoning: string;
}

/**
 * Conservative clamps applied AFTER the LLM responds. The LLM's
 * suggestion is bounded by:
 *   - 0 when not self-sustaining
 *   - 0 when in cooldown (cooldown gate runs earlier — defence in depth)
 *   - safeEnvelopeUsdMinor (project_balance - buffer - obligations)
 *
 * Any clamp triggers a downgrade: confidence_level → 'low' (if it was
 * higher) or 'medium' (when capping at envelope), and a new
 * risk_factor entry explaining what was clamped.
 */
export function applyConservativeClamps(
  llm: RawSuggestion,
  snapshot: DistributionContextSnapshot,
): ClampOutput {
  const llmAmountBig = BigInt(llm.suggested_amount_usd_minor);
  let amount = llmAmountBig;
  let type: ClampOutput["suggestedDistributionType"] =
    llm.suggested_distribution_type;
  let confidence: ClampOutput["confidenceLevel"] = llm.confidence_level;
  const adjustedRisks = [...llm.risk_factors];
  let extraReasoning = "";

  // Rail 1: project not self-sustaining → force 0.
  if (!snapshot.isSelfSustaining) {
    if (amount > 0n) {
      adjustedRisks.unshift(
        "Conservative clamp: project is not self-sustaining; suggested amount forced to 0.",
      );
      extraReasoning +=
        "\n\n_Code-level adjustment: project's `is_self_sustaining` flag is false. Suggestion clamped to $0 regardless of the model's view._";
      amount = 0n;
      type = "none";
      confidence = "low";
    } else if (type !== "none") {
      type = "none";
    }
  }

  // Rail 2: cooldown still active (defense in depth — also gated upstream).
  if (snapshot.cooldownActive) {
    if (amount > 0n) {
      adjustedRisks.unshift(
        `Conservative clamp: only ${snapshot.daysSinceLastDistribution} days since last distribution (< ${COOLDOWN_DAYS}). Suggestion clamped to $0.`,
      );
      extraReasoning += `\n\n_Code-level adjustment: 30-day cooldown is still active. Suggestion clamped to $0._`;
      amount = 0n;
      type = "none";
      confidence = "low";
    }
  }

  // Rail 3: cap at safe envelope.
  if (amount > snapshot.safeEnvelopeUsdMinor) {
    adjustedRisks.unshift(
      `Conservative clamp: model suggested $${formatUsdMinor(llmAmountBig)} which exceeds the safe envelope of $${formatUsdMinor(snapshot.safeEnvelopeUsdMinor)} (project balance − ${BUFFER_MONTHS}-month buffer − outstanding obligations). Suggestion capped at the envelope.`,
    );
    extraReasoning += `\n\n_Code-level adjustment: amount reduced from $${formatUsdMinor(llmAmountBig)} to $${formatUsdMinor(snapshot.safeEnvelopeUsdMinor)} to preserve the ${BUFFER_MONTHS}-month operating buffer and obligations cover._`;
    amount = snapshot.safeEnvelopeUsdMinor;
    if (confidence === "high") confidence = "medium";
  }

  // Rail 4: if outstanding capital exists and amount > 0, force type to
  // 'capital_return' (priority order from architecture doc).
  if (
    amount > 0n &&
    snapshot.outstandingCapitalUsdMinor > 0n &&
    type === "profit_distribution"
  ) {
    adjustedRisks.unshift(
      "Conservative clamp: outstanding capital remains; type forced to 'capital_return' before any 'profit_distribution'.",
    );
    extraReasoning +=
      "\n\n_Code-level adjustment: capital return takes priority over profit distribution while outstanding capital remains._";
    type = "capital_return";
  }

  // Rail 5: amount became 0 → ensure type is 'none' for storage clarity.
  if (amount === 0n) type = "none";

  return {
    suggestedAmountUsdMinor: amount,
    suggestedDistributionType: type,
    confidenceLevel: confidence,
    riskFactors: adjustedRisks,
    adjustedReasoning: llm.reasoning + extraReasoning,
  };
}

export function formatUsdMinor(b: bigint): string {
  const sign = b < 0n ? "-" : "";
  const abs = b < 0n ? -b : b;
  const cents = Number(abs % 100n);
  const dollars = abs / 100n;
  return `${sign}${dollars.toLocaleString("en-US")}.${String(cents).padStart(2, "0")}`;
}
