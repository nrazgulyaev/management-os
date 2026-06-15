"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, isNull, or } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  directBookingHolds,
  directBookingRequests,
} from "@/lib/db/schema/direct-booking";
import { directBookingDeposits } from "@/lib/db/schema/payments";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import {
  rebuildGuestStatusSnapshotForHold,
  rebuildGuestStatusSnapshotForRequest,
  rebuildGuestStatusSnapshotForDeposit,
  rebuildGuestStatusSnapshotForBooking,
  queueDirectBookingGuestNotification,
  archiveGuestNotification,
  markGuestNotificationRead,
} from "./guest-status-services";
import {
  createGuestMessageByToken,
  createStaffMessageInThread,
  markGuestThreadReadForToken,
  markStaffThreadRead,
  setThreadStatus,
} from "./guest-messages";
import type { ActionResult } from "@/features/projects/actions";

// -----------------------------------------------------------------------------
// TENANCY guards — the rebuild/queue services intentionally stay org-agnostic
// for the token-driven public sync path. The admin actions below must verify
// the form-supplied entity belongs to the caller's org BEFORE invoking those
// services, so an operator cannot force a snapshot rebuild / inject a guest
// notification over another tenant's hold (and read its money fields back).
// Nullable legacy org rows (pre-0153 backfill) are still accepted.
// -----------------------------------------------------------------------------

/** True if a hold exists and belongs to the caller's org (or is legacy-NULL). */
async function holdInOrg(holdId: string, organizationId: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const [row] = await db
    .select({ id: directBookingHolds.id })
    .from(directBookingHolds)
    .where(
      and(
        eq(directBookingHolds.id, holdId),
        or(
          isNull(directBookingHolds.organizationId),
          eq(directBookingHolds.organizationId, organizationId),
        ),
      ),
    )
    .limit(1);
  return !!row;
}

async function requestInOrg(
  requestId: string,
  organizationId: string,
): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const [row] = await db
    .select({ id: directBookingRequests.id })
    .from(directBookingRequests)
    .where(
      and(
        eq(directBookingRequests.id, requestId),
        or(
          isNull(directBookingRequests.organizationId),
          eq(directBookingRequests.organizationId, organizationId),
        ),
      ),
    )
    .limit(1);
  return !!row;
}

async function depositInOrg(
  depositId: string,
  organizationId: string,
): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const [row] = await db
    .select({ id: directBookingDeposits.id })
    .from(directBookingDeposits)
    .where(
      and(
        eq(directBookingDeposits.id, depositId),
        or(
          isNull(directBookingDeposits.organizationId),
          eq(directBookingDeposits.organizationId, organizationId),
        ),
      ),
    )
    .limit(1);
  return !!row;
}

/** A booking is anchored to the org via its direct-booking request. */
async function bookingInOrg(
  bookingId: string,
  organizationId: string,
): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const [row] = await db
    .select({ id: directBookingRequests.id })
    .from(directBookingRequests)
    .where(
      and(
        eq(directBookingRequests.bookingId, bookingId),
        or(
          isNull(directBookingRequests.organizationId),
          eq(directBookingRequests.organizationId, organizationId),
        ),
      ),
    )
    .limit(1);
  return !!row;
}

// -----------------------------------------------------------------------------
// Admin: rebuild snapshot
// -----------------------------------------------------------------------------

const rebuildSchema = z.object({
  holdId: z.string().uuid().optional(),
  requestId: z.string().uuid().optional(),
  depositId: z.string().uuid().optional(),
  bookingId: z.string().uuid().optional(),
});

export async function rebuildDirectBookingGuestStatusAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("direct_booking.guest_notifications.write");
  const parsed = rebuildSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();
  let outcome:
    | Awaited<ReturnType<typeof rebuildGuestStatusSnapshotForHold>>
    | null = null;
  if (parsed.data.holdId) {
    if (!(await holdInOrg(parsed.data.holdId, organizationId)))
      return { ok: false, error: "Not found." };
    outcome = await rebuildGuestStatusSnapshotForHold(parsed.data.holdId);
  } else if (parsed.data.requestId) {
    if (!(await requestInOrg(parsed.data.requestId, organizationId)))
      return { ok: false, error: "Not found." };
    outcome = await rebuildGuestStatusSnapshotForRequest(parsed.data.requestId);
  } else if (parsed.data.depositId) {
    if (!(await depositInOrg(parsed.data.depositId, organizationId)))
      return { ok: false, error: "Not found." };
    outcome = await rebuildGuestStatusSnapshotForDeposit(parsed.data.depositId);
  } else if (parsed.data.bookingId) {
    if (!(await bookingInOrg(parsed.data.bookingId, organizationId)))
      return { ok: false, error: "Not found." };
    outcome = await rebuildGuestStatusSnapshotForBooking(parsed.data.bookingId);
  } else {
    return { ok: false, error: "Provide one of holdId, requestId, depositId, bookingId." };
  }
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "direct_booking.guest_status.rebuild",
    entityType: "direct_booking_guest_status_snapshot",
    entityId: parsed.data.holdId ?? null,
    after: outcome ?? undefined,
  });
  revalidatePath("/dashboard/direct-bookings/guest-status");
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Admin: queue manual guest-safe notification
// -----------------------------------------------------------------------------

