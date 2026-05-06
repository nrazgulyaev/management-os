"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { directBookingRequests } from "@/lib/db/schema/direct-booking";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { queueNotification } from "@/features/notifications/services";
import {
  appendDepositEvent,
  ensureDepositForRequest,
  getDepositById,
  getDepositForRequest,
  patchDepositStatus,
} from "./deposits";
import { syncGuestStatusForChain } from "./guest-status-lifecycle";
import { selectPaymentProvider } from "@/features/payments/provider-selector";
import type { ActionResult } from "@/features/projects/actions";

const depositIdSchema = z.object({ id: z.string().uuid() });
const requestIdSchema = z.object({ requestId: z.string().uuid() });

// =============================================================================
// Create / recreate session
// =============================================================================

export async function createOrRecreateDepositSessionAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("direct_booking.deposit.write");
  const parsed = requestIdSchema.safeParse({
    requestId: formData.get("requestId"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const [request] = await db
    .select()
    .from(directBookingRequests)
    .where(eq(directBookingRequests.id, parsed.data.requestId))
    .limit(1);
  if (!request) return { ok: false, error: "Request not found." };
  // Cancel any outstanding deposit first so we recreate cleanly.
  const existing = await getDepositForRequest(request.id);
  if (
    existing &&
    existing.status !== "paid" &&
    existing.status !== "manually_marked_paid" &&
    existing.status !== "refunded"
  ) {
    await patchDepositStatus(existing.id, "cancelled", {
      cancelledAt: new Date(),
    });
    await appendDepositEvent({
      depositId: existing.id,
      eventType: "cancelled",
      actorType: "internal",
      actorUserId: me?.id ?? null,
      message: "Cancelled to recreate session",
    });
  }
  const totalMinorRaw = formData.get("totalMinor");
  const currency = (formData.get("currency") as string | null) ?? "USD";
  const totalMinor = totalMinorRaw ? BigInt(String(totalMinorRaw)) : 0n;
  const out = await ensureDepositForRequest({
    holdId: request.holdId,
    requestId: request.id,
    totalMinor,
    currency,
    createdBy: me?.id ?? null,
  });
  if (!out) {
    return { ok: false, error: "Could not create session." };
  }
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "direct_booking.deposit.session.create",
    entityType: "direct_booking_deposit",
    entityId: out.deposit.id,
    after: { recreated: !!existing, providerKey: out.deposit.providerKey },
  });
  revalidatePath(`/dashboard/direct-bookings/requests/${request.id}`);
  revalidatePath(
    `/dashboard/direct-bookings/deposits/${out.deposit.id}`,
  );
  return { ok: true };
}

// =============================================================================
// Manually mark paid
// =============================================================================

export async function markDepositManuallyPaidAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("direct_booking.deposit.mark_paid");
  const parsed = depositIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const me = await getCurrentAppUser();
  const deposit = await getDepositById(parsed.data.id);
  if (!deposit) return { ok: false, error: "Deposit not found." };
  if (
    deposit.status === "paid" ||
    deposit.status === "manually_marked_paid"
  ) {
    return { ok: true };
  }
  const updated = await patchDepositStatus(
    deposit.id,
    "manually_marked_paid",
    {
      paidAt: new Date(),
    },
  );
  if (!updated) return { ok: false, error: "Update failed." };
  await appendDepositEvent({
    depositId: deposit.id,
    eventType: "manually_marked_paid",
    actorType: "internal",
    actorUserId: me?.id ?? null,
    message: "Marked paid by admin",
  });
  await queueNotification({
    recipientType: "role",
    channel: "in_app",
    templateKey: "direct_booking.deposit_marked_paid",
    title: "Deposit marked paid",
    body: `Deposit ${deposit.depositCode} marked paid manually.`,
    dedupeKey: `deposit-marked-paid:${deposit.id}`,
    payload: { depositId: deposit.id, role: "booking_manager" }, priority: "normal",
  });
  await syncGuestStatusForChain({ depositId: deposit.id });
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "direct_booking.deposit.mark_paid",
    entityType: "direct_booking_deposit",
    entityId: deposit.id,
  });
  revalidatePath(`/dashboard/direct-bookings/deposits/${deposit.id}`);
  if (deposit.requestId) {
    revalidatePath(`/dashboard/direct-bookings/requests/${deposit.requestId}`);
  }
  return { ok: true };
}

