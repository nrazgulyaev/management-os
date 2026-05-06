/**
 * Pure (non-server) shapes for the pricing module.
 *
 * Lives outside `src/lib/development/server/*` so client components can
 * import these without dragging the `import "server-only"` guard.
 */

export type PricingRuleType = "time_based" | "progress_based" | "manual";

export type EscalationFrequency =
  | "monthly"
  | "per_5_progress_pct"
  | "per_10_progress_pct"
  | "per_milestone";

export type EscalationStartTrigger =
  | "sales_start"
  | "construction_start"
  | "fixed_date";

export type PriceBasis =
  | "rule_calculated"
  | "manual_override"
  | "contract_locked"
  | "discount_applied";

export type PriceTrigger =
  | "progress_change"
  | "time_elapsed"
  | "manual"
  | "contract_signed"
  | "discount_authorized";

export interface PricingRuleSummary {
  id: string;
  projectId: string;
  ruleType: PricingRuleType;
  basePriceUsdMinor: bigint;
  escalationPercent: number;
  escalationFrequency: EscalationFrequency | null;
  escalationStartTrigger: EscalationStartTrigger;
  escalationStartValue: string | null;
  ceilingPriceUsdMinor: bigint | null;
  isActive: boolean;
  notes: string | null;
}

export interface PriceSnapshotRow {
  id: string;
  villaId: string;
  snapshotDate: string;
  priceUsdMinor: bigint;
  priceIdrMinor: bigint;
  fxRateUsdToIdr: number;
  priceBasis: PriceBasis;
  triggeredBy: PriceTrigger;
  triggeredById: string | null;
  changeAmountUsdMinor: bigint | null;
  changePercent: number | null;
  notes: string | null;
}

export interface PriceCalculation {
  villaId: string;
  basePriceUsdMinor: bigint;
  escalatedPriceUsdMinor: bigint;
  locationCoefficient: number;
  finalPriceUsdMinor: bigint;
  appliedRuleId: string | null;
  appliedSnapshotId: string | null;
  reason: string;
}
