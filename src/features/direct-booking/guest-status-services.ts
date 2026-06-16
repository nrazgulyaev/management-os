import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { directBookingHolds, directBookingRequests } from "@/lib/db/schema/direct-booking";
import { directBookingDeposits, directBookingDepositEvents } from "@/lib/db/schema/payments";
import { bookings } from "@/lib/db/schema/bookings";
import { villas } from "@/lib/db/schema/projects";
import {
  directBookingGuestNotifications,
  directBookingGuestStatusSnapshots,
  directBookingGuestMessageThreads,
  directBookingGuestMessages,
  type DirectBookingGuestNotification,
  type DirectBookingGuestStatusSnapshot,
} from "@/lib/db/schema/direct-booking-guest";
import {
  buildGuestStatusCopy,
  buildNotificationForStageTransition,
  buildPublicDirectBookingStage,
  sanitizeGuestNotificationPayload,
  type PublicGuestStage,
  type StageTransitionContext,
} from "./guest-status-pure";
import {
  buildMessagePreview,
  guestCanMessage,
  type MessagePreview,
  type MessagePreviewEntry,
} from "./guest-messages-pure";
import { calculateBalanceDue } from "./finance-pure";
import { hashHoldToken } from "./token";

/**
 * Server-side services for the guest status center.  All public
 * routes funnel through here.  The redaction contract is enforced by
 * the pure module — this file is plumbing.
 */

// -----------------------------------------------------------------------------
// Resolution from a raw token
// -----------------------------------------------------------------------------

interface GuestChainRow {
  hold: typeof directBookingHolds.$inferSelect;
  request: typeof directBookingRequests.$inferSelect | null;
  deposit: typeof directBookingDeposits.$inferSelect | null;
  booking: typeof bookings.$inferSelect | null;
  villaLabel: string;
  guestClaimedPaid: boolean;
}

export async function resolveGuestChainByToken(
  token: string,
): Promise<GuestChainRow | null> {
  const db = getDb();
  if (!db) return null;
  const tokenHash = hashHoldToken(token);
  const [hold] = await db
    .select()
    .from(directBookingHolds)
    .where(eq(directBookingHolds.holdTokenHash, tokenHash))
    .limit(1);
  if (!hold) return null;
  const [villa] = await db
    .select({ name: villas.name, code: villas.unitCode })
    .from(villas)
    .where(eq(villas.id, hold.villaId))
    .limit(1);
  const villaLabel = villa?.name ?? villa?.code ?? "Villa";
  const [request] = await db
    .select()
    .from(directBookingRequests)
    .where(eq(directBookingRequests.holdId, hold.id))
    .limit(1);
  let deposit = null as typeof directBookingDeposits.$inferSelect | null;
  let booking = null as typeof bookings.$inferSelect | null;
  let guestClaimedPaid = false;
  if (request) {
    const [d] = await db
      .select()
      .from(directBookingDeposits)
      .where(eq(directBookingDeposits.requestId, request.id))
      .limit(1);
    deposit = d ?? null;
    if (request.bookingId) {
      const [b] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.id, request.bookingId))
        .limit(1);
      booking = b ?? null;
    }
    if (deposit) {
      const events = await db
        .select({ eventType: directBookingDepositEvents.eventType })
        .from(directBookingDepositEvents)
        .where(eq(directBookingDepositEvents.depositId, deposit.id));
      guestClaimedPaid = events.some((e) => e.eventType === "guest_claimed_paid");
    }
  }
  return { hold, request: request ?? null, deposit, booking, villaLabel, guestClaimedPaid };
}

// -----------------------------------------------------------------------------
// Snapshot rebuild
// -----------------------------------------------------------------------------

export interface RebuildSnapshotOutcome {
  prevStage: PublicGuestStage | null;
  nextStage: PublicGuestStage;
  inserted: boolean;
}