const adminQueueSchema = z.object({
  holdId: z.string().uuid(),
  requestId: z.string().uuid().optional(),
  notificationKey: z.string().min(1).max(80),
  publicTitle: z.string().min(2).max(120),
  publicBody: z.string().min(2).max(2000),
  publicActionLabel: z.string().max(60).optional(),
  publicActionHref: z.string().max(500).optional(),
  severity: z
    .enum(["info", "success", "warning", "critical"])
    .default("info"),
  dedupeKey: z.string().min(4).max(120),
});

export async function adminQueueGuestNotificationAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("direct_booking.guest_notifications.write");
  const parsed = adminQueueSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  const organizationId = await requireOrgId();
  // TENANCY: an operator cannot inject a guest-facing notification onto another
  // tenant's hold.
  if (!(await holdInOrg(parsed.data.holdId, organizationId)))
    return { ok: false, error: "Not found." };
  const me = await getCurrentAppUser();
  const out = await queueDirectBookingGuestNotification({
    holdId: parsed.data.holdId,
    requestId: parsed.data.requestId ?? null,
    depositId: null,
    bookingId: null,
    notificationKey: parsed.data.notificationKey,
    publicTitle: parsed.data.publicTitle,
    publicBody: parsed.data.publicBody,
    publicActionLabel: parsed.data.publicActionLabel ?? null,
    publicActionHref: parsed.data.publicActionHref ?? null,
    severity: parsed.data.severity,
    dedupeKey: parsed.data.dedupeKey,
    organizationId,
  });
  if (!out.ok) return { ok: false, error: out.reason ?? "queue_failed" };
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "direct_booking.guest_notification.queue",
    entityType: "direct_booking_guest_notification",
    entityId: out.id ?? null,
    after: { dedupeKey: parsed.data.dedupeKey },
  });
  revalidatePath("/dashboard/direct-bookings/guest-status");
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Admin: reply to thread
// -----------------------------------------------------------------------------

const adminReplySchema = z.object({
  threadId: z.string().uuid(),
  body: z.string().min(2).max(4000),
  visibility: z.enum(["guest_visible", "internal_only"]).default("guest_visible"),
});

export async function adminReplyToGuestBookingThreadAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("direct_booking.guest_messages.write");
  const parsed = adminReplySchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();
  const out = await createStaffMessageInThread(
    parsed.data.threadId,
    parsed.data.body,
    parsed.data.visibility,
    me?.id ?? null,
    organizationId,
  );
  if (!out.ok) return { ok: false, error: out.reason ?? "reply_failed" };
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "direct_booking.guest_message.staff_reply",
    entityType: "direct_booking_guest_message",
    entityId: out.messageId ?? null,
  });
  revalidatePath(`/dashboard/direct-bookings/messages/${parsed.data.threadId}`);
  revalidatePath("/dashboard/direct-bookings/messages");
  return { ok: true };
}

const setStatusSchema = z.object({
  threadId: z.string().uuid(),
  status: z.enum(["open", "closed", "archived"]),
});

export async function adminSetGuestThreadStatusAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("direct_booking.guest_messages.manage");
  const parsed = setStatusSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();
  await setThreadStatus(parsed.data.threadId, parsed.data.status, organizationId);
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "direct_booking.guest_thread.set_status",
    entityType: "direct_booking_guest_message_thread",
    entityId: parsed.data.threadId,
    after: { status: parsed.data.status },
  });
  revalidatePath(`/dashboard/direct-bookings/messages/${parsed.data.threadId}`);
  revalidatePath("/dashboard/direct-bookings/messages");
  return { ok: true };
}

const adminMarkReadSchema = z.object({ threadId: z.string().uuid() });

export async function adminMarkThreadReadAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("direct_booking.guest_messages.read");
  const parsed = adminMarkReadSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const organizationId = await requireOrgId();
  await markStaffThreadRead(parsed.data.threadId, organizationId);
  revalidatePath(`/dashboard/direct-bookings/messages/${parsed.data.threadId}`);
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Guest token-bound actions
// -----------------------------------------------------------------------------

export interface GuestActionResult {
  ok: boolean;
  reason?: string;
}

export async function guestReplyToBookingThreadAction(
  token: string,
  body: string,
  ipHash: string | null = null,
): Promise<GuestActionResult> {
  const out = await createGuestMessageByToken(token, body, { ipHash });
  if (!out.ok) return { ok: false, reason: out.reason };
  revalidatePath(`/book/hold/${token}/status`);
  revalidatePath(`/book/hold/${token}/messages`);
  return { ok: true };
}

export async function guestMarkNotificationReadAction(
  token: string,
  notificationId: string,
): Promise<GuestActionResult> {
  const out = await markGuestNotificationRead(token, notificationId);
  if (!out.ok) return { ok: false, reason: out.reason };
  revalidatePath(`/book/hold/${token}/status`);
  return { ok: true };
}

export async function guestArchiveNotificationAction(
  token: string,
  notificationId: string,
): Promise<GuestActionResult> {
  const out = await archiveGuestNotification(token, notificationId);
  if (!out.ok) return { ok: false, reason: out.reason };
  revalidatePath(`/book/hold/${token}/status`);
  return { ok: true };
}

export async function guestMarkThreadReadAction(
  token: string,
): Promise<GuestActionResult> {
  const out = await markGuestThreadReadForToken(token);
  if (!out.ok) return { ok: false, reason: out.reason };
  revalidatePath(`/book/hold/${token}/status`);
  revalidatePath(`/book/hold/${token}/messages`);
  return { ok: true };
}
