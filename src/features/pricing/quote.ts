/**
 * Pure rate-quote engine. NO `server-only` import — the DB-aware loader
 * lives in `services.ts` and passes the rate plan + seasons + overrides
 * into this module.
 *
 * Rules (v9B):
 *   - `checkOut` is exclusive. Stay nights = `[checkIn, checkOut)`.
 *   - Back-to-back is fine.
 *   - For each stay date, resolution order is:
 *       1. override(stay_date) — wins if present.
 *       2. season(stay_date)    — earliest matching active season.
 *       3. base nightly rate.
 *   - `stop_sell` on ANY night → quote returns `available=false` with
 *     `reason='stop_sell'`. We still compute the breakdown so admins can
 *     see WHY.
 *   - `min_los` is collected as a warning when the candidate stay is
 *     shorter than any matching min_los; the quote stays `available=true`
 *     unless something else stops it.
 *   - Currency comes from the rate plan; we don't FX-convert here.
 *   - Output is deterministic for identical inputs (no Date.now, no
 *     Math.random).
 */

export interface RatePlanLike {
  id: string;
  baseCurrency: string;
  baseNightlyRateMinor: number;
  managementFeePercent: string | number | null | undefined;
}

export interface RatePlanSeasonLike {
  id: string;
  startsOn: string; // YYYY-MM-DD inclusive
  endsOn: string; // YYYY-MM-DD inclusive
  multiplier: string | number;
  nightlyRateMinor: number | null;
  minLos: number | null;
  maxLos: number | null;
  stopSell: boolean;
  status: string;
}

export interface RatePlanOverrideLike {
  stayDate: string; // YYYY-MM-DD
  nightlyRateMinor: number | null;
  minLos: number | null;
  stopSell: boolean;
}

export interface QuoteNight {
  date: string;
  nightlyRateMinor: number;
  source: "override" | "season" | "base";
  seasonId: string | null;
  stopSell: boolean;
  minLos: number | null;
}

export interface QuoteResult {
  available: boolean;
  reason: "ok" | "stop_sell" | "no_nights" | "min_los_violation";
  currency: string;
  nights: number;
  grossAmountMinor: number;
  breakdown: QuoteNight[];
  /** Highest min_los flagged by any matching season/override. The caller
   *  can decide to fail the quote if `nights < minLosWarning`. */
  minLosWarning: number | null;
  /** Set when reason === 'min_los_violation'. */
  requiredMinLos?: number;
}

/**
 * Iterate `[checkIn, checkOut)` returning each YYYY-MM-DD. Pure.
 */