export async function rebuildGuestStatusSnapshotForHold(
  holdId: string,
  token: string | null = null,
): Promise<RebuildSnapshotOutcome | null> {
  const db = getDb();
  if (!db) return null;
  const [hold] = await db
    .select()
    .from(directBookingHolds)
    .where(eq(directBookingHolds.id, holdId))
    .limit(1);
  if (!hold) return null;
  const [villa] = await db
    .select({ name: villas.name, code: villas.unitCode })
    .from(villas)
    .where(eq(villas.id, hold.villaId))
    .limit(1);
  const villaLabel = villa?.name ?? villa?.code ?? "Villa";
  const [request] = await db
    .select()
    .from(directBookingRequests)
    .where(eq(directBookingRequests.holdId, hold.id))
    .limit(1);
  let deposit = null as typeof directBookingDeposits.$inferSelect | null;
  let booking = null as typeof bookings.$inferSelect | null;
  let guestClaimedPaid = false;
  if (request) {
    const [d] = await db
      .select()
      .from(directBookingDeposits)
      .where(eq(directBookingDeposits.requestId, request.id))
      .limit(1);
    deposit = d ?? null;
    if (request.bookingId) {
      const [b] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.id, request.bookingId))
        .limit(1);
      booking = b ?? null;
    }
    if (deposit) {
      const events = await db
        .select({ eventType: directBookingDepositEvents.eventType })
        .from(directBookingDepositEvents)
        .where(eq(directBookingDepositEvents.depositId, deposit.id));
      guestClaimedPaid = events.some((e) => e.eventType === "guest_claimed_paid");
    }
  }
  const stage = buildPublicDirectBookingStage({
    hold: { status: hold.status },
    request: request ? { status: request.status } : null,
    deposit: deposit ? { status: deposit.status, guestClaimedPaid } : null,
    booking: booking
      ? {
          status: booking.status,
          checkIn: booking.checkIn as unknown as string,
          checkOut: booking.checkOut as unknown as string,
        }
      : null,
    today: new Date().toISOString().slice(0, 10),
  });
  const copy = buildGuestStatusCopy(stage, {
    token: token ?? "",
    hasDeposit: !!deposit,
    canNotifyPaid:
      !!deposit &&
      ["pending", "awaiting_provider", "requires_action", "draft"].includes(
        deposit.status,
      ) &&
      !guestClaimedPaid,
    canMessage: guestCanMessage(stage),
  });
  const balanceDue = deposit
    ? calculateBalanceDue(hold.totalMinor, deposit.amountMinor)
    : hold.totalMinor;
  const [existing] = await db
    .select()
    .from(directBookingGuestStatusSnapshots)
    .where(eq(directBookingGuestStatusSnapshots.holdId, hold.id))
    .limit(1);
  const prevStage = (existing?.publicStage as PublicGuestStage | undefined) ?? null;
  if (existing) {
    await db
      .update(directBookingGuestStatusSnapshots)
      .set({
        requestId: request?.id ?? null,
        depositId: deposit?.id ?? null,
        bookingId: booking?.id ?? null,
        publicStage: stage,
        headline: copy.headline,
        body: copy.body,
        nextActionLabel: copy.nextActionLabel,
        nextActionHref: copy.nextActionHref,
        guestCanAct: copy.guestCanAct,
        holdExpiresAt: hold.expiresAt,
        depositExpiresAt: deposit?.expiresAt ?? null,
        totalAmountMinor: hold.totalMinor,
        depositAmountMinor: deposit?.amountMinor ?? null,
        balanceDueMinor: balanceDue,
        currency: hold.currency,
        villaLabel,
        checkIn: hold.checkIn,
        checkOut: hold.checkOut,
        nights: hold.nights,
        guestCount: hold.guestCount,
        sourceUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(directBookingGuestStatusSnapshots.id, existing.id));
    return { prevStage, nextStage: stage, inserted: false };
  }
  await db.insert(directBookingGuestStatusSnapshots).values({
    holdId: hold.id,
    requestId: request?.id ?? null,
    depositId: deposit?.id ?? null,
    bookingId: booking?.id ?? null,
    publicStage: stage,
    headline: copy.headline,
    body: copy.body,
    nextActionLabel: copy.nextActionLabel,
    nextActionHref: copy.nextActionHref,
    guestCanAct: copy.guestCanAct,
    holdExpiresAt: hold.expiresAt,
    depositExpiresAt: deposit?.expiresAt ?? null,
    totalAmountMinor: hold.totalMinor,
    depositAmountMinor: deposit?.amountMinor ?? null,
    balanceDueMinor: balanceDue,
    currency: hold.currency,
    villaLabel,
    checkIn: hold.checkIn,
    checkOut: hold.checkOut,
    nights: hold.nights,
    guestCount: hold.guestCount,
    sourceUpdatedAt: new Date(),
  });
  return { prevStage: null, nextStage: stage, inserted: true };
}

