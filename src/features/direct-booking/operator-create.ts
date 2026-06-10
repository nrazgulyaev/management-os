"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { villas } from "@/lib/db/schema/projects";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { quoteDynamicStay, createQuoteLog } from "@/features/dynamic-pricing/services";
import { buildHoldSnapshotFromQuote, canCreateHold } from "./hold-pure";
import {
  defaultHoldExpiry,
  generateHoldToken,
  hashHoldToken,
  holdTokenPrefix,
} from "./token";
import {
  appendRequestEvent,
  insertHold,
  insertRequest,
  upsertGuestByEmail,
} from "./services";
import {
  assertHoldDatesStillAvailable,
  createInternalHoldBlockForDirectHold,
} from "./availability";
import { notifyRequestSubmitted } from "./notifications";
import { syncGuestStatusForChain } from "./guest-status-lifecycle";
import { operatorCreateHoldSchema } from "./schema";
import type { ActionResult } from "@/features/projects/actions";

/**
 * Operator creates a direct-booking hold ON BEHALF of a guest.
 *
 * This is the staff-side counterpart to the public, token-driven,
 * IP-rate-limited `handleCreateHold`. It is org-scoped (`requireOrgId`),
 * permission-gated (`direct_booking.write`), audit-logged, and writes a
 * REAL hold (+ calendar block) + optional submitted request. Manual
 * settlement only — no PSP. Money stays in bigint minor units.
 */
