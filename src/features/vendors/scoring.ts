/**
 * Phase 2.2 dev-04 — Vendor scoring model.
 *
 * Composite vendor score is a weighted average of four sub-scores
 * (each 0..100):
 *
 *   price          weight 40%   ← lower-than-market wins
 *   delivery       weight 30%   ← on-time rate, lead-time variance
 *   quality        weight 20%   ← inspection pass-rate + warranty claims
 *   responsiveness weight 10%   ← time-to-quote on RFQs
 *
 * Bands (used for the badge tone):
 *
 *   high  ≥ 85
 *   mid   65–84
 *   low   < 65
 *
 * Pure function. Caller is responsible for assembling the component
 * scores from the underlying tables; this module just composes.
 */

export const VENDOR_SCORE_WEIGHTS = {
  price: 0.4,
  delivery: 0.3,
  quality: 0.2,
  responsiveness: 0.1,
} as const;

export type VendorScoreBand = "high" | "mid" | "low";

export interface VendorScoreComponents {
  price: number;
  delivery: number;
  quality: number;
  responsiveness: number;
}

export interface VendorScoreResult {
  composite: number;
  band: VendorScoreBand;
  components: VendorScoreComponents;
}

export function computeVendorScore(c: VendorScoreComponents): VendorScoreResult {
  const composite = Math.round(
    c.price * VENDOR_SCORE_WEIGHTS.price +
      c.delivery * VENDOR_SCORE_WEIGHTS.delivery +
      c.quality * VENDOR_SCORE_WEIGHTS.quality +
      c.responsiveness * VENDOR_SCORE_WEIGHTS.responsiveness,
  );
  const band: VendorScoreBand = composite >= 85 ? "high" : composite >= 65 ? "mid" : "low";
  return { composite, band, components: c };
}