export async function rebuildGuestStatusSnapshotForRequest(
  requestId: string,
): Promise<RebuildSnapshotOutcome | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select({ holdId: directBookingRequests.holdId })
    .from(directBookingRequests)
    .where(eq(directBookingRequests.id, requestId))
    .limit(1);
  if (!row) return null;
  return rebuildGuestStatusSnapshotForHold(row.holdId);
}

export async function rebuildGuestStatusSnapshotForDeposit(
  depositId: string,
): Promise<RebuildSnapshotOutcome | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select({
      holdId: directBookingDeposits.holdId,
      requestId: directBookingDeposits.requestId,
    })
    .from(directBookingDeposits)
    .where(eq(directBookingDeposits.id, depositId))
    .limit(1);
  if (!row) return null;
  if (row.holdId) return rebuildGuestStatusSnapshotForHold(row.holdId);
  if (row.requestId) {
    const [req] = await db
      .select({ holdId: directBookingRequests.holdId })
      .from(directBookingRequests)
      .where(eq(directBookingRequests.id, row.requestId))
      .limit(1);
    if (req) return rebuildGuestStatusSnapshotForHold(req.holdId);
  }
  return null;
}

export async function rebuildGuestStatusSnapshotForBooking(
  bookingId: string,
): Promise<RebuildSnapshotOutcome | null> {
  const db = getDb();
  if (!db) return null;
  const [req] = await db
    .select({ holdId: directBookingRequests.holdId })
    .from(directBookingRequests)
    .where(eq(directBookingRequests.bookingId, bookingId))
    .limit(1);
  if (!req) return null;
  return rebuildGuestStatusSnapshotForHold(req.holdId);
}

// -----------------------------------------------------------------------------
// Notification queueing
// -----------------------------------------------------------------------------

export interface QueueGuestNotificationInput {
  holdId: string;
  requestId: string | null;
  depositId: string | null;
  bookingId: string | null;
  notificationKey: string;
  publicTitle: string;
  publicBody: string;
  publicActionLabel?: string | null;
  publicActionHref?: string | null;
  severity?: "info" | "success" | "warning" | "critical";
  dedupeKey: string;
  // TENANCY: the org the notification belongs to. Admin actions pass the
  // verified caller org; token/stage-transition callers omit it and we derive
  // it from the hold so the row is always stamped (forgot-to-stamp fix).
  organizationId?: string | null;
}

