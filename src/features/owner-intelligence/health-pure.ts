/**
 * Pure helpers for villa health scoring (Prompt 101). No DB / no
 * `server-only` import.
 *
 * The scoring model is intentionally simple + deterministic so the
 * "What changed this month" explanation can be regenerated from the
 * inputs without a model call. Each input contributes points to a
 * 0–100 score; thresholds map onto the documented status set.
 */

export type VillaHealthStatus =
  | "excellent"
  | "good"
  | "watch"
  | "attention"
  | "unknown";

export interface HealthInput {
  bookedNights: number;
  availableNights: number;
  ownerStayNights: number;
  maintenanceBlockedNights: number;
  housekeepingTasksCompleted: number;
  maintenanceTicketsOpen: number;
  maintenanceTicketsCompleted: number;
  preventiveTasksDue: number;
  utilityRiskCount: number;
  averageReviewRating: number | null;
  negativeReviewCount: number;
  reserveBalanceMinor: bigint | null;
  reserveCurrency: string | null;
}

export interface HealthOutcome {
  score: number;
  status: VillaHealthStatus;
  components: {
    occupancy: number;
    reviews: number;
    maintenance: number;
    preventive: number;
    utilities: number;
  };
}

const WEIGHTS = {
  occupancy: 35,
  reviews: 25,
  maintenance: 20,
  preventive: 10,
  utilities: 10,
};

/**
 * Pure: occupancy rate as a 0..1 fraction. Returns 0 when no
 * available nights to avoid divide-by-zero in callers.
 */
export function calculateOccupancyRate(
  bookedNights: number,
  availableNights: number,
): number {
  if (!Number.isFinite(bookedNights) || !Number.isFinite(availableNights))
    return 0;
  if (availableNights <= 0) return 0;
  const rate = bookedNights / availableNights;
  if (rate < 0) return 0;
  if (rate > 1) return 1;
  return rate;
}

/**
 * Pure: aggregate review rating from the owner-visible review set.
 * Filters out hidden / non-published rows when `ownerMode = true`.
 * Returns null when no eligible rows.
 */
export interface ReviewForAggregate {
  rating: number | null;
  status: string;
  ownerVisible: boolean;
}

export function aggregateReviewRating(
  reviews: ReadonlyArray<ReviewForAggregate>,
  opts?: { ownerMode?: boolean },
): { average: number | null; sampleSize: number } {
  const ownerMode = opts?.ownerMode ?? false;
  const eligible = reviews.filter((r) => {
    if (r.rating == null) return false;
    if (r.status !== "published") return false;
    if (ownerMode && !r.ownerVisible) return false;
    return true;
  });
  if (eligible.length === 0) return { average: null, sampleSize: 0 };
  const sum = eligible.reduce((a, r) => a + (r.rating ?? 0), 0);
  return {
    average: Math.round((sum / eligible.length) * 100) / 100,
    sampleSize: eligible.length,
  };
}

/**
 * Pure: count blocked nights from a raw block list. Half-open
 * semantics: each block contributes `(end - start)` nights.
 */
export interface BlockForCount {
  startDate: string;
  endDate: string;
  source: "maintenance_block" | "internal_hold" | "out_of_order";
}

