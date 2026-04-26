/**
 * Pure stock-movement maths. Shared by services + tests.
 *
 * Quantities flow as Decimal-as-string from postgres (`numeric` column).
 * We do all maths in `number` after parseFloat for now — operational item
 * counts comfortably fit IEEE-754 precision. If we ever need sub-cent
 * fractions of pool chemicals to four decimals at scale, swap to a Big.js.
 */

export type MovementType =
  | "receive"
  | "consume"
  | "transfer"
  | "adjust"
  | "damage"
  | "write_off"
  | "return_to_supplier"
  | "count_correction";

export interface StockDelta {
  /** Quantity change at the from-location (negative = decrease). */
  fromDelta: number;
  /** Quantity change at the to-location (positive = increase). */
  toDelta: number;
}

/**
 * Map a movement type + quantity to per-location deltas. The rules:
 *
 * - receive            → +qty at to_location
 * - consume            → -qty at from_location
 * - transfer           → -qty at from_location, +qty at to_location
 * - adjust             → +qty at to_location (signed; caller picks sign)
 * - count_correction   → +qty at to_location (signed; caller picks sign)
 * - damage / write_off → -qty at from_location
 * - return_to_supplier → -qty at from_location
 *
 * `quantity` must be > 0 for the un-signed cases; for `adjust` /
 * `count_correction` callers may pass a negative number.
 */
export function deltasFor(type: MovementType, quantity: number): StockDelta {
  switch (type) {
    case "receive":
      return { fromDelta: 0, toDelta: quantity };
    case "consume":
    case "damage":
    case "write_off":
    case "return_to_supplier":
      return { fromDelta: -quantity, toDelta: 0 };
    case "transfer":
      return { fromDelta: -quantity, toDelta: quantity };
    case "adjust":
    case "count_correction":
      // Signed delta lives at the to_location to keep one column doing the
      // updating in services.ts.
      return { fromDelta: 0, toDelta: quantity };
  }
}

/**
 * Validate the location combination + quantity for a movement before
 * touching the database. Returns an error string or null.
 */
export function validateMovementShape(input: {
  type: MovementType;
  quantity: number;
  fromLocationId: string | null | undefined;
  toLocationId: string | null | undefined;
}): string | null {
  const { type, quantity, fromLocationId, toLocationId } = input;
  if (!Number.isFinite(quantity)) return "quantity is not a number";

  const signed = type === "adjust" || type === "count_correction";
  if (!signed && quantity <= 0) return "quantity must be > 0";
  if (signed && quantity === 0) return "adjustment must be non-zero";

  switch (type) {
    case "receive":
      if (!toLocationId) return "receive requires to_location";
      return null;
    case "consume":
    case "damage":
    case "write_off":
    case "return_to_supplier":
      if (!fromLocationId) return `${type} requires from_location`;
      return null;
    case "transfer":
      if (!fromLocationId || !toLocationId)
        return "transfer requires both from_location and to_location";
      if (fromLocationId === toLocationId)
        return "transfer needs different from/to locations";
      return null;
    case "adjust":
    case "count_correction":
      if (!toLocationId) return `${type} requires to_location`;
      return null;
  }
}

/**
 * Will applying this delta drop stock below zero (when negative inventory
 * is not allowed)? Pure helper used by services before touching the DB.
 */
export function wouldGoNegative(
  currentFromQty: number,
  delta: StockDelta,
  allowNegative: boolean,
): boolean {
  if (allowNegative) return false;
  if (delta.fromDelta >= 0) return false;
  return currentFromQty + delta.fromDelta < 0;
}

/** Rough numeric parse of postgres numeric/text values. */
export function asNumber(v: string | number | null | undefined, fallback = 0): number {
  if (v === null || v === undefined) return fallback;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

export function isLowStock(quantity: number, reorderPoint: number | null | undefined): boolean {
  if (reorderPoint === null || reorderPoint === undefined) return false;
  return quantity <= reorderPoint;
}
