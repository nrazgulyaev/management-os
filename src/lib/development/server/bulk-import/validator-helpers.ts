/**
 * Stage 6.P0.7 — Pure row validators.
 *
 * No I/O, no `import "server-only"`. Runtime testable.
 *
 * Per-entity Zod schemas tuned for IMPORT use: more permissive than
 * the action's own create-schema (e.g. accept "yes"/"true"/"1" as
 * boolean; coerce numeric strings) because import data is messy by
 * nature. Required fields mirror the action's Zod requirements.
 *
 * The validator runs against ONE row at a time (the projection of an
 * external row through the field mapping). Returns `{ ok, value, errors }`
 * so the wizard's preview step can highlight which rows + which fields
 * are bad before the bookkeeper commits.
 */

import { z } from "zod";

export interface RowValidationResult {
  ok: boolean;
  /** When ok=true, the parsed/coerced value */
  value?: Record<string, unknown>;
  /** When ok=false, per-field error messages */
  errors?: Array<{ field: string; message: string }>;
}

// ----- shared field utils
const optionalStr = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (v && String(v).trim() ? String(v).trim() : undefined));
const optionalEmail = z
  .union([z.string().email(), z.literal(""), z.null(), z.undefined()])
  .transform((v) => (v && String(v).trim() ? String(v).trim() : undefined));
const optionalPhone = optionalStr;
const optionalNumber = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === null || v === undefined || v === "") return undefined;
    const n = typeof v === "number" ? v : Number(v);
    return isFinite(n) ? n : undefined;
  });
const optionalDate = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (v && String(v).trim() ? String(v).trim() : undefined))
  .refine((v) => v === undefined || /^\d{4}-\d{2}-\d{2}$/.test(v), {
    message: "Date must be YYYY-MM-DD",
  });
const requiredDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");
const requiredStr = z
  .string()
  .min(1, "Required");

// ----- per-entity import schemas

const transactionsImportSchema = z.object({
  bankAccountId: z.string().uuid("Invalid UUID"),
  direction: z.enum(["inflow", "outflow", "internal_transfer"]),
  amountMinor: z
    .union([z.string(), z.number()])
    .transform((v) => {
      const n = typeof v === "number" ? v : Number(v);
      if (!isFinite(n) || n <= 0) {
        throw new Error("Amount must be a positive number");
      }
      // Convert major→minor if it looks like a major value (decimal point)
      // Safer: assume the import provides minor; document in template.
      return BigInt(Math.round(n));
    }),
  currency: z.enum(["USD", "IDR", "RUB", "EUR", "USDT", "CNY"]),
  description: requiredStr,
  transactionDate: requiredDate,
  categoryId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  counterpartyName: optionalStr,
  externalReference: optionalStr,
  fxRateAtTransaction: z
    .string()
    .regex(/^\d+(\.\d+)?$/, "FX rate must be numeric")
    .default("1.0"),
  notes: optionalStr,
});

const contactsImportSchema = z
  .object({
    fullName: requiredStr,
    email: optionalEmail,
    phone: optionalPhone,
    whatsapp: optionalPhone,
    preferredLanguage: optionalStr,
    notes: optionalStr,
  })
  .refine((d) => d.email || d.phone, {
    message: "Either email or phone is required",
    path: ["email"],
  });

const vendorsImportSchema = z.object({
  vendorCode: requiredStr.regex(/^[A-Za-z0-9_-]+$/, "Alphanumeric only"),
  legalName: requiredStr,
  vendorType: z.enum([
    "contractor",
    "subcontractor",
    "supplier",
    "consultant",
    "professional_service",
    "government_body",
    "utility",
    "other",
  ]),
  primaryEmail: optionalEmail,
  primaryPhone: optionalPhone,
  address: optionalStr,
  taxId: optionalStr,
  bankName: optionalStr,
  bankAccountNumber: optionalStr,
  notes: optionalStr,
});

const buyersImportSchema = z.object({
  displayName: requiredStr,
  primaryEmail: optionalEmail,
  primaryPhone: optionalPhone,
  whatsappPhone: optionalPhone,
  preferredLanguage: z.string().default("en"),
  kycStatus: z
    .enum([
      "not_started",
      "documents_requested",
      "in_review",
      "approved",
      "rejected",
      "expired",
    ])
    .default("not_started"),
  internalNotes: optionalStr,
});

