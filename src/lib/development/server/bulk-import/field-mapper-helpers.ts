/**
 * Stage 6.P0.7 — Pure field-mapping helpers.
 *
 * No I/O, no `import "server-only"`. Runtime testable.
 *
 * The wizard collects a mapping like:
 *   { "Email Address": "email", "Full Name": "fullName" }
 *
 * `applyMapping(row, mapping)` projects an external row through the
 * mapping into an internal-shape object. Unmapped external columns are
 * dropped; required internal fields without a mapping become undefined
 * (validators will surface that).
 *
 * Optional transforms per field: trim / lowercase / uppercase. The
 * wizard exposes these as a small dropdown alongside each mapped field.
 */

export type FieldTransform = "none" | "trim" | "lowercase" | "uppercase";

export interface FieldMappingEntry {
  internalField: string;
  transform?: FieldTransform;
  defaultValue?: string;
}

/**
 * Mapping is keyed by EXTERNAL column name (the CSV/XLSX header).
 * Value carries the internal field name + optional transform/default.
 */
export type FieldMapping = Record<string, FieldMappingEntry>;

const TRANSFORMS: Record<FieldTransform, (v: string) => string> = {
  none: (v) => v,
  trim: (v) => v.trim(),
  lowercase: (v) => v.toLowerCase(),
  uppercase: (v) => v.toUpperCase(),
};

/**
 * Project a single external row through the mapping into an
 * internal-shape record. Missing external columns fall back to the
 * mapping entry's defaultValue (or undefined).
 */
export function applyMapping(
  row: Record<string, string>,
  mapping: FieldMapping,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [externalCol, entry] of Object.entries(mapping)) {
    const raw = row[externalCol];
    if (raw === undefined || raw === "") {
      out[entry.internalField] = entry.defaultValue;
      continue;
    }
    const transformer = TRANSFORMS[entry.transform ?? "none"];
    out[entry.internalField] = transformer(raw);
  }
  return out;
}

/**
 * Auto-suggest a mapping by header-name matching. Useful so the wizard
 * pre-fills the mapping form with reasonable defaults that the user
 * only needs to correct, not author from scratch.
 *
 * Matching strategy (in priority order):
 *   1. Exact match (case-insensitive)
 *   2. snake_case ↔ camelCase ↔ "Title Case" fuzz
 *   3. Substring match
 *
 * Internal field list is supplied by the caller (per-entity).
 */
export function autoSuggestMapping(
  externalHeaders: string[],
  internalFields: string[],
): FieldMapping {
  const suggested: FieldMapping = {};

  function normalize(s: string): string {
    return s
      .toLowerCase()
      .replace(/[\s_-]+/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  const internalLookup = new Map(
    internalFields.map((f) => [normalize(f), f]),
  );

  for (const ext of externalHeaders) {
    const normExt = normalize(ext);

    // 1. Exact normalized match
    let match = internalLookup.get(normExt);

    // 2. Substring (external contains internal, or vice versa)
    if (!match) {
      for (const f of internalFields) {
        const normF = normalize(f);
        if (normExt.includes(normF) || normF.includes(normExt)) {
          match = f;
          break;
        }
      }
    }

    if (match) {
      suggested[ext] = { internalField: match };
    }
  }

  return suggested;
}

/**
 * Internal field directory per entity type. Drives the mapping UI's
 * dropdown of available targets and the auto-suggest matcher.
 *
 * Kept here (not in each entity's action file) so the mapping logic
 * is one consistent surface; the action file's Zod schema remains the
 * authoritative validator.
 */
export const INTERNAL_FIELDS_PER_ENTITY: Record<string, string[]> = {
  transactions: [
    "bankAccountId",
    "direction",
    "amountMinor",
    "currency",
    "description",
    "transactionDate",
    "categoryId",
    "projectId",
    "counterpartyName",
    "externalReference",
    "fxRateAtTransaction",
    "notes",
  ],
  contacts: [
    "fullName",
    "email",
    "phone",
    "whatsapp",
    "preferredLanguage",
    "notes",
  ],
  vendors: [
    "vendorCode",
    "legalName",
    "vendorType",
    "primaryEmail",
    "primaryPhone",
    "address",
    "taxId",
    "bankName",
    "bankAccountNumber",
    "notes",
  ],
  buyers: [
    "displayName",
    "primaryEmail",
    "primaryPhone",
    "whatsappPhone",
    "preferredLanguage",
    "kycStatus",
    "internalNotes",
  ],
  investors: [
    "investorCode",
    "investorType",
    "legalName",
    "legalEntityType",
    "taxResidency",
    "primaryCurrency",
    "reportingLanguage",
    "contactEmail",
    "contactPhone",
    "notes",
  ],
  materials: [
    "poCode",
    "projectId",
    "vendorId",
    "orderDate",
    "expectedDeliveryDate",
    "totalAmountCurrency",
    "fxRateAtOrder",
    "materialName",
    "unitOfMeasure",
    "quantityOrdered",
    "unitPriceMajor",
    "notes",
  ],
  inventory_items: [
    "itemCode",
    "displayName",
    "category",
    "unitOfMeasure",
    "reorderLevel",
    "notes",
  ],
  site_reports: [
    "projectId",
    "reportDate",
    "weatherConditions",
    "totalWorkersPresent",
    "summary",
    "reporterRole",
    "sourceChannel",
    "notes",
  ],
  qa_qc_issues: [
    "title",
    "description",
    "category",
    "severity",
    "projectId",
    "villaId",
    "assignedTo",
  ],
  leads: [
    "fullName",
    "email",
    "phone",
    "preferredLanguage",
    "preferredCommunicationChannel",
    "projectId",
    "sourceId",
    "agentId",
    "initialMessage",
    "notes",
  ],
  reservations: [
    "contactId",
    "villaId",
    "projectId",
    "reservationFeeUsdMinor",
    "fxRateUsdToIdr",
    "paymentMethod",
    "paymentReference",
    "expiresInDays",
    "notes",
  ],
  invoices: [
    "invoiceCode",
    "invoiceType",
    "vendorId",
    "buyerId",
    "issueDate",
    "dueDate",
    "subtotalMinor",
    "totalMinor",
    "currency",
    "notes",
  ],
  tasks: [
    "title",
    "description",
    "projectId",
    "assignedTo",
    "priority",
    "dueDate",
    "estimatedHours",
  ],
};