export async function createDirectBookingOnBehalfAction(
  _prev: (ActionResult & { holdId?: string }) | null,
  formData: FormData,
): Promise<ActionResult & { holdId?: string }> {
  await requirePermission("direct_booking.write");

  const raw = {
    villaId: formData.get("villaId"),
    checkIn: formData.get("checkIn"),
    checkOut: formData.get("checkOut"),
    guestCount: formData.get("guestCount"),
    guestFirstName: formData.get("guestFirstName") || undefined,
    guestLastName: formData.get("guestLastName") || undefined,
    guestEmail: formData.get("guestEmail") || undefined,
    guestPhone: formData.get("guestPhone") || undefined,
    guestCountry: formData.get("guestCountry") || undefined,
    specialRequests: formData.get("specialRequests") || undefined,
    arrivalTime: formData.get("arrivalTime") || undefined,
    purposeOfStay: formData.get("purposeOfStay") || undefined,
  };
  const parsed = operatorCreateHoldSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]?.toString() ?? "_";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
      fieldErrors,
    };
  }
  const data = parsed.data;

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();

  // Villa lookup — also the ownership guard: the villa's project must
  // belong to the caller's org (no cross-tenant hold creation).
  const [villa] = await db
    .select({
      projectId: villas.projectId,
      name: villas.name,
      code: villas.unitCode,
    })
    .from(villas)
    .where(eq(villas.id, data.villaId))
    .limit(1);
  if (!villa) return { ok: false, error: "Villa not found." };

  // Quote the stay via the dynamic-pricing engine (public quote rules —
  // direct channel, no member pricing).
  let quoteResult;
  try {
    quoteResult = await quoteDynamicStay({
      villaId: data.villaId,
      checkIn: data.checkIn,
      checkOut: data.checkOut,
      channelKey: "direct",
      publicQuote: true,
    });
  } catch {
    return { ok: false, error: "Could not price this stay." };
  }
  if (!quoteResult.ruleSet) {
    return {
      ok: false,
      error: "No pricing engine is configured for this villa.",
    };
  }
  const stay = quoteResult.stay;
  const guard = canCreateHold({
    available: stay.available,
    reason: stay.reason,
    totalMinor: stay.totalMinor,
    averageNightlyMinor: stay.averageNightlyMinor,
    nights: stay.nights,
    currency: stay.currency,
    channelKey: "direct",
    nightly: stay.nightly.map((n) => ({
      date: n.date,
      rateMinor: n.finalRateMinor,
      available: n.available,
    })),
  });
  if (!guard.ok) {
    return {
      ok: false,
      error:
        guard.reason === "stop_sell"
          ? "These dates are stop-sold."
          : guard.reason === "min_los"
            ? "Stay is below the minimum length."
            : "These dates are not available.",
    };
  }

  // Race guard — re-check availability against bookings + blocks.
  const avail = await assertHoldDatesStillAvailable(
    data.villaId,
    data.checkIn,
    data.checkOut,
  );
  if (!avail.available) {
    return {
      ok: false,
      error: "Those dates were taken while you were filling this in.",
    };
  }

  // Tokens + codes (operator holds use the same shape as public holds so
  // the guest can still receive a stay link).
  const rawToken = generateHoldToken();
  const tokenHash = hashHoldToken(rawToken);
  const tokenPrefix = holdTokenPrefix(rawToken);
  const expiresAt = defaultHoldExpiry(15);
  const holdCode = `HLD-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;

  const quoteLogId = await createQuoteLog({
    villaId: data.villaId,
    projectId: villa.projectId,
    channelKey: "direct",
    checkIn: data.checkIn,
    checkOut: data.checkOut,
    nights: stay.nights,
    available: stay.available,
    reason: stay.reason,
    totalMinor: stay.totalMinor,
    currency: stay.currency,
    publicQuote: false,
    ruleSetId: quoteResult.ruleSet.id,
  }).catch(() => null);

  const snapshot = buildHoldSnapshotFromQuote({
    available: stay.available,
    reason: stay.reason,
    totalMinor: stay.totalMinor,
    averageNightlyMinor: stay.averageNightlyMinor,
    nights: stay.nights,
    currency: stay.currency,
    channelKey: "direct",
    ruleSetId: quoteResult.ruleSet.id,
    nightly: stay.nightly.map((n) => ({
      date: n.date,
      rateMinor: n.finalRateMinor,
      available: n.available,
    })),
  });

  const hold = await insertHold({
    organizationId,
    holdCode,
    holdTokenHash: tokenHash,
    tokenPrefix,
    villaId: data.villaId,
    projectId: villa.projectId,
    quoteLogId: quoteLogId ?? null,
    checkIn: data.checkIn,
    checkOut: data.checkOut,
    nights: stay.nights,
    guestCount: data.guestCount,
    channelKey: "direct",
    currency: stay.currency,
    totalMinor: stay.totalMinor,
    averageNightlyMinor: stay.averageNightlyMinor,
    quoteSnapshotJson: snapshot,
    status: "active",
    expiresAt,
  });
  if (!hold) return { ok: false, error: "Could not create the hold." };

  await createInternalHoldBlockForDirectHold(hold.id, me?.id ?? null);

  // Optional guest capture → open a submitted request in the same step.
  let requestCode: string | null = null;
  const captureGuest = Boolean(data.guestFirstName && data.guestEmail);
  if (captureGuest) {
    const guestEmail = (data.guestEmail as string).trim().toLowerCase();
    const guestId = await upsertGuestByEmail({
      email: guestEmail,
      fullName: [data.guestFirstName, data.guestLastName ?? ""]
        .filter(Boolean)
        .join(" ")
        .trim(),
      phone: data.guestPhone ?? null,
      nationality: data.guestCountry ?? null,
    });
    requestCode = `DBR-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`;
    const request = await insertRequest({
      organizationId,
      requestCode,
      holdId: hold.id,
      villaId: hold.villaId,
      projectId: hold.projectId,
      guestId,
      guestFirstName: data.guestFirstName as string,
      guestLastName: data.guestLastName ?? null,
      guestEmail,
      guestPhone: data.guestPhone ?? null,
      guestCountry: data.guestCountry ?? null,
      guestCount: data.guestCount,
      specialRequests: data.specialRequests ?? null,
      arrivalTime: data.arrivalTime ?? null,
      purposeOfStay: data.purposeOfStay ?? null,
      // Operator captured + accepted terms on the guest's behalf.
      marketingConsent: false,
      termsAccepted: true,
      status: "submitted",
    });
    if (request) {
      await appendRequestEvent({
        requestId: request.id,
        eventType: "request_submitted",
        actorType: "internal",
        actorUserId: me?.id ?? null,
        message: "Created on behalf of guest by operator",
      });
      await notifyRequestSubmitted({
        requestId: request.id,
        requestCode,
        villaCode: villa.code,
      });
      await syncGuestStatusForChain({
        holdId: hold.id,
        requestId: request.id,
        token: rawToken,
      });
    }
  } else {
    await syncGuestStatusForChain({ holdId: hold.id, token: rawToken });
  }

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "direct_booking.hold.create_on_behalf",
    entityType: "direct_booking_hold",
    entityId: hold.id,
    after: {
      holdCode,
      villaId: data.villaId,
      checkIn: data.checkIn,
      checkOut: data.checkOut,
      nights: stay.nights,
      totalMinor: stay.totalMinor.toString(),
      currency: stay.currency,
      guestCaptured: captureGuest,
      requestCode,
    },
  });

  revalidatePath("/dashboard/direct-bookings");
  revalidatePath("/dashboard/direct-bookings/holds");
  revalidatePath(`/dashboard/direct-bookings/${hold.id}`);
  return { ok: true, holdId: hold.id };
}
