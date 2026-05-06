/**
 * V9F — pure pricing helpers for the guest-services catalog.
 *
 * No DB, no money rounding — every value is BIGINT minor units of the
 * service's currency. The renderer is responsible for display conversion.
 */

export type PricingModel =
  | "fixed"
  | "per_person"
  | "per_day"
  | "per_hour"
  | "per_item"
  | "quote_required"
  | "free";

export interface PriceInputs {
  pricingModel: PricingModel;
  basePriceMinor: bigint;
  /** Optional internal cost on the catalog row. */
  internalCostMinor?: bigint | null;
  /** Optional option deltas. */
  optionPriceDeltaMinor?: bigint | null;
  optionInternalCostDeltaMinor?: bigint | null;
  /** Defaults to 1. */
  quantity?: number;
  /** Required for `per_person` pricing. */
  guestCount?: number | null;
  /** Required for `per_hour` pricing. */
  hours?: number | null;
}

export interface PriceResult {
  pricingModel: PricingModel;
  /** What the guest will see / be charged. */
  guestPriceMinor: bigint;
  /** The platform's internal cost — never exposed to guests. */
  internalCostMinor: bigint | null;
  /** `guest - internal`. Null if internal cost is unset. */
  marginMinor: bigint | null;
  /** True for `quote_required` — no auto price. */
  quoteRequired: boolean;
}

function bigOr(value: bigint | null | undefined, fallback: bigint): bigint {
  return value === null || value === undefined ? fallback : value;
}

/**
 * Pure: compute guest price + internal cost + margin for a guest service
 * order based on its pricing model + selected option + quantity / counts.
 *
 * Rules:
 *  - `fixed`     → base × quantity
 *  - `per_item`  → base × quantity
 *  - `per_person`→ base × guestCount × quantity
 *  - `per_day`   → base × quantity (quantity is days)
 *  - `per_hour`  → base × hours × quantity
 *  - `free`      → 0
 *  - `quote_required` → 0 (and `quoteRequired: true` flag)
 *
 * Option deltas are added per-unit (i.e. multiplied by the same multiplier
 * as the base price), so a $5/person upcharge for a 3-person breakfast is
 * applied 3×.
 */
export function priceGuestService(input: PriceInputs): PriceResult {
  const quantity = Math.max(1, Math.floor(input.quantity ?? 1));
  const optionDelta = bigOr(input.optionPriceDeltaMinor, 0n);
  const optionInternalDelta = bigOr(
    input.optionInternalCostDeltaMinor,
    0n,
  );

  const baseGuest = input.basePriceMinor + optionDelta;
  const haveInternal =
    input.internalCostMinor !== undefined &&
    input.internalCostMinor !== null;
  const baseInternal = haveInternal
    ? (input.internalCostMinor as bigint) + optionInternalDelta
    : null;

  let multiplier = BigInt(quantity);
  let quoteRequired = false;
  let isFree = false;

  switch (input.pricingModel) {
    case "fixed":
    case "per_item":
    case "per_day":
      // multiplier = quantity
      break;
    case "per_person": {
      const gc = Math.max(1, Math.floor(input.guestCount ?? 0));
      multiplier = BigInt(gc) * BigInt(quantity);
      break;
    }
    case "per_hour": {
      const h = Math.max(1, Math.floor(input.hours ?? 0));
      multiplier = BigInt(h) * BigInt(quantity);
      break;
    }
    case "free":
      isFree = true;
      break;
    case "quote_required":
      quoteRequired = true;
      break;
  }

  if (quoteRequired || isFree) {
    return {
      pricingModel: input.pricingModel,
      guestPriceMinor: 0n,
      internalCostMinor: baseInternal !== null ? 0n : null,
      marginMinor: baseInternal !== null ? 0n : null,
      quoteRequired,
    };
  }

  const guest = baseGuest * multiplier;
  const internal = baseInternal !== null ? baseInternal * multiplier : null;
  const margin = internal !== null ? guest - internal : null;

  return {
    pricingModel: input.pricingModel,
    guestPriceMinor: guest,
    internalCostMinor: internal,
    marginMinor: margin,
    quoteRequired: false,
  };
}

/**
 * Pure: format minor units to a guest-friendly string. We avoid Intl in
 * the pure helper because it varies by environment — the renderer can
 * upgrade to Intl downstream.
 */
export function formatMinorMoney(
  minor: bigint | number,
  currency: string,
): string {
  const n = typeof minor === "bigint" ? minor : BigInt(minor);
  const isNegative = n < 0n;
  const abs = isNegative ? -n : n;
  const major = abs / 100n;
  const cents = abs % 100n;
  const padded = cents.toString().padStart(2, "0");
  const sign = isNegative ? "-" : "";
  return `${sign}${currency} ${major}.${padded}`;
}

/**
 * Pure: short label for a pricing model — used in catalog cards + admin lists.
 */
export function describePricingModel(model: PricingModel): string {
  switch (model) {
    case "fixed":
      return "Per request";
    case "per_person":
      return "Per person";
    case "per_day":
      return "Per day";
    case "per_hour":
      return "Per hour";
    case "per_item":
      return "Per item";
    case "free":
      return "Complimentary";
    case "quote_required":
      return "On request";
  }
}