const investorsImportSchema = z.object({
  investorCode: requiredStr.regex(/^[A-Za-z0-9_-]+$/),
  investorType: z.enum(["gp", "lp_private", "lp_institutional", "landowner_jv"]),
  legalName: requiredStr,
  legalEntityType: optionalStr,
  taxResidency: optionalStr,
  primaryCurrency: z
    .enum(["USD", "IDR", "RUB", "EUR", "USDT", "CNY"])
    .default("USD"),
  reportingLanguage: z.enum(["en", "ru", "id", "zh"]).default("en"),
  contactEmail: optionalEmail,
  contactPhone: optionalPhone,
  notes: optionalStr,
});

const leadsImportSchema = z
  .object({
    fullName: requiredStr,
    email: optionalEmail,
    phone: optionalPhone,
    preferredLanguage: z.string().default("en"),
    preferredCommunicationChannel: z
      .enum(["email", "whatsapp", "phone", "in_person"])
      .optional(),
    projectId: z.string().uuid().optional(),
    sourceId: z.string().uuid().optional(),
    agentId: z.string().uuid().optional(),
    initialMessage: optionalStr,
    notes: optionalStr,
  })
  .refine((d) => d.email || d.phone, {
    message: "Either email or phone is required",
    path: ["email"],
  });

const siteReportsImportSchema = z.object({
  projectId: z.string().uuid(),
  reportDate: requiredDate,
  weatherConditions: optionalStr,
  totalWorkersPresent: optionalNumber.transform((v) => v ?? 0),
  summary: optionalStr,
  reporterRole: optionalStr,
  sourceChannel: z
    .enum(["web", "whatsapp", "telegram", "email", "manual"])
    .default("web"),
  notes: optionalStr,
});

const tasksImportSchema = z.object({
  title: requiredStr,
  description: optionalStr,
  projectId: z.string().uuid(),
  assignedTo: z.string().uuid().optional(),
  priority: z
    .enum(["low", "normal", "high", "urgent"])
    .default("normal"),
  dueDate: optionalDate,
  estimatedHours: optionalNumber,
});

// Catch-all permissive validator for entity types where we haven't yet
// ironed out a strict import shape. Treats every field as optional
// string. The downstream action's own Zod still rejects invalid rows.
const passthroughImportSchema = z
  .record(z.string(), z.union([z.string(), z.number(), z.null(), z.undefined()]))
  .transform((row) => {
    const out: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(row)) {
      if (v === null || v === undefined || v === "") continue;
      out[k] = String(v);
    }
    return out;
  });

const SCHEMAS: Record<string, z.ZodSchema> = {
  transactions: transactionsImportSchema,
  contacts: contactsImportSchema,
  vendors: vendorsImportSchema,
  buyers: buyersImportSchema,
  investors: investorsImportSchema,
  leads: leadsImportSchema,
  site_reports: siteReportsImportSchema,
  tasks: tasksImportSchema,
  // Reasonable passthrough for the rest in P0.7; tighten in later iterations.
  materials: passthroughImportSchema,
  inventory_items: passthroughImportSchema,
  qa_qc_issues: passthroughImportSchema,
  reservations: passthroughImportSchema,
  invoices: passthroughImportSchema,
};

/**
 * Validate one row's projected (mapped) record against the entity's
 * import schema. Returns a structured result so the wizard can render
 * per-row error chips without throwing.
 */
export function validateRow(
  entityType: string,
  row: Record<string, string | undefined>,
): RowValidationResult {
  const schema = SCHEMAS[entityType];
  if (!schema) {
    return {
      ok: false,
      errors: [{ field: "_entity", message: `Unknown entity type: ${entityType}` }],
    };
  }
  const result = schema.safeParse(row);
  if (result.success) {
    return { ok: true, value: result.data as Record<string, unknown> };
  }
  return {
    ok: false,
    errors: result.error.issues.map((i) => ({
      field: i.path.join(".") || "_root",
      message: i.message,
    })),
  };
}

/**
 * Convenience: validate a batch of rows. Used by the preview step
 * (10-row sample) and the cron processor (1000-row batch).
 */
export function validateBatch(
  entityType: string,
  rows: Array<Record<string, string | undefined>>,
): {
  ok: boolean;
  validRows: Array<Record<string, unknown>>;
  errors: Array<{ rowIndex: number; field: string; message: string }>;
} {
  const validRows: Array<Record<string, unknown>> = [];
  const errors: Array<{ rowIndex: number; field: string; message: string }> = [];
  for (let i = 0; i < rows.length; i++) {
    const r = validateRow(entityType, rows[i]);
    if (r.ok && r.value) {
      validRows.push(r.value);
    } else if (r.errors) {
      for (const e of r.errors) {
        errors.push({ rowIndex: i, field: e.field, message: e.message });
      }
    }
  }
  return { ok: errors.length === 0, validRows, errors };
}

export const SUPPORTED_IMPORT_ENTITIES = Object.keys(SCHEMAS);
