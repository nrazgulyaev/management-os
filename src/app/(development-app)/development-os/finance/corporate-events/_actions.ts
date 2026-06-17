"use server";

/**
 * Corporate-events form surface — `"use server"` adapters for the client
 * `_controls.tsx` island. The create/update/delete logic lives in the
 * `server-only` `corporate-event-actions.ts` (org-scoped + director-loan
 * validation + USD recompute). A `"use client"` component cannot import a
 * `server-only` module, so these thin RPC wrappers parse FormData, call
 * through, and revalidate the corporate-events page.
 *
 * Money is entered in MAJOR units of the chosen currency on the form and
 * converted to minor units here (USDT = 6 decimals, everything else = 2).
 * Tenancy is enforced inside the underlying actions (requireOrgId) — no
 * client-supplied organizationId is ever passed.
 */

import { revalidatePath } from "next/cache";
import { requireInternalUser } from "@/features/auth/permissions";
import {
  deleteCorporateEvent,
  recordCorporateEvent,
  updateCorporateEvent,
} from "@/lib/development/server/corporate-event-actions";

export type CorporateEventResult = { ok: true } | { ok: false; error: string };

const fail = (error: string): CorporateEventResult => ({ ok: false, error });

const EVENT_TYPES = [
  "director_loan_in",
  "director_loan_repayment",
  "shareholder_contribution",
  "dividend_declared",
  "dividend_paid",
  "share_transfer",
  "other",
] as const;

function minorFromMajor(amountMajor: number, currency: string): bigint {
  const divisor = currency === "USDT" ? 1_000_000 : 100;
  return BigInt(Math.round(amountMajor * divisor));
}

function parseCommon(formData: FormData):
  | {
      ok: true;
      data: {
        eventType: (typeof EVENT_TYPES)[number];
        relatedContactId: string | null;
        amountCurrency: string;
        amountOriginalMinor: bigint;
        fxRate: string;
        eventDate: string;
        description: string;
        notes: string | null;
      };
    }
  | { ok: false; error: string } {
  const eventType = String(formData.get("eventType") ?? "");
  if (!(EVENT_TYPES as readonly string[]).includes(eventType)) {
    return { ok: false, error: "Pick an event type." };
  }
  const amountCurrency = String(formData.get("amountCurrency") ?? "USD");
  const amountMajor = Number(formData.get("amountMajor"));
  if (!Number.isFinite(amountMajor) || amountMajor <= 0) {
    return { ok: false, error: "Amount must be greater than zero." };
  }
  const fxRateRaw = String(formData.get("fxRate") ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(fxRateRaw) || Number(fxRateRaw) <= 0) {
    return { ok: false, error: "FX rate must be a positive number." };
  }
  const eventDate = String(formData.get("eventDate") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    return { ok: false, error: "Event date must be a valid date." };
  }
  const description = String(formData.get("description") ?? "").trim();
  if (description.length < 1) {
    return { ok: false, error: "A description is required." };
  }
  const relatedContactId =
    String(formData.get("relatedContactId") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  return {
    ok: true,
    data: {
      eventType: eventType as (typeof EVENT_TYPES)[number],
      relatedContactId,
      amountCurrency,
      amountOriginalMinor: minorFromMajor(amountMajor, amountCurrency),
      fxRate: fxRateRaw,
      eventDate,
      description,
      notes,
    },
  };
}

export async function createCorporateEventAction(
  formData: FormData,
): Promise<CorporateEventResult> {
  try {
    await requireInternalUser();
    const eventCode = String(formData.get("eventCode") ?? "").trim();
    if (!/^[A-Za-z0-9_-]+$/.test(eventCode)) {
      return fail("Event code must be alphanumeric (dashes/underscores ok).");
    }
    const parsed = parseCommon(formData);
    if (!parsed.ok) return fail(parsed.error);

    await recordCorporateEvent({
      eventCode,
      eventType: parsed.data.eventType,
      relatedContactId: parsed.data.relatedContactId,
      amountCurrency: parsed.data.amountCurrency as never,
      amountOriginalMinor: parsed.data.amountOriginalMinor,
      fxRate: parsed.data.fxRate,
      eventDate: parsed.data.eventDate,
      description: parsed.data.description,
      notes: parsed.data.notes,
    });
    revalidatePath("/development-os/finance/corporate-events");
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Could not record event.");
  }
}

export async function updateCorporateEventAction(
  formData: FormData,
): Promise<CorporateEventResult> {
  try {
    await requireInternalUser();
    const id = String(formData.get("id") ?? "").trim();
    if (!id) return fail("Missing event id.");
    const parsed = parseCommon(formData);
    if (!parsed.ok) return fail(parsed.error);

    await updateCorporateEvent({
      id,
      eventType: parsed.data.eventType,
      relatedContactId: parsed.data.relatedContactId,
      amountCurrency: parsed.data.amountCurrency as never,
      amountOriginalMinor: parsed.data.amountOriginalMinor,
      fxRate: parsed.data.fxRate,
      eventDate: parsed.data.eventDate,
      description: parsed.data.description,
      notes: parsed.data.notes,
    });
    revalidatePath("/development-os/finance/corporate-events");
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Could not update event.");
  }
}

export async function deleteCorporateEventAction(
  formData: FormData,
): Promise<CorporateEventResult> {
  try {
    await requireInternalUser();
    const id = String(formData.get("id") ?? "").trim();
    if (!id) return fail("Missing event id.");
    await deleteCorporateEvent(id);
    revalidatePath("/development-os/finance/corporate-events");
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Could not delete event.");
  }
}
