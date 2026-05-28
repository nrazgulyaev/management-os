/**
 * Phase 2.4 mgmt-02 — Dynamic-pricing 8-step engine.
 *
 * Canonical order of operations. Each step contributes a delta
 * + a human-readable description to the audit array; the final
 * amount is the rolling sum. Pure function so unit tests can
 * golden-snapshot a villa-date combination.
 *
 *   1. base        — villa's base nightly rate
 *   2. season      — season-band multiplier (high / low / shoulder)
 *   3. algo        — ML lift suggestion
 *   4. DOW/occ     — day-of-week + remaining-inventory adjustment
 *   5. events      — local event lifts (concerts, holidays, comp set)
 *   6. pins        — manual override (force-set)
 *   7. clamp       — floor/ceiling rule clamps
 *   8. write       — final rounding (5_000 IDR steps)
 *
 * The engine never pushes to channels; the caller does that in a
 * separate explicit action per Mgmt UX rule #3.
 */

export interface PricingEngineInput {
  villaId: string;
  date: string; // ISO YYYY-MM-DD
  baseAmount: number;
  seasonMultiplier?: number;
  algoLiftPct?: number;
  dowFactor?: number;
  occupancyFactor?: number;
  eventLifts?: { tag: string; pct: number }[];
  pinnedAmount?: number;
  floor?: number;
  ceiling?: number;
  roundingStep?: number;
}

export interface AuditStep {
  step: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  label: string;
  /** Signed delta in major units. Step 6 may emit the full amount as the delta. */
  delta: number;
  description: string;
}

export interface PricingEngineOutput {
  villaId: string;
  date: string;
  amount: number;
  audit: AuditStep[];
}

function round(amount: number, step: number): number {
  if (step <= 1) return Math.round(amount);
  return Math.round(amount / step) * step;
}

export function runPricingEngine(input: PricingEngineInput): PricingEngineOutput {
  const audit: AuditStep[] = [];
  let amount = input.baseAmount;

  // 1. base
  audit.push({ step: 1, label: "Base", delta: amount, description: `Villa base rate ${amount}` });

  // 2. season
  if (input.seasonMultiplier && input.seasonMultiplier !== 1) {
    const before = amount;
    amount = amount * input.seasonMultiplier;
    audit.push({
      step: 2,
      label: "Season",
      delta: amount - before,
      description: `Season ×${input.seasonMultiplier}`,
    });
  }

  // 3. algo lift
  if (input.algoLiftPct) {
    const before = amount;
    amount = amount * (1 + input.algoLiftPct / 100);
    audit.push({
      step: 3,
      label: "Algo",
      delta: amount - before,
      description: `Algo lift ${input.algoLiftPct >= 0 ? "+" : ""}${input.algoLiftPct}%`,
    });
  }

  // 4. DOW / occupancy
  if (input.dowFactor && input.dowFactor !== 1) {
    const before = amount;
    amount = amount * input.dowFactor;
    audit.push({ step: 4, label: "DOW", delta: amount - before, description: `Day-of-week ×${input.dowFactor}` });
  }
  if (input.occupancyFactor && input.occupancyFactor !== 1) {
    const before = amount;
    amount = amount * input.occupancyFactor;
    audit.push({
      step: 4,
      label: "Occupancy",
      delta: amount - before,
      description: `Occupancy ×${input.occupancyFactor}`,
    });
  }

  // 5. events
  if (input.eventLifts?.length) {
    for (const ev of input.eventLifts) {
      const before = amount;
      amount = amount * (1 + ev.pct / 100);
      audit.push({
        step: 5,
        label: "Event",
        delta: amount - before,
        description: `${ev.tag}: ${ev.pct >= 0 ? "+" : ""}${ev.pct}%`,
      });
    }
  }

  // 6. pin (override). Pinned overrides survive algo runs — Critical UX rule 2.
  if (input.pinnedAmount != null) {
    audit.push({
      step: 6,
      label: "Pin",
      delta: input.pinnedAmount - amount,
      description: `Manual pin ${input.pinnedAmount}`,
    });
    amount = input.pinnedAmount;
  }

  // 7. clamp
  if (input.floor != null && amount < input.floor) {
    audit.push({ step: 7, label: "Floor", delta: input.floor - amount, description: `Clamped to floor ${input.floor}` });
    amount = input.floor;
  }
  if (input.ceiling != null && amount > input.ceiling) {
    audit.push({
      step: 7,
      label: "Ceiling",
      delta: input.ceiling - amount,
      description: `Clamped to ceiling ${input.ceiling}`,
    });
    amount = input.ceiling;
  }

  // 8. write — round to the configured step (default 5_000 IDR steps).
  const step = input.roundingStep ?? 5_000;
  const final = round(amount, step);
  if (final !== amount) {
    audit.push({ step: 8, label: "Round", delta: final - amount, description: `Rounded to step ${step}` });
  }

  return { villaId: input.villaId, date: input.date, amount: final, audit };
}
