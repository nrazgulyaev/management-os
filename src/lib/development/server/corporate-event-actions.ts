import "server-only";

import { sql } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { SUPPORTED_CURRENCIES } from "@/lib/development/constants/investor-constants";

const recordSchema = z.object({
  eventCode: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/),
  eventType: z.enum([
    "director_loan_in",
    "director_loan_repayment",
    "shareholder_contribution",
    "dividend_declared",
    "dividend_paid",
    "share_transfer",
    "other",
  ]),
  relatedContactId: z.string().uuid().optional().nullable(),
  amountCurrency: z.enum(SUPPORTED_CURRENCIES),
  amountOriginalMinor: z.union([z.bigint(), z.string(), z.number()]),
  fxRate: z.string().regex(/^\d+(\.\d+)?$/),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(1),
  relatedTransactionId: z.string().uuid().optional().nullable(),
  documentId: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const toBig = (v: bigint | string | number): bigint =>
  typeof v === "bigint"
    ? v
    : BigInt(typeof v === "number" ? Math.trunc(v) : v);

function computeUsdMinor(
  amount: bigint,
  currency: string,
  fx: number,
): bigint {
  const isUsdt = currency === "USDT";
  const sourceMajors = isUsdt ? Number(amount) / 1_000_000 : Number(amount) / 100;
  const usdMajors =
    currency === "USD" ? Number(amount) / 100 : sourceMajors / fx;
  return BigInt(Math.round(usdMajors * 100));
}

/**
 * Validates `director_loan_repayment` does not exceed prior `director_loan_in`
 * for the same contact.
 */
export async function recordCorporateEvent(
  input: z.input<typeof recordSchema>,
): Promise<{ id: string; eventCode: string }> {
  const parsed = recordSchema.parse(input);
  const db = requireDb();
  const organizationId = await requireOrgId();
  const amount = toBig(parsed.amountOriginalMinor);
  if (amount <= 0n) throw new Error("amountOriginalMinor must be > 0");
  const fx = Number(parsed.fxRate);
  if (!(fx > 0)) throw new Error("fxRate must be > 0");
  const usdAmount = computeUsdMinor(amount, parsed.amountCurrency, fx);

  if (
    parsed.eventType === "director_loan_repayment" &&
    parsed.relatedContactId
  ) {
    const [r] = await db.execute(sql`
      SELECT
        coalesce(sum(amount_usd_minor) FILTER (WHERE event_type='director_loan_in'), 0)::bigint
          AS loaned,
        coalesce(sum(amount_usd_minor) FILTER (WHERE event_type='director_loan_repayment'), 0)::bigint
          AS repaid
      FROM dev_corporate_events
      WHERE related_contact_id = ${parsed.relatedContactId}
        AND organization_id = ${organizationId}
    `);
    const r2 = (r ?? {}) as Record<string, unknown>;
    const loaned = BigInt(String(r2.loaned ?? "0"));
    const repaid = BigInt(String(r2.repaid ?? "0"));
    if (repaid + usdAmount > loaned) {
      throw new Error(
        `Repayment exceeds outstanding director loan: repaid=$${(Number(repaid) / 100).toFixed(2)}, this=$${(Number(usdAmount) / 100).toFixed(2)}, loaned=$${(Number(loaned) / 100).toFixed(2)}`,
      );
    }
  }

  // Stamp organization_id (NOT NULL, added by migration 0072 but not yet on
  // the Drizzle schema) on insert via raw SQL so the row is owned by the
  // caller's tenant. amount/usdAmount are bigint — cast to string for the
  // parameter binding.
  const inserted = await db.execute(sql`
    INSERT INTO dev_corporate_events (
      organization_id, event_code, event_type, related_contact_id,
      amount_usd_minor, amount_currency, amount_original_minor, fx_rate,
      event_date, description, related_transaction_id, document_id, notes
    ) VALUES (
      ${organizationId}, ${parsed.eventCode}, ${parsed.eventType},
      ${parsed.relatedContactId ?? null},
      ${usdAmount.toString()}, ${parsed.amountCurrency}, ${amount.toString()},
      ${parsed.fxRate}, ${parsed.eventDate}, ${parsed.description},
      ${parsed.relatedTransactionId ?? null}, ${parsed.documentId ?? null},
      ${parsed.notes ?? null}
    )
    RETURNING id, event_code AS "eventCode"
  `);
  const row = (inserted as Array<Record<string, unknown>>)[0];
  if (!row) throw new Error("Insert returned no row");
  return { id: String(row.id), eventCode: String(row.eventCode) };
}

const updateSchema = z.object({
  id: z.string().uuid(),
  eventType: z.enum([
    "director_loan_in",
    "director_loan_repayment",
    "shareholder_contribution",
    "dividend_declared",
    "dividend_paid",
    "share_transfer",
    "other",
  ]),
  relatedContactId: z.string().uuid().optional().nullable(),
  amountCurrency: z.enum(SUPPORTED_CURRENCIES),
  amountOriginalMinor: z.union([z.bigint(), z.string(), z.number()]),
  fxRate: z.string().regex(/^\d+(\.\d+)?$/),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(1),
  notes: z.string().optional().nullable(),
});

/**
 * Update an existing corporate event. Org-scoped via the row's
 * organization_id (added by migration 0072, raw because it is not yet on
 * the Drizzle schema) — a foreign id matches no row and updates nothing.
 * The event_code is immutable (it is the human reference); the editable
 * fields are re-validated + the USD amount recomputed from currency/fx.
 */
export async function updateCorporateEvent(
  input: z.input<typeof updateSchema>,
): Promise<{ id: string }> {
  const parsed = updateSchema.parse(input);
  const db = requireDb();
  const organizationId = await requireOrgId();
  const amount = toBig(parsed.amountOriginalMinor);
  if (amount <= 0n) throw new Error("amountOriginalMinor must be > 0");
  const fx = Number(parsed.fxRate);
  if (!(fx > 0)) throw new Error("fxRate must be > 0");
  const usdAmount = computeUsdMinor(amount, parsed.amountCurrency, fx);

  const updated = await db.execute(sql`
    UPDATE dev_corporate_events
       SET event_type = ${parsed.eventType},
           related_contact_id = ${parsed.relatedContactId ?? null},
           amount_usd_minor = ${usdAmount.toString()},
           amount_currency = ${parsed.amountCurrency},
           amount_original_minor = ${amount.toString()},
           fx_rate = ${parsed.fxRate},
           event_date = ${parsed.eventDate},
           description = ${parsed.description},
           notes = ${parsed.notes ?? null},
           updated_at = now()
     WHERE id = ${parsed.id}
       AND organization_id = ${organizationId}
    RETURNING id
  `);
  const row = (updated as Array<Record<string, unknown>>)[0];
  if (!row) throw new Error("Corporate event not found");
  return { id: String(row.id) };
}

/**
 * Delete a corporate event. Org-scoped (a foreign id deletes nothing).
 */
export async function deleteCorporateEvent(id: string): Promise<void> {
  const db = requireDb();
  const organizationId = await requireOrgId();
  const deleted = await db.execute(sql`
    DELETE FROM dev_corporate_events
     WHERE id = ${id}
       AND organization_id = ${organizationId}
    RETURNING id
  `);
  if ((deleted as Array<Record<string, unknown>>).length === 0) {
    throw new Error("Corporate event not found");
  }
}
