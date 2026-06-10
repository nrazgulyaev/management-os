/**
 * Shared document-category presentation metadata.
 *
 * The interactive Documents cabinet (`documents-app.tsx`) and the read-only
 * vault variants (`/dashboard/documents/folders`, `/dashboard/documents/timeline`)
 * all derive their folder names + glyphs from the document `documentType`.
 * Keeping the mapping here means the three surfaces never drift apart.
 *
 * Pure data — no DB, no `server-only` guard — so it can be imported from both
 * server pages and client components.
 */

export interface CategoryMeta {
  label: string;
  glyph: string;
  meta: string;
}

/** Display metadata per document type — drives the category cards + icons. */
export const CATEGORY_META: Record<string, CategoryMeta> = {
  contract: { label: "Contracts", glyph: "§", meta: "owner + vendor agreements" },
  invoice: { label: "Invoices", glyph: "$", meta: "vendor + service billing" },
  receipt: { label: "Receipts", glyph: "⊕", meta: "expenses + reimbursements" },
  statement: {
    label: "Statements archive",
    glyph: "∷",
    meta: "historical owner statements",
  },
  kyc: { label: "KYC", glyph: "⊠", meta: "identity + verification" },
  certificate: {
    label: "Permits & licences",
    glyph: "⌂",
    meta: "villa + zoning + tourism",
  },
  guide: { label: "Guides", glyph: "⌬", meta: "reusable boilerplate" },
  policy: {
    label: "Insurance & policy",
    glyph: "⚭",
    meta: "property + liability",
  },
  photo: {
    label: "Property records",
    glyph: "⊡",
    meta: "surveys · photos · plans",
  },
  other: { label: "Other documents", glyph: "○", meta: "uncategorised" },
};

/** Stable display order for the category folders / chips. */
export const CATEGORY_ORDER = [
  "contract",
  "invoice",
  "receipt",
  "statement",
  "kyc",
  "certificate",
  "guide",
  "policy",
  "photo",
  "other",
] as const;

/** Resolve the presentation metadata for a document type, with a fallback. */
export function metaFor(type: string): CategoryMeta {
  return (
    CATEGORY_META[type] ?? {
      label: type.charAt(0).toUpperCase() + type.slice(1),
      glyph: "○",
      meta: "documents",
    }
  );
}

/** Human label for an entity-type folder under a category. */
export function entityTypeLabel(entityType: string): string {
  if (!entityType) return "Unlinked";
  return entityType
    .split(/[_\s-]+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ""))
    .join(" ");
}
