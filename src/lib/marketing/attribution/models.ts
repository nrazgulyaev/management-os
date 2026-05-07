/**
 * Stage 6.P4.F — Attribution model functions.
 *
 * Pure helpers — no I/O. Take an array of `AttributionTouchpointRecord`
 * (filtered to a conversion's lookback window + sorted by
 * touchpointAt ascending) and produce a per-touchpoint weight
 * distribution that sums to 1.0.
 *
 * Five models per the P4 master prompt:
 *   - first_touch      → 100% credit to the earliest touchpoint
 *   - last_touch       → 100% credit to the latest touchpoint
 *   - linear           → 1/n equally to every touchpoint
 *   - time_decay       → recent gets more (half-life-based)
 *   - position_based   → first + last get the bulk; middle splits the rest
 *
 * The engine doesn't depend on which model is chosen — it consumes
 * the weight array and projects credit values into the
 * `attribution_conversions.linear_attribution_data` JSONB.
 */

import type { AttributionTouchpointRecord } from "../types";

export type AttributionModel =
  | "first_touch"
  | "last_touch"
  | "linear"
  | "time_decay"
  | "position_based";

export interface ModelOptions {
  /** Half-life in days for time_decay. Default 7. */
  halfLifeDays?: number;
  /** Position-based ratios — defaults to [0.4, 0.2, 0.4] (first /
   *  middle / last). Must sum to 1.0. */
  positionRatios?: [number, number, number];
}

/**
 * Compute weights for a sorted-ascending array of touchpoints.
 * Returns an array the same length as the input where each entry is
 * in [0, 1] and the array sums to 1.0 (within float precision).
 *
 * Empty input → empty output.
 */
export function computeAttributionWeights(
  touchpoints: AttributionTouchpointRecord[],
  model: AttributionModel,
  opts: ModelOptions = {},
): number[] {
  if (touchpoints.length === 0) return [];
  switch (model) {
    case "first_touch":
      return firstTouchAttribution(touchpoints);
    case "last_touch":
      return lastTouchAttribution(touchpoints);
    case "linear":
      return linearAttribution(touchpoints);
    case "time_decay":
      return timeDecayAttribution(
        touchpoints,
        opts.halfLifeDays ?? 7,
      );
    case "position_based":
      return positionBasedAttribution(
        touchpoints,
        opts.positionRatios ?? [0.4, 0.2, 0.4],
      );
    default: {
      // Exhaustiveness guard.
      const _exh: never = model;
      void _exh;
      return [];
    }
  }
}

// ---------------------------------------------------------------------------
// Model implementations (pure)
// ---------------------------------------------------------------------------

export function firstTouchAttribution(
  touchpoints: AttributionTouchpointRecord[],
): number[] {
  if (touchpoints.length === 0) return [];
  return touchpoints.map((_, i) => (i === 0 ? 1 : 0));
}

export function lastTouchAttribution(
  touchpoints: AttributionTouchpointRecord[],
): number[] {
  if (touchpoints.length === 0) return [];
  return touchpoints.map((_, i) =>
    i === touchpoints.length - 1 ? 1 : 0,
  );
}

export function linearAttribution(
  touchpoints: AttributionTouchpointRecord[],
): number[] {
  if (touchpoints.length === 0) return [];
  const w = 1 / touchpoints.length;
  return touchpoints.map(() => w);
}

/**
 * Time-decay attribution — exponential decay where the half-life
 * determines how quickly older touchpoints lose weight.
 *
 *   weight_i = 0.5 ^ ((convertedAt - touchpointAt_i) / halfLifeDays)
 *
 * The conversion is treated as the implicit "now" — the latest
 * touchpoint's age is measured from there. We use the LAST
 * touchpoint as the conversion proxy since the engine sorts inputs
 * ascending. Weights are normalized to sum to 1.0.
 */
export function timeDecayAttribution(
  touchpoints: AttributionTouchpointRecord[],
  halfLifeDays: number,
): number[] {
  if (touchpoints.length === 0) return [];
  if (touchpoints.length === 1) return [1];
  const halfLifeMs = Math.max(1, halfLifeDays) * 24 * 60 * 60 * 1000;
  const conversionTime =
    touchpoints[touchpoints.length - 1].touchpointAt.getTime();
  const raw = touchpoints.map((tp) => {
    const ageMs = conversionTime - tp.touchpointAt.getTime();
    return Math.pow(0.5, ageMs / halfLifeMs);
  });
  const sum = raw.reduce((a, b) => a + b, 0);
  if (sum === 0) return touchpoints.map(() => 1 / touchpoints.length);
  return raw.map((r) => r / sum);
}

/**
 * Position-based (U-shaped or W-shaped) attribution — first + last
 * touchpoints get the lion's share; middle touchpoints split the
 * rest equally.
 *
 *   first    = ratios[0]
 *   middle×n = ratios[1] / n        (when n > 0)
 *   last     = ratios[2]
 *
 * Edge cases:
 *   - 1 touchpoint → 100% to it
 *   - 2 touchpoints → first=ratios[0]+ratios[1]/2, last=ratios[2]+ratios[1]/2
 *     (so weights still sum to 1.0)
 */
export function positionBasedAttribution(
  touchpoints: AttributionTouchpointRecord[],
  ratios: [number, number, number],
): number[] {
  const n = touchpoints.length;
  if (n === 0) return [];
  if (n === 1) return [1];
  const [first, middle, last] = ratios;
  if (n === 2) {
    // No middle slots — split the middle ratio between first + last.
    return [first + middle / 2, last + middle / 2];
  }
  const middleCount = n - 2;
  const middleEach = middleCount > 0 ? middle / middleCount : 0;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) out.push(first);
    else if (i === n - 1) out.push(last);
    else out.push(middleEach);
  }
  return out;
}
