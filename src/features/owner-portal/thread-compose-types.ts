/**
 * Client-safe types + constants for the owner inbox compose flow.
 *
 * Kept separate from thread-compose-actions.ts because that file is
 * "use server" and may export ONLY async functions. The category
 * values below are a subset of OwnerThreadKind (owner-threads schema)
 * so the inbox's existing kind → badge mapping renders them unchanged.
 */

export type OwnerActionState = { ok: boolean; error?: string };

/** Owner-pickable thread categories (subset of OwnerThreadKind). */
export const COMPOSE_CATEGORY_VALUES = [
  "general",
  "dispute",
  "personal_stay_request",
  "maintenance_question",
  "tax_question",
] as const;

export type OwnerComposeCategory = (typeof COMPOSE_CATEGORY_VALUES)[number];

export interface ComposeCategoryOption {
  value: OwnerComposeCategory;
  label: string;
}

/** Owner-facing labels for the category <select>. */
export const COMPOSE_CATEGORY_OPTIONS: ComposeCategoryOption[] = [
  { value: "general", label: "General question" },
  { value: "dispute", label: "Statement question" },
  { value: "personal_stay_request", label: "Personal stay request" },
  { value: "maintenance_question", label: "Maintenance / villa" },
  { value: "tax_question", label: "Tax / review" },
];
