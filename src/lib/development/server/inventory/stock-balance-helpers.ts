/**
 * Stage 4.C.1 — Pure stock balance helpers.
 *
 * No I/O, no `import "server-only"`. Runtime testable.
 *
 * `applyMovementToBalance` returns the *delta* per (item, location)
 * implied by a movement. Callers (the action layer) apply the delta
 * inside a Drizzle transaction and the DB CHECK constraint enforces
 * `quantity_on_hand >= 0` as a final guard against negative stock.
 */

export type InventoryMovementType =
  | "received"
  | "reserved"
  | "unreserved"
  | "issued_to_site"
  | "used"
  | "returned"
  | "damaged"
  | "lost"
  | "transferred"
  | "written_off"
  | "adjusted";

export interface BalanceDelta {
  /** Location whose balance is debited. NULL = no debit (e.g., received). */
  debitLocationId: string | null;
  /** Location whose balance is credited. NULL = no credit (e.g., used). */
  creditLocationId: string | null;
  /** Quantity always positive; debit subtracts, credit adds. */
  quantity: number;
  /** True when this movement also touches reserved bucket (reserved/unreserved). */
  affectsReserved: boolean;
  /** Sign of reserved change at the credit location (+1 or -1). */
  reservedDelta: number;
}

export function applyMovementToBalance(input: {
  movementType: InventoryMovementType;
  quantity: number;
  fromLocationId: string | null;
  toLocationId: string | null;
}): BalanceDelta {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error("inventory: quantity must be positive finite");
  }
  switch (input.movementType) {
    case "received":
      // From vendor → into a location. Credit only.
      if (!input.toLocationId) {
        throw new Error("received: toLocationId required");
      }
      return {
        debitLocationId: null,
        creditLocationId: input.toLocationId,
        quantity: input.quantity,
        affectsReserved: false,
        reservedDelta: 0,
      };
    case "reserved":
      // Soft hold against existing on_hand. No on_hand change; reserved += qty.
      if (!input.toLocationId) {
        throw new Error("reserved: toLocationId required");
      }
      return {
        debitLocationId: null,
        creditLocationId: input.toLocationId,
        quantity: 0, // no on_hand change
        affectsReserved: true,
        reservedDelta: +input.quantity,
      };
    case "unreserved":
      if (!input.toLocationId) {
        throw new Error("unreserved: toLocationId required");
      }
      return {
        debitLocationId: null,
        creditLocationId: input.toLocationId,
        quantity: 0,
        affectsReserved: true,
        reservedDelta: -input.quantity,
      };
    case "issued_to_site":
    case "transferred":
      // Source location debited, target location credited.
      if (!input.fromLocationId || !input.toLocationId) {
        throw new Error(
          `${input.movementType}: both from and to location required`,
        );
      }
      return {
        debitLocationId: input.fromLocationId,
        creditLocationId: input.toLocationId,
        quantity: input.quantity,
        affectsReserved: false,
        reservedDelta: 0,
      };
    case "used":
    case "damaged":
    case "lost":
    case "written_off":
      // Out of system entirely. Debit only.
      if (!input.fromLocationId) {
        throw new Error(`${input.movementType}: fromLocationId required`);
      }
      return {
        debitLocationId: input.fromLocationId,
        creditLocationId: null,
        quantity: input.quantity,
        affectsReserved: false,
        reservedDelta: 0,
      };
    case "returned":
      // From site/anywhere back to warehouse.
      if (!input.fromLocationId || !input.toLocationId) {
        throw new Error("returned: both locations required");
      }
      return {
        debitLocationId: input.fromLocationId,
        creditLocationId: input.toLocationId,
        quantity: input.quantity,
        affectsReserved: false,
        reservedDelta: 0,
      };
    case "adjusted":
      // Stocktake: caller computes the difference and posts a positive
      // adjustment (credit) at the target location. To debit, post with
      // fromLocationId set instead.
      if (input.toLocationId) {
        return {
          debitLocationId: null,
          creditLocationId: input.toLocationId,
          quantity: input.quantity,
          affectsReserved: false,
          reservedDelta: 0,
        };
      }
      if (input.fromLocationId) {
        return {
          debitLocationId: input.fromLocationId,
          creditLocationId: null,
          quantity: input.quantity,
          affectsReserved: false,
          reservedDelta: 0,
        };
      }
      throw new Error("adjusted: at least one location required");
    default: {
      const _never: never = input.movementType;
      throw new Error(`inventory: unknown movement type ${String(_never)}`);
    }
  }
}

/**
 * Project a sequence of movements onto a starting balance map. Returns
 * the final balance per (item, location). Used by tests + reconciliation
 * jobs to verify the denormalized balance matches the movement log.
 */
export function projectMovements(
  startingBalances: Map<string, number>,
  movements: Array<{
    itemId: string;
    movementType: InventoryMovementType;
    quantity: number;
    fromLocationId: string | null;
    toLocationId: string | null;
  }>,
): Map<string, number> {
  const balances = new Map(startingBalances);
  for (const m of movements) {
    const delta = applyMovementToBalance(m);
    if (delta.debitLocationId) {
      const key = `${m.itemId}:${delta.debitLocationId}`;
      const next = (balances.get(key) ?? 0) - delta.quantity;
      if (next < 0) {
        throw new Error(
          `projectMovements: would drive ${key} negative (${next})`,
        );
      }
      balances.set(key, next);
    }
    if (delta.creditLocationId && delta.quantity > 0) {
      const key = `${m.itemId}:${delta.creditLocationId}`;
      balances.set(key, (balances.get(key) ?? 0) + delta.quantity);
    }
  }
  return balances;
}
