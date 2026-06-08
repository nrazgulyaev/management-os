/**
 * Pricing assistant — deterministic recommendations over the live dynamic-
 * pricing engine output. The engine already computes per-night algo rates +
 * the comp index; this adds the missing "what should I do?" layer for the
 * revenue manager (the cabinet had a real curve but no advice).
 *
 * Deterministic by design (reproducible + explainable) — reads the quoted
 * calendar cells, base rate, pace, and comp position and surfaces a short
 * list of actionable nudges. Pure: no DB, unit-testable.
 */

export interface PricingRecCell {
  date: string;
  available: boolean;
  finalRateMinor: bigint;
}

export type PricingRecTone = "opportunity" | "watch" | "info";

export interface PricingRec {
  kind: string;
  tone: PricingRecTone;
  title: string;
  detail: string;
}

export function buildPricingRecommendations(input: {
  cells: PricingRecCell[];
  baseMinor: bigint;
  currency: string;
  /** Algo ADR vs comp median, as a +/- percentage (0 = at market). */
  compIndexPct: number;
}): PricingRec[] {
  const { cells, baseMinor, currency, compIndexPct } = input;
  const recs: PricingRec[] = [];
  if (cells.length === 0 || baseMinor <= 0n) return recs;

  const fmt = (m: bigint) =>
    `${currency} ${(Number(m) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  const pct = (m: bigint) =>
    Math.round((Number(m - baseMinor) / Number(baseMinor)) * 100);

  const total = cells.length;
  const open = cells.filter((c) => c.available);
  const filledPct = Math.round(((total - open.length) / total) * 100);

  // 1. Pace
  if (open.length >= 5 && filledPct < 40) {
    recs.push({
      kind: "low_pace",
      tone: "opportunity",
      title: `${open.length} of ${total} nights still open (${filledPct}% filled)`,
      detail:
        "Occupancy pace is soft for this window. Consider a short −5–10% nudge or relaxing min-stay to fill mid-week gaps.",
    });
  } else if (filledPct >= 80) {
    recs.push({
      kind: "high_pace",
      tone: "opportunity",
      title: `Strong pace — ${filledPct}% of nights already taken`,
      detail:
        "Demand is strong. Hold rates firm and consider pinning premium nights higher; relaxing discounts now may leave money on the table.",
    });
  }

  // 2. Comp position
  if (compIndexPct >= 15) {
    recs.push({
      kind: "above_comp",
      tone: "watch",
      title: `Priced ~${compIndexPct}% above the comp set`,
      detail:
        "You sit well above market — great if conversion holds. Watch booking pace and be ready to trim if the funnel slows.",
    });
  } else if (compIndexPct <= -15) {
    recs.push({
      kind: "below_comp",
      tone: "opportunity",
      title: `Priced ~${Math.abs(compIndexPct)}% below the comp set`,
      detail:
        "There may be headroom to raise rates toward the market without hurting conversion.",
    });
  }

  // 3. Peak night → pin
  if (open.length > 0) {
    const peak = open.reduce((a, b) => (b.finalRateMinor > a.finalRateMinor ? b : a));
    const peakPct = pct(peak.finalRateMinor);
    if (peakPct >= 30) {
      recs.push({
        kind: "peak",
        tone: "opportunity",
        title: `Peak night ${peak.date} at ${fmt(peak.finalRateMinor)} (+${peakPct}% vs base)`,
        detail: "A high-demand night — consider pinning it to lock the rate against rule changes.",
      });
    }

    // 4. Below-base nights → discount rules may be over-firing
    const belowBase = open.filter((c) => c.finalRateMinor < baseMinor);
    if (belowBase.length >= 3) {
      recs.push({
        kind: "below_base",
        tone: "watch",
        title: `${belowBase.length} open nights priced below base (${fmt(baseMinor)})`,
        detail: "Discount / low-season rules are pulling several nights under base — verify they aren't over-firing.",
      });
    }

    // 5. Flat algo → rules too conservative
    const avg = open.reduce((s, c) => s + c.finalRateMinor, 0n) / BigInt(open.length);
    const flatPct = pct(avg);
    if (open.length >= 7 && Math.abs(flatPct) <= 3) {
      recs.push({
        kind: "flat",
        tone: "info",
        title: `Algo is tracking base (avg ${flatPct >= 0 ? "+" : ""}${flatPct}%)`,
        detail:
          "Rules are barely moving prices off base for this window. If demand varies day-to-day, the rule set may be too conservative.",
      });
    }
  }

  if (recs.length === 0) {
    recs.push({
      kind: "steady",
      tone: "info",
      title: "Pricing looks balanced",
      detail: "No strong signals in this window — algo, comp position, and pace are within normal ranges.",
    });
  }
  return recs;
}
