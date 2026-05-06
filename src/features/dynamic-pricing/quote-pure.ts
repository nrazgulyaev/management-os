/**
 * Pure quote engine for the dynamic pricing rules. No DB / no
 * `server-only` import.
 *
 * Money is BIGINT minor units. Numeric percentages are decimals
 * stored on the modifier rules: 0.10 = +10%, -0.05 = -5%.
 *
 * Each `quoteNight` walks the modifier order:
 *   1. base
 *   2. day-of-week
 *   3. occupancy
 *   4. close-out
 *   5. channel
 *   6. clamp to (min_rate_minor, max_rate_minor)
 *
 * stop-sell rules + close-out `stop_sell` short-circuit availability;
 * min-stay rules are evaluated against the requested LOS.
 */
import type {
  ChannelRule,
  CloseOutRule,
  DayOfWeekRule,
  MinStayRule,
  ModifierType,
  OccupancyRule,
  RuleBundle,
  StopSellRule,
} from "./rule-types";

// -----------------------------------------------------------------------------
// Date helpers
// -----------------------------------------------------------------------------

/** ISO-date safe-parse. Returns null on garbage. */
export function parseIsoDate(d: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const out = new Date(`${d}T00:00:00.000Z`);
  return Number.isNaN(out.getTime()) ? null : out;
}

export function isoDay(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: Date): number {
  const js = date.getUTCDay(); // 0 = Sunday … 6 = Saturday
  return js === 0 ? 7 : js;
}

/**
 * Pure: half-open interval enumeration of the nights inside a
 * booking window. `[checkIn, checkOut)` — the checkout day is NOT
 * included as a billable night, matching `bookings.check_out`.
 */
export function enumerateStayNights(
  checkIn: string,
  checkOut: string,
): string[] {
  const start = parseIsoDate(checkIn);
  const end = parseIsoDate(checkOut);
  if (!start || !end) return [];
  if (end.getTime() <= start.getTime()) return [];
  const out: string[] = [];
  for (
    let d = new Date(start.getTime());
    d.getTime() < end.getTime();
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    out.push(isoDay(d));
  }
  return out;
}

export function daysBetweenInclusive(from: string, to: string): number {
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

// -----------------------------------------------------------------------------
// Modifier math
// -----------------------------------------------------------------------------

export function asBigint(
  v: bigint | number | string | null | undefined,
): bigint {
  if (v == null) return 0n;
  if (typeof v === "bigint") return v;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return 0n;
    return BigInt(Math.trunc(v));
  }
  try {
    return BigInt(v);
  } catch {
    return 0n;
  }
}

export interface ModifierLike {
  modifierType: ModifierType;
  modifierValueNumeric?: number | string | null;
  modifierAmountMinor?: bigint | number | string | null;
}

/**
 * Pure: apply a single modifier to an amount. Percent modifiers use
 * decimal fractions: 0.10 = +10%. Fixed modifiers use minor units.
 * Negative values are valid; the caller clamps the result.
 */
export function applyModifierMinor(
  baseMinor: bigint,
  modifier: ModifierLike,
): bigint {
  if (modifier.modifierType === "percent") {
    const value =
      typeof modifier.modifierValueNumeric === "number"
        ? modifier.modifierValueNumeric
        : modifier.modifierValueNumeric != null
          ? Number(modifier.modifierValueNumeric)
          : 0;
    if (!Number.isFinite(value) || value === 0) return baseMinor;
    // To keep math integer-pure, scale by 1e6 then divide.
    const scaled = BigInt(Math.round(value * 1_000_000));
    const delta = (baseMinor * scaled) / 1_000_000n;
    return baseMinor + delta;
  }
  // fixed
  const amount = asBigint(modifier.modifierAmountMinor ?? 0);
  return baseMinor + amount;
}

/**
 * Pure: clamp a rate to a `[min, max]` window. Either bound can be
 * null. Return value preserves bigint type.
 */