export function countBlockedNights(
  blocks: ReadonlyArray<BlockForCount>,
  filterSource?: BlockForCount["source"],
): number {
  let total = 0;
  for (const b of blocks) {
    if (filterSource && b.source !== filterSource) continue;
    const start = new Date(`${b.startDate}T00:00:00Z`);
    const end = new Date(`${b.endDate}T00:00:00Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
      continue;
    const ms = end.getTime() - start.getTime();
    if (ms <= 0) continue;
    total += Math.round(ms / (24 * 60 * 60 * 1000));
  }
  return total;
}

/**
 * Pure: aggregate maintenance signals into a 0..1 health component.
 * Open tickets reduce the score; resolved tickets neutral; preventive
 * overdue is the worst signal (covered separately below).
 */
export function summarizeMaintenanceHealth(input: {
  maintenanceTicketsOpen: number;
  maintenanceTicketsCompleted: number;
  preventiveTasksDue: number;
}): { open: number; completed: number; overdue: number } {
  return {
    open: Math.max(0, input.maintenanceTicketsOpen),
    completed: Math.max(0, input.maintenanceTicketsCompleted),
    overdue: Math.max(0, input.preventiveTasksDue),
  };
}

/**
 * Pure: classify a 0..100 score onto the documented status set.
 *
 *   ≥ 85 → excellent
 *   ≥ 70 → good
 *   ≥ 55 → watch
 *   <  55 → attention
 */
export function classifyVillaHealthStatus(
  score: number | null,
): VillaHealthStatus {
  if (score == null || !Number.isFinite(score)) return "unknown";
  if (score >= 85) return "excellent";
  if (score >= 70) return "good";
  if (score >= 55) return "watch";
  return "attention";
}

/**
 * Pure: calculate the full health score from the documented inputs.
 *
 * Components (each 0..1, weighted into a 100-point total):
 *   • occupancy    — booked / available nights, capped at 100% mapping.
 *   • reviews      — average rating mapped 3.0 → 0, 5.0 → 1.
 *   • maintenance  — open tickets penalised: 0 open → 1, ≥3 open → 0.
 *   • preventive   — due tasks penalised: 0 due → 1, ≥3 due → 0.
 *   • utilities    — utility_risk_count: 0 → 1, ≥2 → 0.
 *
 * When we can't compute any component (e.g. no reviews yet) we
 * use a neutral 0.5 for that slice so a brand-new villa doesn't
 * silently land at "attention".
 */
export function calculateVillaHealthScore(
  input: HealthInput,
): HealthOutcome {
  const occupancy = calculateOccupancyRate(
    input.bookedNights,
    input.availableNights,
  );
  // We give "good" occupancy starting around 70%. >= 90% saturates.
  const occupancyComponent = clamp01(
    Math.max(0, (occupancy - 0.3) / 0.6),
  );

  const reviewAverage = input.averageReviewRating;
  const reviewsComponent =
    reviewAverage == null
      ? 0.5
      : clamp01((reviewAverage - 3) / 2);

  const open = Math.max(0, input.maintenanceTicketsOpen);
  const maintenanceComponent = open >= 3 ? 0 : 1 - open / 3;

  const overdue = Math.max(0, input.preventiveTasksDue);
  const preventiveComponent = overdue >= 3 ? 0 : 1 - overdue / 3;

  const risk = Math.max(0, input.utilityRiskCount);
  const utilitiesComponent = risk >= 2 ? 0 : 1 - risk / 2;

  const components = {
    occupancy: occupancyComponent,
    reviews: reviewsComponent,
    maintenance: maintenanceComponent,
    preventive: preventiveComponent,
    utilities: utilitiesComponent,
  };

  const score =
    occupancyComponent * WEIGHTS.occupancy +
    reviewsComponent * WEIGHTS.reviews +
    maintenanceComponent * WEIGHTS.maintenance +
    preventiveComponent * WEIGHTS.preventive +
    utilitiesComponent * WEIGHTS.utilities;

  // Negative reviews stack on top: each one shaves 4 points, capped.
  const negativePenalty = Math.min(
    20,
    Math.max(0, input.negativeReviewCount) * 4,
  );

  const finalScore = Math.max(
    0,
    Math.min(100, Math.round((score - negativePenalty) * 100) / 100),
  );

  return {
    score: finalScore,
    status: classifyVillaHealthStatus(finalScore),
    components,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Pure: assemble a deterministic "What changed this month"
 * explanation for the owner. Strictly bullet-style facts, no AI.
 */
export interface HealthExplanationInput extends HealthInput {
  villaName: string;
  periodStart: string;
  periodEnd: string;
}

export function summarizeVillaHealthExplanation(
  input: HealthExplanationInput,
): string[] {
  const lines: string[] = [];
  const occ = calculateOccupancyRate(
    input.bookedNights,
    input.availableNights,
  );
  const occPct = Math.round(occ * 100);
  lines.push(
    `${input.villaName} ${input.periodStart} → ${input.periodEnd}: ${occPct}% occupancy across ${input.availableNights || 0} available nights.`,
  );
  if (input.bookedNights > 0) {
    lines.push(
      `${input.bookedNights} guest night${input.bookedNights === 1 ? "" : "s"}.`,
    );
  }
  if (input.ownerStayNights > 0) {
    lines.push(
      `${input.ownerStayNights} owner-stay night${input.ownerStayNights === 1 ? "" : "s"}.`,
    );
  }
  if (input.maintenanceBlockedNights > 0) {
    lines.push(
      `${input.maintenanceBlockedNights} maintenance / hold night${input.maintenanceBlockedNights === 1 ? "" : "s"}.`,
    );
  }
  if (input.maintenanceTicketsOpen > 0) {
    lines.push(
      `${input.maintenanceTicketsOpen} open maintenance ticket${input.maintenanceTicketsOpen === 1 ? "" : "s"}.`,
    );
  } else if (input.maintenanceTicketsCompleted > 0) {
    lines.push(
      `${input.maintenanceTicketsCompleted} maintenance ticket${input.maintenanceTicketsCompleted === 1 ? "" : "s"} completed.`,
    );
  }
  if (input.preventiveTasksDue > 0) {
    lines.push(
      `${input.preventiveTasksDue} preventive task${input.preventiveTasksDue === 1 ? "" : "s"} due.`,
    );
  }
  if (input.utilityRiskCount > 0) {
    lines.push(
      `${input.utilityRiskCount} utility risk signal${input.utilityRiskCount === 1 ? "" : "s"}.`,
    );
  }
  if (input.averageReviewRating != null) {
    lines.push(
      `Average review rating ${input.averageReviewRating.toFixed(2)} (${input.negativeReviewCount} negative).`,
    );
  }
  return lines;
}