export async function queueDirectBookingGuestNotification(
  input: QueueGuestNotificationInput,
): Promise<{ ok: boolean; id?: string; reason?: string }> {
  const db = getDb();
  if (!db) return { ok: false, reason: "no_db" };
  // TENANCY: resolve the owning org. Prefer the caller-supplied (verified) org;
  // otherwise derive it from the hold so the inserted notification is always
  // stamped to the right tenant.
  let organizationId = input.organizationId ?? null;
  if (!organizationId && input.holdId) {
    const [holdRow] = await db
      .select({ organizationId: directBookingHolds.organizationId })
      .from(directBookingHolds)
      .where(eq(directBookingHolds.id, input.holdId))
      .limit(1);
    organizationId = holdRow?.organizationId ?? null;
  }
  // Belt-and-braces sanitisation: strip any banned key the caller
  // accidentally passed through.
  const sanitised = sanitizeGuestNotificationPayload({
    notificationKey: input.notificationKey,
    publicTitle: input.publicTitle,
    publicBody: input.publicBody,
    publicActionLabel: input.publicActionLabel ?? null,
    publicActionHref: input.publicActionHref ?? null,
    severity: input.severity ?? "info",
    dedupeKey: input.dedupeKey,
  });
  try {
    const [row] = await db
      .insert(directBookingGuestNotifications)
      .values({
        organizationId,
        holdId: input.holdId,
        requestId: input.requestId,
        depositId: input.depositId,
        bookingId: input.bookingId,
        notificationKey: sanitised.notificationKey ?? input.notificationKey,
        publicTitle: sanitised.publicTitle ?? input.publicTitle,
        publicBody: sanitised.publicBody ?? input.publicBody,
        publicActionLabel: sanitised.publicActionLabel ?? null,
        publicActionHref: sanitised.publicActionHref ?? null,
        severity: (sanitised.severity ?? input.severity ?? "info") as
          | "info"
          | "success"
          | "warning"
          | "critical",
        dedupeKey: sanitised.dedupeKey ?? input.dedupeKey,
      })
      .returning({ id: directBookingGuestNotifications.id });
    return { ok: true, id: row?.id };
  } catch (err) {
    // UNIQUE on dedupe_key — the duplicate is a no-op success.
    const message = err instanceof Error ? err.message : "unknown";
    if (message.includes("dedupe_unique") || message.includes("unique")) {
      return { ok: true, reason: "duplicate" };
    }
    return { ok: false, reason: message };
  }
}

export async function queueStageTransitionNotification(
  prevStage: PublicGuestStage | null,
  nextStage: PublicGuestStage,
  ctx: StageTransitionContext,
): Promise<{ ok: boolean; id?: string; reason?: string }> {
  const note = buildNotificationForStageTransition(prevStage, nextStage, ctx);
  if (!note) return { ok: true, reason: "no_op" };
  return queueDirectBookingGuestNotification({
    holdId: ctx.holdId,
    requestId: ctx.requestId,
    depositId: ctx.depositId,
    bookingId: ctx.bookingId,
    notificationKey: note.notificationKey,
    publicTitle: note.publicTitle,
    publicBody: note.publicBody,
    publicActionLabel: note.publicActionLabel,
    publicActionHref: note.publicActionHref,
    severity: note.severity,
    dedupeKey: note.dedupeKey,
  });
}

// -----------------------------------------------------------------------------
// Reads
// -----------------------------------------------------------------------------

export async function listGuestNotificationsByHoldToken(
  token: string,
): Promise<DirectBookingGuestNotification[]> {
  const db = getDb();
  if (!db) return [];
  const tokenHash = hashHoldToken(token);
  const [hold] = await db
    .select({ id: directBookingHolds.id })
    .from(directBookingHolds)
    .where(eq(directBookingHolds.holdTokenHash, tokenHash))
    .limit(1);
  if (!hold) return [];
  const rows = await db
    .select()
    .from(directBookingGuestNotifications)
    .where(
      and(
        eq(directBookingGuestNotifications.holdId, hold.id),
        sql`${directBookingGuestNotifications.archivedAt} IS NULL`,
      ),
    )
    .orderBy(desc(directBookingGuestNotifications.createdAt));
  return rows;
}

