/**
 * Pure response-shaping helpers for the public `/api/v1/quote` endpoint.
 * NO `server-only` import — testable, deterministic.
 *
 * The public response intentionally hides:
 *   - rate plan IDs
 *   - season IDs
 *   - any internal references
 *   - any owner-stay / booking / guest data
 *
 * `nightly.source` is included for transparency (`override` / `season` /
 * `base`) but is a coarse label, not an internal identifier.
 */

import { z } from "zod";
import type { QuoteResult } from "./quote";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const publicQuoteInputSchema = z
  .object({
    villaId: z.string().uuid(),
    checkIn: date,
    checkOut: date,
  })
  .refine((d) => d.checkOut > d.checkIn, {
    message: "checkOut must be strictly after checkIn",
    path: ["checkOut"],
  });
export type PublicQuoteInput = z.infer<typeof publicQuoteInputSchema>;

export interface PublicNightlyEntry {
  date: string;
  amountMinor: string;
  amountFormatted: string;
  source: "override" | "season" | "base";
}

export interface PublicQuoteResponse {
  ok: boolean;
  available: boolean;
  currency: string;
  nights: number;
  grossAmountMinor: string;
  grossAmountFormatted: string;
  nightlyBreakdown: PublicNightlyEntry[];
  minLosRequired: number | null;
  warnings: string[];
  reason: string;
}

/**
 * Pure formatter for minor-unit money strings — `12345 → "123.45"`.
 * Two decimals always, no thousand separators, no currency symbol.
 * Currency symbol attaches at the call site.
 */
export function formatMinor(amountMinor: number): string {
  const sign = amountMinor < 0 ? "-" : "";
  const n = Math.abs(amountMinor);
  const major = Math.floor(n / 100);
  const minor = n % 100;
  return `${sign}${major}.${minor.toString().padStart(2, "0")}`;
}

/**
 * Convert a service-layer quote (`QuoteResult` + optional `'no_plan'`
 * reason) into the public response. The output is deterministic for
 * identical inputs.
 *
 * `min_los_violation` from the engine maps to `available=false` with a
 * `min_los_required` in the warnings list. (Documented behaviour: the
 * public endpoint is strict — a stay shorter than required is not
 * available; the API user can re-quote a longer range.)
 */
export function buildPublicQuoteResponse(
  source: { reason: QuoteResult["reason"] | "no_plan" } & Omit<
    QuoteResult,
    "reason"
  >,
): PublicQuoteResponse {
  if (source.reason === "no_plan") {
    return {
      ok: false,
      available: false,
      currency: source.currency,
      nights: 0,
      grossAmountMinor: "0",
      grossAmountFormatted: "0.00",
      nightlyBreakdown: [],
      minLosRequired: null,
      warnings: [],
      reason: "no_rate_plan",
    };
  }

  const breakdown: PublicNightlyEntry[] = source.breakdown.map((b) => ({
    date: b.date,
    amountMinor: String(b.nightlyRateMinor),
    amountFormatted: formatMinor(b.nightlyRateMinor),
    source: b.source,
  }));

  const warnings: string[] = [];
  if (source.minLosWarning && source.reason !== "min_los_violation") {
    warnings.push(`min_los ${source.minLosWarning} required for these dates`);
  }
  if (source.reason === "stop_sell") {
    return {
      ok: true,
      available: false,
      currency: source.currency,
      nights: source.nights,
      grossAmountMinor: String(source.grossAmountMinor),
      grossAmountFormatted: formatMinor(source.grossAmountMinor),
      nightlyBreakdown: breakdown,
      minLosRequired: source.minLosWarning ?? null,
      warnings,
      reason: "stop_sell",
    };
  }
  if (source.reason === "min_los_violation") {
    return {
      ok: true,
      available: false,
      currency: source.currency,
      nights: source.nights,
      grossAmountMinor: String(source.grossAmountMinor),
      grossAmountFormatted: formatMinor(source.grossAmountMinor),
      nightlyBreakdown: breakdown,
      minLosRequired: source.minLosWarning ?? null,
      warnings: [
        `min_los ${source.minLosWarning ?? "(unknown)"} required for these dates`,
      ],
      reason: "min_los_violation",
    };
  }
  if (source.reason === "no_nights") {
    return {
      ok: false,
      available: false,
      currency: source.currency,
      nights: 0,
      grossAmountMinor: "0",
      grossAmountFormatted: "0.00",
      nightlyBreakdown: [],
      minLosRequired: null,
      warnings: [],
      reason: "no_nights",
    };
  }

  return {
    ok: true,
    available: source.available,
    currency: source.currency,
    nights: source.nights,
    grossAmountMinor: String(source.grossAmountMinor),
    grossAmountFormatted: formatMinor(source.grossAmountMinor),
    nightlyBreakdown: breakdown,
    minLosRequired: source.minLosWarning ?? null,
    warnings,
    reason: "ok",
  };
}