export function enumerateNights(checkIn: string, checkOut: string): string[] {
  const start = new Date(`${checkIn}T00:00:00.000Z`);
  const end = new Date(`${checkOut}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  if (end.getTime() <= start.getTime()) return [];
  const out: string[] = [];
  // Walk by 24h increments using UTC math — DST-safe.
  for (
    let cursor = start.getTime();
    cursor < end.getTime();
    cursor += 24 * 60 * 60 * 1000
  ) {
    out.push(new Date(cursor).toISOString().slice(0, 10));
  }
  return out;
}

function dateInRange(date: string, startsOn: string, endsOn: string): boolean {
  // All comparisons are lexicographic on YYYY-MM-DD; correct for ISO dates.
  return date >= startsOn && date <= endsOn;
}

function findActiveSeasonFor(
  date: string,
  seasons: RatePlanSeasonLike[],
): RatePlanSeasonLike | null {
  // Earliest-starting matching active season wins. Iterate in caller-
  // provided order; the service layer sorts by `starts_on` ASC.
  for (const s of seasons) {
    if (s.status !== "active") continue;
    if (dateInRange(date, s.startsOn, s.endsOn)) return s;
  }
  return null;
}

function nightlyForSeason(
  base: number,
  season: RatePlanSeasonLike,
): number {
  if (season.nightlyRateMinor != null) return season.nightlyRateMinor;
  const m = Number(season.multiplier);
  if (!Number.isFinite(m)) return base;
  return Math.round(base * m);
}

/**
 * Pure quote — see module header for rules.
 */
export function quoteForRangePure(input: {
  ratePlan: RatePlanLike;
  seasons: RatePlanSeasonLike[];
  overrides: RatePlanOverrideLike[];
  checkIn: string;
  checkOut: string;
}): QuoteResult {
  const { ratePlan, seasons, overrides, checkIn, checkOut } = input;
  const nights = enumerateNights(checkIn, checkOut);
  if (nights.length === 0) {
    return {
      available: false,
      reason: "no_nights",
      currency: ratePlan.baseCurrency,
      nights: 0,
      grossAmountMinor: 0,
      breakdown: [],
      minLosWarning: null,
    };
  }

  // Index overrides by stay_date for O(1) lookup.
  const overrideByDate = new Map<string, RatePlanOverrideLike>();
  for (const o of overrides) overrideByDate.set(o.stayDate, o);

  let stopSell = false;
  let minLosCeiling: number | null = null;
  let gross = 0;
  const breakdown: QuoteNight[] = [];

  for (const date of nights) {
    const ov = overrideByDate.get(date);
    if (ov) {
      const nightly =
        ov.nightlyRateMinor != null
          ? ov.nightlyRateMinor
          : ratePlan.baseNightlyRateMinor;
      gross += nightly;
      breakdown.push({
        date,
        nightlyRateMinor: nightly,
        source: "override",
        seasonId: null,
        stopSell: ov.stopSell,
        minLos: ov.minLos ?? null,
      });
      if (ov.stopSell) stopSell = true;
      if (ov.minLos != null && (minLosCeiling == null || ov.minLos > minLosCeiling)) {
        minLosCeiling = ov.minLos;
      }
      continue;
    }

    const season = findActiveSeasonFor(date, seasons);
    if (season) {
      const nightly = nightlyForSeason(
        ratePlan.baseNightlyRateMinor,
        season,
      );
      gross += nightly;
      breakdown.push({
        date,
        nightlyRateMinor: nightly,
        source: "season",
        seasonId: season.id,
        stopSell: season.stopSell,
        minLos: season.minLos ?? null,
      });
      if (season.stopSell) stopSell = true;
      if (
        season.minLos != null &&
        (minLosCeiling == null || season.minLos > minLosCeiling)
      ) {
        minLosCeiling = season.minLos;
      }
      continue;
    }

    gross += ratePlan.baseNightlyRateMinor;
    breakdown.push({
      date,
      nightlyRateMinor: ratePlan.baseNightlyRateMinor,
      source: "base",
      seasonId: null,
      stopSell: false,
      minLos: null,
    });
  }

  if (stopSell) {
    return {
      available: false,
      reason: "stop_sell",
      currency: ratePlan.baseCurrency,
      nights: nights.length,
      grossAmountMinor: gross,
      breakdown,
      minLosWarning: minLosCeiling,
    };
  }

  if (minLosCeiling != null && nights.length < minLosCeiling) {
    return {
      available: false,
      reason: "min_los_violation",
      currency: ratePlan.baseCurrency,
      nights: nights.length,
      grossAmountMinor: gross,
      breakdown,
      minLosWarning: minLosCeiling,
      requiredMinLos: minLosCeiling,
    };
  }

  return {
    available: true,
    reason: "ok",
    currency: ratePlan.baseCurrency,
    nights: nights.length,
    grossAmountMinor: gross,
    breakdown,
    minLosWarning: minLosCeiling,
  };
}

/**
 * Pure: management compensation on an expected gross amount, given a
 * percentage. Rounding is "banker"-like via Math.round to keep the
 * minor-unit math stable.
 */
export function calculateManagementCompensationPure(
  expectedGrossMinor: number,
  percent: number | string | null | undefined,
): number {
  const p = typeof percent === "number" ? percent : Number(percent ?? NaN);
  if (!Number.isFinite(p) || p <= 0) return 0;
  if (p > 100) return Math.round(expectedGrossMinor); // clamp safety
  return Math.round((expectedGrossMinor * p) / 100);
}
