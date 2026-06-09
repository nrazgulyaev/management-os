/**
 * Pure constants for the Stage 2.4 material tracking. No server imports.
 */

export const MATERIAL_PO_STATUSES = [
  "draft",
  "ordered",
  "partially_delivered",
  "fully_delivered",
  "cancelled",
] as const;
export type MaterialPoStatus = (typeof MATERIAL_PO_STATUSES)[number];

export const MATERIAL_PO_STATUS_LABEL: Record<MaterialPoStatus, string> = {
  draft: "Draft",
  ordered: "Ordered",
  partially_delivered: "Partially delivered",
  fully_delivered: "Fully delivered",
  cancelled: "Cancelled",
};

/**
 * PO money lifecycle (migration 0125) — distinct from the delivery
 * `status` above. MANUAL mark-paid only (PSP / Indonesia rails deferred).
 */
export const MATERIAL_PO_PAYMENT_STATUSES = [
  "unpaid",
  "partially_paid",
  "paid",
] as const;
export type MaterialPoPaymentStatus =
  (typeof MATERIAL_PO_PAYMENT_STATUSES)[number];

export const MATERIAL_PO_PAYMENT_STATUS_LABEL: Record<
  MaterialPoPaymentStatus,
  string
> = {
  unpaid: "Unpaid",
  partially_paid: "Partially paid",
  paid: "Paid",
};

export function materialPoPaymentStatusTone(
  status: string,
): "neutral" | "warning" | "success" {
  if (status === "paid") return "success";
  if (status === "partially_paid") return "warning";
  return "neutral";
}

export const MATERIAL_QUALITY_STATUSES = [
  "pending",
  "accepted",
  "partial_acceptance",
  "rejected",
] as const;
export type MaterialQualityStatus = (typeof MATERIAL_QUALITY_STATUSES)[number];

export const MATERIAL_QUALITY_LABEL: Record<MaterialQualityStatus, string> = {
  pending: "Pending check",
  accepted: "Accepted",
  partial_acceptance: "Partial acceptance",
  rejected: "Rejected",
};

/**
 * Common material categories for the construction taxonomy. The DB
 * column is plain TEXT (no CHECK), so this list is advisory — any
 * string is allowed, but the UI surfaces these as suggestions.
 */
export const COMMON_MATERIAL_CATEGORIES = [
  "cement",
  "steel",
  "rebar",
  "concrete_admixture",
  "sand",
  "gravel",
  "tiles",
  "stone",
  "wood",
  "paint",
  "plaster",
  "glass",
  "ironmongery",
  "plumbing",
  "electrical",
  "hvac",
  "doors",
  "windows",
  "fixtures",
  "landscaping_plants",
  "other",
] as const;

export const COMMON_UNITS_OF_MEASURE = [
  "kg",
  "ton",
  "m",
  "m2",
  "m3",
  "pcs",
  "set",
  "sheet",
  "liter",
  "bag",
  "roll",
  "box",
] as const;
