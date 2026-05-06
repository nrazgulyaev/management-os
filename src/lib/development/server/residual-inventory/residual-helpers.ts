/**
 * Stage 4.B.2 — Pure residual-inventory ownership-allocation helpers.
 *
 * No I/O, no `import "server-only"`. Each helper is deterministic and
 * runtime-testable. The `by_arconique_25_credit` settlement method
 * delegates to the same pure 25-credit math used by the waterfall
 * engine — guaranteeing one source of truth for that critical rule.
 */

import {
  applyArconique25Credit,
  type WaterfallInput,
} from "../waterfall/waterfall-helpers";

export type SettlementMethod =
  | "by_unrecovered_capital"
  | "by_economic_waterfall"
  | "by_arconique_25_credit"
  | "manual_override";

export interface OwnershipShareSide {
  percentage: number;
  economicClaim: number;
}

export interface ComputeOwnershipInput {
  method: Exclude<SettlementMethod, "manual_override">;
  arconiqueUnrecoveredCapital: number;
  investorUnrecoveredCapital: number;
  remainingInventoryValue: number;
  remainingLiabilities?: number;
  /** Required when method = 'by_arconique_25_credit' or 'by_economic_waterfall'. */
  arconiqueCreditPercentage?: number;
}

export interface ComputeOwnershipOutput {
  arconiqueOwnership: OwnershipShareSide;
  investorOwnership: OwnershipShareSide;
  reasoning: string;
}

function isNonNeg(n: number): boolean {
  return Number.isFinite(n) && n >= 0;
}

export function computeOwnershipBySettlementMethod(
  input: ComputeOwnershipInput,
): ComputeOwnershipOutput {
  for (const [k, v] of [
    ["arconiqueUnrecoveredCapital", input.arconiqueUnrecoveredCapital],
    ["investorUnrecoveredCapital", input.investorUnrecoveredCapital],
    ["remainingInventoryValue", input.remainingInventoryValue],
  ] as const) {
    if (!isNonNeg(v)) {
      throw new Error(`residual: ${k} must be >= 0 finite`);
    }
  }
  if (
    input.remainingLiabilities !== undefined &&
    !isNonNeg(input.remainingLiabilities)
  ) {
    throw new Error("residual: remainingLiabilities must be >= 0 finite");
  }

  const liabilities = input.remainingLiabilities ?? 0;
  const netInventory = Math.max(input.remainingInventoryValue - liabilities, 0);

  switch (input.method) {
    case "by_unrecovered_capital":
      return splitByUnrecoveredCapital(input, netInventory);
    case "by_economic_waterfall":
      return splitByEconomicWaterfall(input, netInventory);
    case "by_arconique_25_credit":
      return splitByArconique25Credit(input, netInventory);
    default: {
      const _never: never = input.method;
      throw new Error(`residual: unknown method ${String(_never)}`);
    }
  }
}

function splitByUnrecoveredCapital(
  input: ComputeOwnershipInput,
  netInventory: number,
): ComputeOwnershipOutput {
  const A = input.arconiqueUnrecoveredCapital;
  const I = input.investorUnrecoveredCapital;
  const total = A + I;

  if (total <= 0 || netInventory <= 0) {
    return zeroOwnership(
      `### by_unrecovered_capital\nNo unrecovered capital or no inventory value remaining.`,
    );
  }

  const arcPct = (A / total) * 100;
  const invPct = 100 - arcPct;
  const arcClaim = Math.round((netInventory * arcPct) / 100);
  const invClaim = netInventory - arcClaim;

  return {
    arconiqueOwnership: { percentage: round4(arcPct), economicClaim: arcClaim },
    investorOwnership: { percentage: round4(invPct), economicClaim: invClaim },
    reasoning: [
      `### by_unrecovered_capital`,
      `Arconique unrecovered: $${money(A)}, investors: $${money(I)} → ratio ${arcPct.toFixed(2)}/${invPct.toFixed(2)}.`,
      `Net inventory ${money(netInventory)} → Arconique ${money(arcClaim)}, investors ${money(invClaim)}.`,
    ].join("\n"),
  };
}

function splitByEconomicWaterfall(
  input: ComputeOwnershipInput,
  netInventory: number,
): ComputeOwnershipOutput {
  // Treat the residual inventory value as the distributable amount and
  // run the same arconique_25_credit logic. This is the
  // by_economic_waterfall equivalent for the spec's "run the project's
  // waterfall rule one more time" semantics.
  return splitByArconique25Credit(input, netInventory, "by_economic_waterfall");
}

function splitByArconique25Credit(
  input: ComputeOwnershipInput,
  netInventory: number,
  reasoningLabel: string = "by_arconique_25_credit",
): ComputeOwnershipOutput {
  const A = input.arconiqueUnrecoveredCapital;
  const I = input.investorUnrecoveredCapital;

  if (netInventory <= 0) {
    return zeroOwnership(
      `### ${reasoningLabel}\nNo inventory value remaining.`,
    );
  }

  // Reuse the canonical pure helper. We pass total contributed = unrecovered
  // capital (since "still owed" = "outstanding capital") and 0 returned.
  const waterfallInput: WaterfallInput = {
    totalDistributable: netInventory,
    arconiqueCapitalContributed: A,
    arconiqueCapitalReturned: 0,
    investorCapitalContributed: I,
    investorCapitalReturned: 0,
    cumulativeProfitDistributed: 0,
    ruleType: "arconique_25_credit",
    ruleParameters: {
      credit_percentage: input.arconiqueCreditPercentage ?? 25,
    },
  };
  const w = applyArconique25Credit(waterfallInput);
  const total = w.arconiqueAllocation.total + w.investorAllocation.total;
  if (total <= 0) {
    return zeroOwnership(
      `### ${reasoningLabel}\nWaterfall produced zero — net inventory below threshold.`,
    );
  }
  const arcPct = (w.arconiqueAllocation.total / total) * 100;
  const invPct = 100 - arcPct;

  return {
    arconiqueOwnership: {
      percentage: round4(arcPct),
      economicClaim: w.arconiqueAllocation.total,
    },
    investorOwnership: {
      percentage: round4(invPct),
      economicClaim: w.investorAllocation.total,
    },
    reasoning: [
      `### ${reasoningLabel}`,
      w.reasoning,
      `Resulting ownership: Arconique ${arcPct.toFixed(2)}%, investors ${invPct.toFixed(2)}%.`,
    ].join("\n\n"),
  };
}

