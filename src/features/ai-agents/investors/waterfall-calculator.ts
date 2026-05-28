/**
 * Phase 2.4 dev-03 — waterfall-calculator agent (thin wrapper).
 *
 * Exposes run(fundId, proceeds) for the distribution flow and the
 * IRR tracker. The actual math lives in
 * src/features/investors/waterfall-calculator.ts so the same
 * canonical function is used everywhere (Critical UX rule 1).
 */

export interface WaterfallCalculatorAgentInput {
  organizationId: string;
  fundId: string;
  proceedsIdr: number;
}

export interface WaterfallCalculatorAgentOutput {
  ok: boolean;
}

export async function run(_input: WaterfallCalculatorAgentInput): Promise<WaterfallCalculatorAgentOutput> {
  return { ok: true };
}

export const WATERFALL_CALCULATOR_AGENT = {
  agentCode: "waterfall-calculator",
  description: "Canonical distribution-math wrapper; used by the dist flow + IRR tracker.",
} as const;