// =============================================================================
// Mark failed / cancel
// =============================================================================

export async function markDepositFailedAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("direct_booking.deposit.write");
  const parsed = depositIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const me = await getCurrentAppUser();
  const reason = (formData.get("reason") as string | null) ?? null;
  const deposit = await getDepositById(parsed.data.id);
  if (!deposit) return { ok: false, error: "Deposit not found." };
  if (
    deposit.status === "paid" ||
    deposit.status === "manually_marked_paid"
  ) {
    return { ok: false, error: "Deposit already paid." };
  }
  await patchDepositStatus(deposit.id, "failed", { failedAt: new Date() });
  await appendDepositEvent({
    depositId: deposit.id,
    eventType: "provider_failed",
    actorType: "internal",
    actorUserId: me?.id ?? null,
    message: reason,
  });
  await queueNotification({
    recipientType: "role",
    channel: "in_app",
    templateKey: "direct_booking.deposit_failed",
    title: "Deposit failed",
    body: `Deposit ${deposit.depositCode} failed.`,
    dedupeKey: `deposit-failed:${deposit.id}`,
    payload: { depositId: deposit.id, role: "finance_manager" }, priority: "normal",
  });
  await syncGuestStatusForChain({ depositId: deposit.id });
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "direct_booking.deposit.fail",
    entityType: "direct_booking_deposit",
    entityId: deposit.id,
    after: { reason },
  });
  revalidatePath(`/dashboard/direct-bookings/deposits/${deposit.id}`);
  return { ok: true };
}

export async function cancelDepositAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("direct_booking.deposit.write");
  const parsed = depositIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const me = await getCurrentAppUser();
  const deposit = await getDepositById(parsed.data.id);
  if (!deposit) return { ok: false, error: "Deposit not found." };
  if (
    deposit.status === "paid" ||
    deposit.status === "manually_marked_paid"
  ) {
    return { ok: false, error: "Cannot cancel a paid deposit." };
  }
  // Best-effort cancellation upstream.
  try {
    const provider = selectPaymentProvider(
      deposit.providerKey as Parameters<typeof selectPaymentProvider>[0],
    );
    await provider.cancelSession({
      depositId: deposit.id,
      providerSessionId: deposit.providerSessionId,
    });
  } catch {
    /* ignore */
  }
  await patchDepositStatus(deposit.id, "cancelled", {
    cancelledAt: new Date(),
  });
  await appendDepositEvent({
    depositId: deposit.id,
    eventType: "cancelled",
    actorType: "internal",
    actorUserId: me?.id ?? null,
  });
  await syncGuestStatusForChain({ depositId: deposit.id });
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "direct_booking.deposit.cancel",
    entityType: "direct_booking_deposit",
    entityId: deposit.id,
  });
  revalidatePath(`/dashboard/direct-bookings/deposits/${deposit.id}`);
  return { ok: true };
}

// =============================================================================
// Refund placeholder
// =============================================================================

export async function refundDepositPlaceholderAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("direct_booking.deposit.refund");
  const parsed = depositIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const me = await getCurrentAppUser();
  const deposit = await getDepositById(parsed.data.id);
  if (!deposit) return { ok: false, error: "Deposit not found." };
  if (
    deposit.status !== "paid" &&
    deposit.status !== "manually_marked_paid"
  ) {
    return { ok: false, error: "Refund only applies to paid deposits." };
  }
  await patchDepositStatus(deposit.id, "refunded", {
    refundedAt: new Date(),
  });
  await appendDepositEvent({
    depositId: deposit.id,
    eventType: "refunded",
    actorType: "internal",
    actorUserId: me?.id ?? null,
    message: "Refund placeholder — no provider call.",
  });
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "direct_booking.deposit.refund",
    entityType: "direct_booking_deposit",
    entityId: deposit.id,
  });
  revalidatePath(`/dashboard/direct-bookings/deposits/${deposit.id}`);
  return { ok: true };
}
