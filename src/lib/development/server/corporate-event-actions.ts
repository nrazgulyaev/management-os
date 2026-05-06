import "server-only";

import { sql } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { devCorporateEvents } from "@/lib/db/schema/dev-finance";
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

  const [row] = await db
    .insert(devCorporateEvents)
    .values({
      eventCode: parsed.eventCode,
      eventType: parsed.eventType,
      relatedContactId: parsed.relatedContactId ?? null,
      amountUsdMinor: usdAmount,
      amountCurrency: parsed.amountCurrency,
      amountOriginalMinor: amount,
      fxRate: parsed.fxRate,
      eventDate: parsed.eventDate,
      description: parsed.description,
      relatedTransactionId: parsed.relatedTransactionId ?? null,
      documentId: parsed.documentId ?? null,
      notes: parsed.notes ?? null,
    })
    .returning({
      id: devCorporateEvents.id,
      eventCode: devCorporateEvents.eventCode,
    });
  return row;
}