export async function getGuestStatusSnapshotByHoldToken(
  token: string,
): Promise<DirectBookingGuestStatusSnapshot | null> {
  const db = getDb();
  if (!db) return null;
  const tokenHash = hashHoldToken(token);
  const [hold] = await db
    .select({ id: directBookingHolds.id })
    .from(directBookingHolds)
    .where(eq(directBookingHolds.holdTokenHash, tokenHash))
    .limit(1);
  if (!hold) return null;
  const [snap] = await db
    .select()
    .from(directBookingGuestStatusSnapshots)
    .where(eq(directBookingGuestStatusSnapshots.holdId, hold.id))
    .limit(1);
  return snap ?? null;
}

// -----------------------------------------------------------------------------
// Mark read / archive
// -----------------------------------------------------------------------------

export async function markGuestNotificationRead(
  token: string,
  notificationId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const db = getDb();
  if (!db) return { ok: false, reason: "no_db" };
  const tokenHash = hashHoldToken(token);
  const [hold] = await db
    .select({ id: directBookingHolds.id })
    .from(directBookingHolds)
    .where(eq(directBookingHolds.holdTokenHash, tokenHash))
    .limit(1);
  if (!hold) return { ok: false, reason: "not_found" };
  await db
    .update(directBookingGuestNotifications)
    .set({ status: "read", readAt: new Date() })
    .where(
      and(
        eq(directBookingGuestNotifications.id, notificationId),
        eq(directBookingGuestNotifications.holdId, hold.id),
      ),
    );
  return { ok: true };
}

export async function archiveGuestNotification(
  token: string,
  notificationId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const db = getDb();
  if (!db) return { ok: false, reason: "no_db" };
  const tokenHash = hashHoldToken(token);
  const [hold] = await db
    .select({ id: directBookingHolds.id })
    .from(directBookingHolds)
    .where(eq(directBookingHolds.holdTokenHash, tokenHash))
    .limit(1);
  if (!hold) return { ok: false, reason: "not_found" };
  await db
    .update(directBookingGuestNotifications)
    .set({ status: "archived", archivedAt: new Date() })
    .where(
      and(
        eq(directBookingGuestNotifications.id, notificationId),
        eq(directBookingGuestNotifications.holdId, hold.id),
      ),
    );
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Message preview for status page
// -----------------------------------------------------------------------------

export async function getGuestMessagePreviewByHoldToken(
  token: string,
): Promise<MessagePreview> {
  const empty: MessagePreview = {
    totalCount: 0,
    unreadCount: 0,
    lastAuthor: null,
    lastBody: null,
    lastAt: null,
  };
  const db = getDb();
  if (!db) return empty;
  const tokenHash = hashHoldToken(token);
  const [hold] = await db
    .select({ id: directBookingHolds.id })
    .from(directBookingHolds)
    .where(eq(directBookingHolds.holdTokenHash, tokenHash))
    .limit(1);
  if (!hold) return empty;
  const [thread] = await db
    .select()
    .from(directBookingGuestMessageThreads)
    .where(eq(directBookingGuestMessageThreads.holdId, hold.id))
    .limit(1);
  if (!thread) return empty;
  const messages = await db
    .select({
      authorType: directBookingGuestMessages.authorType,
      bodyRedacted: directBookingGuestMessages.bodyRedacted,
      createdAt: directBookingGuestMessages.createdAt,
      visibility: directBookingGuestMessages.visibility,
    })
    .from(directBookingGuestMessages)
    .where(
      and(
        eq(directBookingGuestMessages.threadId, thread.id),
        eq(directBookingGuestMessages.visibility, "guest_visible"),
      ),
    )
    .orderBy(asc(directBookingGuestMessages.createdAt));
  const entries: MessagePreviewEntry[] = messages.map((m) => ({
    authorType: m.authorType as "guest" | "staff" | "system",
    bodyRedacted: m.bodyRedacted,
    createdAt:
      m.createdAt instanceof Date
        ? m.createdAt.toISOString()
        : (m.createdAt as unknown as string),
  }));
  return buildMessagePreview(entries, thread.guestUnreadCount);
}