function zeroOwnership(reasoning: string): ComputeOwnershipOutput {
  return {
    arconiqueOwnership: { percentage: 0, economicClaim: 0 },
    investorOwnership: { percentage: 0, economicClaim: 0 },
    reasoning,
  };
}

// ---------------------------------------------------------------------------
// Allocation across multiple residual units
// ---------------------------------------------------------------------------

export interface AllocateAcrossUnitsInput {
  totalUnits: Array<{ unitId: string; marketValue: number }>;
  arconiquePercentage: number;
  investorAllocation: Array<{ investorId: string; percentage: number }>;
  allocationStrategy:
    | "percentage_across_all"
    | "specific_villa_allocation"
    | "hybrid";
  manualAllocation?: Array<{
    unitId: string;
    owner: "arconique" | string;
    percentage: number;
  }>;
}

export interface AllocateAcrossUnitsOutput {
  perUnit: Array<{
    unitId: string;
    shares: Array<{
      owner: "arconique" | string; // string = investorId
      percentage: number;
      economicClaim: number;
    }>;
  }>;
  reasoning: string;
}

/**
 * Allocate the project-level (Arconique vs investors) split across each
 * residual villa. Three strategies:
 *   - `percentage_across_all`: every villa carries the same % split
 *   - `specific_villa_allocation`: caller's `manualAllocation` is the source of truth
 *   - `hybrid`: percentage_across_all for un-overridden villas, manualAllocation otherwise
 */
export function allocateAcrossResidualUnits(
  input: AllocateAcrossUnitsInput,
): AllocateAcrossUnitsOutput {
  const { totalUnits, arconiquePercentage, investorAllocation, allocationStrategy } =
    input;

  for (const u of totalUnits) {
    if (!isNonNeg(u.marketValue)) {
      throw new Error(`residual: unit ${u.unitId} marketValue must be >= 0`);
    }
  }
  if (
    arconiquePercentage < 0 ||
    arconiquePercentage > 100
  ) {
    throw new Error("residual: arconiquePercentage out of range");
  }
  const investorTotal = investorAllocation.reduce(
    (acc, i) => acc + i.percentage,
    0,
  );
  if (Math.abs(arconiquePercentage + investorTotal - 100) > 0.001) {
    throw new Error(
      `residual: arconique + investor percentages must = 100, got ${arconiquePercentage + investorTotal}`,
    );
  }

  if (
    allocationStrategy === "specific_villa_allocation" &&
    !input.manualAllocation
  ) {
    throw new Error("residual: specific_villa_allocation requires manualAllocation");
  }

  const perUnit: AllocateAcrossUnitsOutput["perUnit"] = [];

  for (const unit of totalUnits) {
    const manual = input.manualAllocation?.filter((m) => m.unitId === unit.unitId) ?? [];

    let shares: AllocateAcrossUnitsOutput["perUnit"][number]["shares"] = [];

    if (
      allocationStrategy === "specific_villa_allocation" ||
      (allocationStrategy === "hybrid" && manual.length > 0)
    ) {
      const sum = manual.reduce((acc, m) => acc + m.percentage, 0);
      if (Math.abs(sum - 100) > 0.001) {
        throw new Error(
          `residual: manual allocation for unit ${unit.unitId} must sum to 100, got ${sum}`,
        );
      }
      shares = manual.map((m) => ({
        owner: m.owner,
        percentage: round4(m.percentage),
        economicClaim: Math.round((unit.marketValue * m.percentage) / 100),
      }));
    } else {
      // percentage_across_all (or hybrid with no override)
      const arcClaim = Math.round((unit.marketValue * arconiquePercentage) / 100);
      let allocatedSoFar = arcClaim;
      shares.push({
        owner: "arconique",
        percentage: round4(arconiquePercentage),
        economicClaim: arcClaim,
      });
      for (const inv of investorAllocation) {
        const claim = Math.round((unit.marketValue * inv.percentage) / 100);
        allocatedSoFar += claim;
        shares.push({
          owner: inv.investorId,
          percentage: round4(inv.percentage),
          economicClaim: claim,
        });
      }
      // Fold any 1-cent rounding remainder into the last investor share.
      if (shares.length > 0) {
        const drift = unit.marketValue - allocatedSoFar;
        shares[shares.length - 1].economicClaim += drift;
      }
    }

    perUnit.push({ unitId: unit.unitId, shares });
  }

  return {
    perUnit,
    reasoning: [
      `### allocateAcrossResidualUnits — ${allocationStrategy}`,
      `${totalUnits.length} unit${totalUnits.length === 1 ? "" : "s"}, Arconique ${arconiquePercentage.toFixed(2)}%, investors ${investorTotal.toFixed(2)}% across ${investorAllocation.length} investor${investorAllocation.length === 1 ? "" : "s"}.`,
    ].join("\n"),
  };
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

function money(n: number): string {
  return (n / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
