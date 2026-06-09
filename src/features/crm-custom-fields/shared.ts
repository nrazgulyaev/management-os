import "server-only";

import {
  CRM_FIELD_TYPES,
  CRM_SUBJECT_TYPES,
  type CrmFieldType,
  type CrmSubjectType,
} from "@/lib/db/schema/crm-custom-fields";

/**
 * CRM-CUSTOM-FIELDS-TAGS — pure (sync) helpers, constants and view types.
 *
 * Deliberately NOT a "use server" module: BUILD-SAFETY (PR #168) forbids
 * exporting sync helpers / consts / types from a "use server" file. The
 * server actions in ./actions.ts import everything load-bearing from here.
 */

export { CRM_FIELD_TYPES, CRM_SUBJECT_TYPES };
export type { CrmFieldType, CrmSubjectType };

/** Tag chip tones — must map to a Badge `tone` (Layer-B token). */
export const CRM_TAG_COLORS = [
  "neutral",
  "accent",
  "gold",
  "success",
  "warning",
  "danger",
  "info",
] as const;
export type CrmTagColor = (typeof CRM_TAG_COLORS)[number];

export interface TagView {
  id: string;
  label: string;
  slug: string;
  color: CrmTagColor;
  description: string | null;
}

export interface CustomFieldView {
  defId: string;
  key: string;
  label: string;
  fieldType: CrmFieldType;
  options: string[] | null;
  helpText: string | null;
  displayOrder: number;
  /** Coerced display value (already a string), or null when unset. */
  value: string | null;
}

/** Slugify a tag label for case-insensitive uniqueness within an org. */
export function slugifyTag(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Snake-case a custom-field label into a stable machine key. */
export function keyifyField(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/** Narrow a Badge tone — only allow the known token set. */
export function toTagColor(raw: string | null | undefined): CrmTagColor {
  return (CRM_TAG_COLORS as readonly string[]).includes(raw ?? "")
    ? (raw as CrmTagColor)
    : "neutral";
}

/**
 * Coerce a stored jsonb custom-field value into a display string per its
 * field type. Returns null when the value is unset/blank.
 */
export function coerceFieldValue(
  fieldType: CrmFieldType,
  raw: unknown,
): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  switch (fieldType) {
    case "number": {
      const n = typeof raw === "number" ? raw : Number(raw);
      return Number.isFinite(n) ? String(n) : null;
    }
    case "date":
    case "select":
    case "text":
    default:
      return String(raw);
  }
}

/**
 * Normalise + validate a raw form value against a field type before write.
 * Throws on an invalid number/date/select so the action surfaces a clean
 * error. Returns the jsonb-storable value (string | number) or null to clear.
 */
export function normaliseFieldValue(
  fieldType: CrmFieldType,
  raw: string | null | undefined,
  options: string[] | null,
): string | number | null {
  const v = (raw ?? "").trim();
  if (v === "") return null;
  switch (fieldType) {
    case "number": {
      const n = Number(v);
      if (!Number.isFinite(n)) throw new Error(`"${raw}" is not a number.`);
      return n;
    }
    case "date": {
      // Expect ISO YYYY-MM-DD from a date input.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v))
        throw new Error(`"${raw}" is not a valid date (YYYY-MM-DD).`);
      return v;
    }
    case "select": {
      if (options && options.length > 0 && !options.includes(v))
        throw new Error(`"${raw}" is not an allowed option.`);
      return v;
    }
    case "text":
    default:
      return v;
  }
}

export function isSubjectType(raw: string): raw is CrmSubjectType {
  return (CRM_SUBJECT_TYPES as readonly string[]).includes(raw);
}

export function isFieldType(raw: string): raw is CrmFieldType {
  return (CRM_FIELD_TYPES as readonly string[]).includes(raw);
}
