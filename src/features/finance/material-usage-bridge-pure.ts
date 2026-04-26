/**
 * Pure helpers for the material-usage → finance bridge. Lives outside the
 * `server-only` services file so tests can import without pulling in DB
 * dependencies.
 */

export type BridgeStatus =
  | "pending"
  | "created"
  | "skipped_locked_period"
  | "skipped_not_chargeable"
  | "failed"
  | "reversed";

export interface BridgeAttemptInput {
  ownerChargeableUsage: boolean;
  ownerChargeableItem: boolean;
  unitCostMinor: bigint | null;
  quantity: number;
  currency: string | null;
}

export interface BridgeAmountResult {
  amountMinor: bigint;
  currency: string;
}

/**
 * Compute amount_minor = round(quantity × unit_cost_minor). Returns null
 * when we don't have enough information to bill.
 */
export function computeBridgeAmount(input: BridgeAttemptInput): BridgeAmountResult | null {
  if (input.unitCostMinor === null) return null;
  if (!input.currency) return null;
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) return null;
  const amount = BigInt(Math.round(input.quantity * Number(input.unitCostMinor)));
  return { amountMinor: amount, currency: input.currency };
}

/**
 * Map an inventory item type / category to a finance expense_type.
 * Deterministic so the audit trail is predictable.
 */
export function mapItemToExpenseType(
  itemType: string | null,
  categoryKey: string | null,
): string {
  if (categoryKey === "linens" || itemType === "linen") return "linen_replacement";
  if (categoryKey === "towels" || itemType === "towel") return "linen_replacement";
  if (categoryKey === "toiletries" || itemType === "amenity") return "toiletries";
  if (
    categoryKey === "cleaning_chems" ||
    categoryKey === "pool_chems" ||
    itemType === "chemical"
  )
    return "consumables";
  if (categoryKey === "spare_parts" || categoryKey === "electrical") return "spare_part";
  if (itemType === "spare_part" || itemType === "tool" || itemType === "equipment")
    return "spare_part";
  return "maintenance";
}