export function clampRateMinor(
  rateMinor: bigint,
  minRateMinor: bigint | null,
  maxRateMinor: bigint | null,
): { value: bigint; clamped: "min" | "max" | null } {
  let value = rateMinor;
  let clamped: "min" | "max" | null = null;
  if (minRateMinor != null && value < minRateMinor) {
    value = minRateMinor;
    clamped = "min";
  }
  if (maxRateMinor != null && value > maxRateMinor) {
    value = maxRateMinor;
    clamped = "max";
  }
  return { value, clamped };
}

// -----------------------------------------------------------------------------
// Rule resolution
// -----------------------------------------------------------------------------

export function resolveDayOfWeekRule(
  date: Date,
  rules: ReadonlyArray<DayOfWeekRule>,
): DayOfWeekRule | null {
  const wd = isoWeekday(date);
  return (
    rules.find((r) => r.status === "active" && r.weekday === wd) ?? null
  );
}

export function resolveOccupancyRule(
  occupancy: number,
  rules: ReadonlyArray<OccupancyRule>,
): OccupancyRule | null {
  if (!Number.isFinite(occupancy)) return null;
  const o = Math.max(0, Math.min(1, occupancy));
  return (
    rules.find(
      (r) =>
        r.status === "active" &&
        Number(r.occupancyMin) <= o &&
        o < Number(r.occupancyMax),
    ) ?? null
  );
}

