/**
 * Sprint 1 — deterministic synthetic sparkline series helper.
 *
 * Most cabinets read a single `latestSnapshot` + `previousSnapshot` —
 * only 2 historical data points, not enough to draw a trend line.
 * Until each cabinet ships a real time-series store, this helper
 * synthesises a smooth N-point series anchored on the *current* value
 * with the *delta percentage* baked in, so the resulting sparkline
 * matches the displayed trend direction.
 *
 * Properties:
 *   - deterministic (same inputs → same series; stable under SSR)
 *   - last point equals the current value exactly
 *   - first point equals the prior value implied by the delta
 *   - intermediate points use a smooth ease-in curve (no random jitter)
 *
 * TODO: wire to a real time-series store once cabinet-level history
 * (e.g. `<entity>_daily_snapshot` tables) is normalised.
 */

export function synthSparklineSeries(
  /** Current value (non-negative). */
  current: number,
  /** Percentage change vs prior point (e.g. +12.4 = up 12.4%). */
  deltaPct: number,
  /** Number of points to emit. Defaults to 7. */
  points = 7,
): number[] {
  if (!Number.isFinite(current) || points < 2) return [];
  const prior =
    Number.isFinite(deltaPct) && deltaPct > -100
      ? current / (1 + deltaPct / 100)
      : current;
  const out: number[] = [];
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1); // 0 → 1
    // Smoothstep — easier on the eye than linear; preserves both endpoints.
    const eased = t * t * (3 - 2 * t);
    out.push(prior + (current - prior) * eased);
  }
  // Snap last point to exact current to avoid float drift.
  out[out.length - 1] = current;
  return out;
}
