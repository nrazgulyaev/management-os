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