export function resolveCloseOutRule(
  date: Date,
  today: Date,
  rules: ReadonlyArray<CloseOutRule>,
): CloseOutRule | null {
  const days = Math.round(
    (date.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
  );
  return (
    rules.find(
      (r) =>
        r.status === "active" &&
        days >= r.daysBeforeCheckinMin &&
        days <= r.daysBeforeCheckinMax,
    ) ?? null
  );
}

export function resolveChannelRule(
  channelKey: string,
  rules: ReadonlyArray<ChannelRule>,
): ChannelRule | null {
  return (
    rules.find(
      (r) => r.status === "active" && r.channelKey === channelKey,
    ) ?? null
  );
}

/**
 * Pure: pick the strictest min-LOS for a given date range. Returns
 * `{ minLos, ruleId }` (highest-priority rule wins on ties).
 */
export function resolveMinStayRequirement(
  checkIn: string,
  checkOut: string,
  rules: ReadonlyArray<MinStayRule>,
): { minLos: number; ruleId: string | null; name: string | null } {
  const nights = enumerateStayNights(checkIn, checkOut);
  if (nights.length === 0) {
    return { minLos: 1, ruleId: null, name: null };
  }
  let bestMin = 1;
  let bestRule: MinStayRule | null = null;
  for (const r of rules) {
    if (r.status !== "active") continue;
    if (!ruleAppliesToAnyNight(r, nights)) continue;
    if (r.minLos > bestMin) {
      bestMin = r.minLos;
      bestRule = r;
    } else if (r.minLos === bestMin && bestRule) {
      // Higher priority wins (lower number = stricter).
      if (r.priority < bestRule.priority) bestRule = r;
    } else if (!bestRule) {
      bestRule = r;
    }
  }
  return {
    minLos: bestMin,
    ruleId: bestRule?.id ?? null,
    name: bestRule?.name ?? null,
  };
}

function ruleAppliesToAnyNight(
  rule: MinStayRule,
  nights: ReadonlyArray<string>,
): boolean {
  for (const iso of nights) {
    if (rule.startsOn && iso < rule.startsOn) continue;
    if (rule.endsOn && iso > rule.endsOn) continue;
    if (rule.weekdayMask && rule.weekdayMask.length > 0) {
      const date = parseIsoDate(iso);
      if (!date) continue;
      if (!rule.weekdayMask.includes(isoWeekday(date))) continue;
    }
    return true;
  }
  return false;
}

export function resolveStopSell(
  date: string,
  channelKey: string,
  rules: ReadonlyArray<StopSellRule>,
): StopSellRule | null {
  for (const r of rules) {
    if (r.status !== "active") continue;
    if (date < r.startsOn || date > r.endsOn) continue;
    if (r.channelKey && r.channelKey !== channelKey) continue;
    return r;
  }
  return null;
}

// -----------------------------------------------------------------------------
// quoteNight
// -----------------------------------------------------------------------------

export type ExplanationStepType =
  | "base"
  | "day_of_week"
  | "occupancy"
  | "close_out"
  | "channel"
  | "manual_override"
  | "clamp"
  | "stop_sell";

export interface ExplanationStep {
  label: string;
  type: ExplanationStepType;
  amountDeltaMinor: bigint | null;
  percentDelta: number | null;
  beforeMinor: bigint;
  afterMinor: bigint;
}

export interface QuoteNightInput {
  date: string;
  today: string;
  channelKey: string;
  occupancy: number;
  bundle: RuleBundle;
  /** External availability blockers (booking, owner stay, maintenance, …). */
  manualBlock?: { reason: string } | null;
  /** Optional manual nightly override that wins over modifiers. */
  manualOverrideMinor?: bigint | null;
}

export interface QuoteNight {
  date: string;
  baseRateMinor: bigint;
  finalRateMinor: bigint;
  currency: string;
  available: boolean;
  unavailableReason: string | null;
  minLosApplied: number | null;
  explanationSteps: ExplanationStep[];
}

export function quoteNight(input: QuoteNightInput): QuoteNight {
  const date = parseIsoDate(input.date);
  const today = parseIsoDate(input.today) ?? new Date();
  const bundle = input.bundle;
  const baseRate = bundle.ruleSet.baseRateMinor;
  const explanation: ExplanationStep[] = [
    {
      label: `Base rate · ${bundle.ruleSet.name}`,
      type: "base",
      amountDeltaMinor: null,
      percentDelta: null,
      beforeMinor: baseRate,
      afterMinor: baseRate,
    },
  ];

  let current = baseRate;

  // Manual block / external availability block.
  if (input.manualBlock) {
    return {
      date: input.date,
      baseRateMinor: baseRate,
      finalRateMinor: baseRate,
      currency: bundle.ruleSet.currency,
      available: false,
      unavailableReason: input.manualBlock.reason,
      minLosApplied: null,
      explanationSteps: explanation,
    };
  }

  // Stop-sell short-circuit.
  const stop = resolveStopSell(
    input.date,
    input.channelKey,
    bundle.stopSell,
  );
  if (stop) {
    explanation.push({
      label: `Stop sell — ${stop.reason}`,
      type: "stop_sell",
      amountDeltaMinor: null,
      percentDelta: null,
      beforeMinor: current,
      afterMinor: current,
    });
    return {
      date: input.date,
      baseRateMinor: baseRate,
      finalRateMinor: current,
      currency: bundle.ruleSet.currency,
      available: false,
      unavailableReason: "stop_sell",
      minLosApplied: null,
      explanationSteps: explanation,
    };
  }

  // Manual override wins over modifiers.
  if (input.manualOverrideMinor != null) {
    explanation.push({
      label: "Manual override",
      type: "manual_override",
      amountDeltaMinor: input.manualOverrideMinor - current,
      percentDelta: null,
      beforeMinor: current,
      afterMinor: input.manualOverrideMinor,
    });
    current = input.manualOverrideMinor;
  } else {
    if (date) {
      const dow = resolveDayOfWeekRule(date, bundle.dayOfWeek);
      if (dow) {
        const before = current;
        const after = applyModifierMinor(current, dow);
        explanation.push({
          label: `Day of week · ${weekdayLabel(dow.weekday)}`,
          type: "day_of_week",
          amountDeltaMinor: after - before,
          percentDelta:
            dow.modifierType === "percent" && dow.modifierValueNumeric != null
              ? Number(dow.modifierValueNumeric)
              : null,
          beforeMinor: before,
          afterMinor: after,
        });
        current = after;
      }
    }

    const occ = resolveOccupancyRule(input.occupancy, bundle.occupancy);
    if (occ) {
      const before = current;
      const after = applyModifierMinor(current, occ);
      explanation.push({
        label: `Occupancy · ${occBandLabel(occ)}`,
        type: "occupancy",
        amountDeltaMinor: after - before,
        percentDelta:
          occ.modifierType === "percent" && occ.modifierValueNumeric != null
            ? Number(occ.modifierValueNumeric)
            : null,
        beforeMinor: before,
        afterMinor: after,
      });
      current = after;
    }

    if (date) {
      const close = resolveCloseOutRule(date, today, bundle.closeOut);
      if (close) {
        if (close.modifierType === "stop_sell") {
          explanation.push({
            label: `Close-out stop sell`,
            type: "stop_sell",
            amountDeltaMinor: null,
            percentDelta: null,
            beforeMinor: current,
            afterMinor: current,
          });
          return {
            date: input.date,
            baseRateMinor: baseRate,
            finalRateMinor: current,
            currency: bundle.ruleSet.currency,
            available: false,
            unavailableReason: "stop_sell",
            minLosApplied: close.minLos ?? null,
            explanationSteps: explanation,
          };
        }
        const before = current;
        // close.modifierType is `percent` | `fixed` here — `stop_sell`
        // was handled in the branch above.
        const after = applyModifierMinor(current, {
          modifierType: close.modifierType as "percent" | "fixed",
          modifierValueNumeric: close.modifierValueNumeric,
          modifierAmountMinor: close.modifierAmountMinor,
        });
        explanation.push({
          label: `Close-out · ${close.daysBeforeCheckinMin}–${close.daysBeforeCheckinMax}d`,
          type: "close_out",
          amountDeltaMinor: after - before,
          percentDelta:
            close.modifierType === "percent" &&
            close.modifierValueNumeric != null
              ? Number(close.modifierValueNumeric)
              : null,
          beforeMinor: before,
          afterMinor: after,
        });
        current = after;
      }
    }

    const ch = resolveChannelRule(input.channelKey, bundle.channels);
    if (ch) {
      const before = current;
      const after = applyModifierMinor(current, ch);
      explanation.push({
        label: `Channel · ${ch.channelKey}`,
        type: "channel",
        amountDeltaMinor: after - before,
        percentDelta:
          ch.modifierType === "percent" && ch.modifierValueNumeric != null
            ? Number(ch.modifierValueNumeric)
            : null,
        beforeMinor: before,
        afterMinor: after,
      });
      current = after;
    }
  }

  // Clamp.
  const clampOut = clampRateMinor(
    current,
    bundle.ruleSet.minRateMinor,
    bundle.ruleSet.maxRateMinor,
  );
  if (clampOut.clamped) {
    explanation.push({
      label: clampOut.clamped === "min" ? "Min-rate clamp" : "Max-rate clamp",
      type: "clamp",
      amountDeltaMinor: clampOut.value - current,
      percentDelta: null,
      beforeMinor: current,
      afterMinor: clampOut.value,
    });
    current = clampOut.value;
  }

  return {
    date: input.date,
    baseRateMinor: baseRate,
    finalRateMinor: current,
    currency: bundle.ruleSet.currency,
    available: true,
    unavailableReason: null,
    minLosApplied: null,
    explanationSteps: explanation,
  };
}

// -----------------------------------------------------------------------------
// quoteStay
// -----------------------------------------------------------------------------

export interface QuoteStayInput {
  checkIn: string;
  checkOut: string;
  today: string;
  channelKey: string;
  bundle: RuleBundle;
  occupancyByDate?: Record<string, number>;
  manualBlocksByDate?: Record<string, { reason: string }>;
  manualOverridesByDate?: Record<string, bigint | number>;
}

export type StayQuoteReason =
  | "ok"
  | "no_nights"
  | "stop_sell"
  | "min_los"
  | "unavailable";

export interface QuoteStay {
  available: boolean;
  reason: StayQuoteReason;
  checkIn: string;
  checkOut: string;
  nights: number;
  currency: string;
  totalMinor: bigint;
  averageNightlyMinor: bigint;
  requiredMinLos: number | null;
  minLosName: string | null;
  nightly: QuoteNight[];
  explanationSummary: string;
}

export function quoteStay(input: QuoteStayInput): QuoteStay {
  const nights = enumerateStayNights(input.checkIn, input.checkOut);
  if (nights.length === 0) {
    return {
      available: false,
      reason: "no_nights",
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      nights: 0,
      currency: input.bundle.ruleSet.currency,
      totalMinor: 0n,
      averageNightlyMinor: 0n,
      requiredMinLos: null,
      minLosName: null,
      nightly: [],
      explanationSummary: "Empty stay window.",
    };
  }
  const minStay = resolveMinStayRequirement(
    input.checkIn,
    input.checkOut,
    input.bundle.minStay,
  );
  if (nights.length < minStay.minLos) {
    return {
      available: false,
      reason: "min_los",
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      nights: nights.length,
      currency: input.bundle.ruleSet.currency,
      totalMinor: 0n,
      averageNightlyMinor: 0n,
      requiredMinLos: minStay.minLos,
      minLosName: minStay.name,
      nightly: [],
      explanationSummary: `Minimum stay ${minStay.minLos} nights${
        minStay.name ? ` (${minStay.name})` : ""
      }.`,
    };
  }

  const nightly: QuoteNight[] = [];
  let total = 0n;
  let stoppedOut = false;
  for (const date of nights) {
    const occ = input.occupancyByDate?.[date] ?? 0;
    const block = input.manualBlocksByDate?.[date] ?? null;
    const override = input.manualOverridesByDate?.[date];
    const nq = quoteNight({
      date,
      today: input.today,
      channelKey: input.channelKey,
      occupancy: occ,
      bundle: input.bundle,
      manualBlock: block,
      manualOverrideMinor: override != null ? asBigint(override) : null,
    });
    nightly.push(nq);
    if (!nq.available) {
      stoppedOut = stoppedOut || nq.unavailableReason === "stop_sell";
    }
    if (nq.available) total += nq.finalRateMinor;
  }
  const allAvailable = nightly.every((n) => n.available);
  if (!allAvailable) {
    return {
      available: false,
      reason: stoppedOut ? "stop_sell" : "unavailable",
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      nights: nights.length,
      currency: input.bundle.ruleSet.currency,
      totalMinor: total,
      averageNightlyMinor:
        nightly.length > 0 ? total / BigInt(nightly.length) : 0n,
      requiredMinLos: minStay.minLos,
      minLosName: minStay.name,
      nightly,
      explanationSummary: stoppedOut
        ? "One or more nights are stop-sold."
        : "One or more nights are unavailable.",
    };
  }
  return {
    available: true,
    reason: "ok",
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    nights: nights.length,
    currency: input.bundle.ruleSet.currency,
    totalMinor: total,
    averageNightlyMinor: total / BigInt(nightly.length),
    requiredMinLos: minStay.minLos,
    minLosName: minStay.name,
    nightly,
    explanationSummary: `${nights.length} nights · ${input.channelKey}`,
  };
}

// -----------------------------------------------------------------------------
// labels
// -----------------------------------------------------------------------------

function weekdayLabel(weekday: number): string {
  const labels = [
    "",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];
  return labels[weekday] ?? `Day ${weekday}`;
}

function occBandLabel(rule: { occupancyMin: number; occupancyMax: number }): string {
  return `${Math.round(Number(rule.occupancyMin) * 100)}–${Math.round(Number(rule.occupancyMax) * 100)}%`;
}
