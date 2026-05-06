/**
 * Pure helpers for shared cost allocation math. Extracted from the
 * server module so tests can import without `server-only`. Same pattern
 * as `distribution-preview-helpers.ts` (Stage 3.C) and
 * `distribution-helpers.ts` (Stage 2.3.B).
 *
 * Allocation invariants:
 *   - Percentages must sum to exactly 100% (DB trigger backs this up).
 *   - Per-project amount = round(source_amount × percentage / 100).
 *   - Sum of per-project amounts must equal source amount within
 *     1 minor unit (rounding remainder folded into the largest line).
 */

export interface AllocationInputLine {
  projectId: string;
  percentage: number;
}

export interface AllocationOutputLine {
  projectId: string;
  percentage: number;
  amountMinor: bigint;
}

export interface AllocationBasisInput {
  /** e.g. {project1: 200, project2: 300, project3: 500} for sqm areas */
  weights: Record<string, number>;
}

export type AllocationMethod =
  | "by_floor_area"
  | "by_land_area"
  | "by_unit_count"
  | "by_budget_size"
  | "by_revenue_share"
  | "by_time_spent"
  | "by_headcount"
  | "fixed_percentage"
  | "manual_split"
  | "custom_formula";

/**
 * Compute per-project amounts from a source total + percentage splits.
 *
 *   - Throws if percentages don't sum to 100% (within 0.001 tolerance).
 *   - Rounds each line to nearest minor unit.
 *   - Folds rounding remainder into the line with the LARGEST amount
 *     so the per-line sum exactly matches `sourceAmountMinor`.
 */
export function computeAllocationAmounts(
  sourceAmountMinor: bigint,
  lines: AllocationInputLine[],
): AllocationOutputLine[] {
  if (sourceAmountMinor < 0n) {
    throw new Error("sourceAmountMinor must be ≥ 0");
  }
  if (lines.length === 0) {
    throw new Error("at least one allocation line required");
  }

  let totalPct = 0;
  for (const l of lines) {
    if (l.percentage <= 0 || l.percentage > 100) {
      throw new Error(
        `percentage must be in (0, 100], got ${l.percentage} for project ${l.projectId}`,
      );
    }
    totalPct += l.percentage;
  }
  if (Math.abs(totalPct - 100) > 0.001) {
    throw new Error(
      `allocation percentages must sum to 100%, got ${totalPct}`,
    );
  }

  // Compute provisional amounts.
  const provisional: AllocationOutputLine[] = lines.map((l) => {
    const amt = (sourceAmountMinor * BigInt(Math.round(l.percentage * 10000))) /
      1_000_000n;
    return { projectId: l.projectId, percentage: l.percentage, amountMinor: amt };
  });

  // Fold rounding remainder into the largest line so the sum equals
  // sourceAmountMinor exactly.
  const sum = provisional.reduce((s, l) => s + l.amountMinor, 0n);
  const remainder = sourceAmountMinor - sum;
  if (remainder !== 0n) {
    let largestIdx = 0;
    for (let i = 1; i < provisional.length; i++) {
      if (provisional[i].amountMinor > provisional[largestIdx].amountMinor) {
        largestIdx = i;
      }
    }
    provisional[largestIdx].amountMinor += remainder;
  }

  return provisional;
}

/**
 * Convert a basis snapshot (e.g. floor areas per project) into
 * percentages. Rounds to 4 decimal places to match the NUMERIC(7,4)
 * precision of `shared_cost_allocation_lines.percentage`.
 *
 * Throws when the total weight is 0 — caller must handle that case
 * upstream (no projects to allocate to).
 */
export function weightsToPercentages(
  basis: AllocationBasisInput,
): Array<{ projectId: string; percentage: number }> {
  const entries = Object.entries(basis.weights);
  if (entries.length === 0) {
    throw new Error("basis.weights must have at least one project");
  }
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) {
    throw new Error(`total weight must be > 0, got ${total}`);
  }
  const raw = entries.map(([projectId, w]) => ({
    projectId,
    raw: (w / total) * 100,
  }));
  // Round to 4 decimals.
  const rounded = raw.map((r) => ({
    projectId: r.projectId,
    percentage: Math.round(r.raw * 10000) / 10000,
  }));
  // Adjust the largest to make the sum exactly 100.
  const sum = rounded.reduce((s, r) => s + r.percentage, 0);
  const drift = 100 - sum;
  if (Math.abs(drift) > 0.0001) {
    let largestIdx = 0;
    for (let i = 1; i < rounded.length; i++) {
      if (rounded[i].percentage > rounded[largestIdx].percentage) {
        largestIdx = i;
      }
    }
    rounded[largestIdx].percentage = Math.round(
      (rounded[largestIdx].percentage + drift) * 10000,
    ) / 10000;
  }
  return rounded;
}
