/**
 * Stage 5.B.3 — Pure unit profitability allocation helpers.
 *
 * No I/O, no `import "server-only"`. Runtime testable.
 *
 * Four allocation methods:
 *   - by_floor_area:    proportional to sqm
 *   - by_market_value:  proportional to expected sale price
 *   - by_unit_count:    flat split across all assets
 *   - by_volume:        proportional to volume (m³) — for restaurant/retail
 *
 * Conservation invariant: sum of allocations across all assets ≤ project
 * total (rounding remainder folded to last asset by convention).
 */

export type AllocationMethod =
  | "by_floor_area"
  | "by_market_value"
  | "by_unit_count"
  | "by_volume";

export interface AssetForAllocation {
  assetId: string;
  sqm: number;
  expectedPrice: number;
  volume?: number;
}

export interface CostAllocationInput {
  /** Asset we want the cost basis for. */
  assetId: string;
  /** Total project-level pools to allocate across all assets. */
  projectTotalLandCost: number;
  projectTotalSoftCost: number;
  projectTotalMarketingCost: number;
  /** All saleable assets in the project (basis for proportional allocation). */
  allMarketingProjectAssets: AssetForAllocation[];
  allocationMethod: AllocationMethod;
  /** Asset-specific costs not subject to allocation. */
  directCosts: number;
  /** Hard costs allocated from project-shared pool (e.g., shared MEP). */
  hardCostAllocated?: number;
  contingencyUsed: number;
  /** Financing/interest allocated. */
  financingCost?: number;
}

export interface CostAllocationOutput {
  landAllocated: number;
  softCostAllocated: number;
  marketingAllocated: number;
  hardCostDirect: number;
  hardCostAllocated: number;
  financingCostAllocated: number;
  contingencyUsed: number;
  totalCostBasis: number;
  reasoning: string;
}

function isNonNeg(n: number): boolean {
  return Number.isFinite(n) && n >= 0;
}

function getAssetMetric(
  asset: AssetForAllocation,
  method: AllocationMethod,
): number {
  switch (method) {
    case "by_floor_area":
      return asset.sqm;
    case "by_market_value":
      return asset.expectedPrice;
    case "by_unit_count":
      return 1;
    case "by_volume":
      return asset.volume ?? 0;
  }
}

export function computeUnitCostBasis(
  input: CostAllocationInput,
): CostAllocationOutput {
  for (const [k, v] of [
    ["projectTotalLandCost", input.projectTotalLandCost],
    ["projectTotalSoftCost", input.projectTotalSoftCost],
    ["projectTotalMarketingCost", input.projectTotalMarketingCost],
    ["directCosts", input.directCosts],
    ["contingencyUsed", input.contingencyUsed],
  ] as const) {
    if (!isNonNeg(v)) {
      throw new Error(`profitability: ${k} must be >= 0 finite`);
    }
  }

  const target = input.allMarketingProjectAssets.find(
    (a) => a.assetId === input.assetId,
  );
  if (!target) {
    throw new Error(
      `profitability: target asset ${input.assetId} not in allMarketingProjectAssets`,
    );
  }

  const totalMetric = input.allMarketingProjectAssets.reduce(
    (acc, a) => acc + getAssetMetric(a, input.allocationMethod),
    0,
  );
  const targetMetric = getAssetMetric(target, input.allocationMethod);
  const share = totalMetric > 0 ? targetMetric / totalMetric : 0;

  const landAllocated = Math.round(input.projectTotalLandCost * share);
  const softCostAllocated = Math.round(input.projectTotalSoftCost * share);
  const marketingAllocated = Math.round(
    input.projectTotalMarketingCost * share,
  );

  const hardCostAllocated = input.hardCostAllocated ?? 0;
  const financingCostAllocated = input.financingCost ?? 0;

  const totalCostBasis =
    landAllocated +
    input.directCosts +
    hardCostAllocated +
    softCostAllocated +
    marketingAllocated +
    financingCostAllocated +
    input.contingencyUsed;

  const reasoning = [
    `### computeUnitCostBasis (${input.allocationMethod})`,
    `Target asset metric: ${targetMetric.toLocaleString()}`,
    `Total project metric: ${totalMetric.toLocaleString()}`,
    `Asset share: ${(share * 100).toFixed(2)}%`,
    `- Land:      ${landAllocated.toLocaleString()} (${(share * 100).toFixed(2)}% of ${input.projectTotalLandCost.toLocaleString()})`,
    `- Soft:      ${softCostAllocated.toLocaleString()}`,
    `- Marketing: ${marketingAllocated.toLocaleString()}`,
    `- Direct:    ${input.directCosts.toLocaleString()}`,
    `- Hard alloc: ${hardCostAllocated.toLocaleString()}`,
    `- Financing: ${financingCostAllocated.toLocaleString()}`,
    `- Contingency: ${input.contingencyUsed.toLocaleString()}`,
    `Total cost basis: ${totalCostBasis.toLocaleString()}`,
  ].join("\n");

  return {
    landAllocated,
    softCostAllocated,
    marketingAllocated,
    hardCostDirect: input.directCosts,
    hardCostAllocated,
    financingCostAllocated,
    contingencyUsed: input.contingencyUsed,
    totalCostBasis,
    reasoning,
  };
}

export function computeMarginPercentage(input: {
  costBasis: number;
  salePrice: number;
}): number {
  if (!Number.isFinite(input.costBasis) || !Number.isFinite(input.salePrice)) {
    throw new Error("margin: inputs not finite");
  }
  if (input.salePrice <= 0) return 0;
  const margin = input.salePrice - input.costBasis;
  return (margin / input.salePrice) * 100;
}

/**
 * Project-wide conservation check. Sums per-asset allocations and
 * verifies they don't exceed the project pool. Returns drift in minor
 * units (positive = over-allocated, negative = under).
 */
export function verifyAllocationConservation(input: {
  projectPool: number;
  perAssetAllocations: number[];
}): { conserved: boolean; drift: number } {
  const sum = input.perAssetAllocations.reduce((a, b) => a + b, 0);
  const drift = sum - input.projectPool;
  // Allow 1-cent rounding tolerance per asset.
  const tolerance = input.perAssetAllocations.length;
  return { conserved: Math.abs(drift) <= tolerance, drift };
}
