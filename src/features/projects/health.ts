/**
 * Phase 2.2 dev-01 — Project health derivation.
 *
 * Aggregates two axes:
 *   - schedule  → max slip across milestones (days)
 *   - budget    → BOQ actual / total budget (pct)
 *
 * Composite `overall` takes the worse of the two. Thresholds match
 * the cabinet doc:
 *
 *   Green  → schedule ≤ 7d slip AND budget ≤ 95%
 *   Amber  → schedule 7–21d  OR   budget 95–105%
 *   Red    → schedule > 21d  OR   budget > 105%
 *
 * This module stays pure — the daily cache + recompute-on-edit
 * orchestration lives in 2.2's follow-up data-wiring PR.
 */

import type { HealthLevel } from "@/components/projects/health-pill";

export interface MilestoneSlipInput {
  /** Days late (positive) or early (negative). */
  slipDays: number;
  /** Status the milestone reported. Slip ignored when "done". */
  status: "planned" | "in_progress" | "done" | "blocked" | "slipping";
}

export interface ProjectHealthInput {
  milestones: MilestoneSlipInput[];
  /** Total budget, project currency, in major units. */
  budgetTotal: number;
  /** Actual spend to date, same currency + units. */
  budgetActual: number;
}

export interface ProjectHealth {
  schedule: HealthLevel;
  budget: HealthLevel;
  overall: HealthLevel;
  /** Top reason — surfaced as the HealthPill tooltip. */
  reason: string;
  /** Worst slip in days across in-flight milestones. */
  worstSlipDays: number;
  /** Budget burn 0..120+ (pct of total). */
  budgetBurnPct: number;
}

export function computeHealth({
  milestones,
  budgetTotal,
  budgetActual,
}: ProjectHealthInput): ProjectHealth {
  // Schedule axis — worst slip across non-done milestones.
  let worst = 0;
  for (const m of milestones) {
    if (m.status === "done") continue;
    if (m.slipDays > worst) worst = m.slipDays;
  }
  const schedule: HealthLevel = worst > 21 ? "red" : worst > 7 ? "amber" : "green";

  // Budget axis — burn against total.
  const burn = budgetTotal > 0 ? (budgetActual / budgetTotal) * 100 : 0;
  const budget: HealthLevel = burn > 105 ? "red" : burn > 95 ? "amber" : "green";

  // Composite — worse-of.
  const overall = worseOf(schedule, budget);
  const reason =
    overall === "green"
      ? "On track — schedule + budget both green"
      : overall === schedule
        ? `Schedule slip ${worst}d`
        : `Budget burn ${burn.toFixed(0)}%`;

  return {
    schedule,
    budget,
    overall,
    reason,
    worstSlipDays: worst,
    budgetBurnPct: Math.round(burn * 10) / 10,
  };
}

function worseOf(a: HealthLevel, b: HealthLevel): HealthLevel {
  const rank: Record<HealthLevel, number> = { green: 0, amber: 1, red: 2 };
  return rank[a] >= rank[b] ? a : b;
}
