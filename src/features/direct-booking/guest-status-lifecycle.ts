import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { directBookingHolds, directBookingRequests } from "@/lib/db/schema/direct-booking";
import { directBookingDeposits } from "@/lib/db/schema/payments";
import {
  rebuildGuestStatusSnapshotForHold,
  queueStageTransitionNotification,
} from "./guest-status-services";

/**
 * Lifecycle hook helper — every direct-booking action that changes
 * the (hold, request, deposit, booking) chain should call into one
 * of these so the snapshot stays current and a guest notification is
 * queued when meaningful.
 *
 * The hook is fire-and-forget: it MUST NOT throw on missing rows or
 * DB-not-configured environments, since the caller's primary action
 * (approve / reject / convert / etc.) must succeed regardless.
 */

async function holdIdForRequest(requestId: string): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select({ holdId: directBookingRequests.holdId })
    .from(directBookingRequests)
    .where(eq(directBookingRequests.id, requestId))
    .limit(1);
  return row?.holdId ?? null;
}

async function holdIdForDeposit(depositId: string): Promise<string | null> {
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
  if (row.holdId) return row.holdId;
  if (row.requestId) return holdIdForRequest(row.requestId);
  return null;
}

async function holdIdForBooking(bookingId: string): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select({ holdId: directBookingRequests.holdId })
    .from(directBookingRequests)
    .where(eq(directBookingRequests.bookingId, bookingId))
    .limit(1);
  return row?.holdId ?? null;
}

interface AnchorRefs {
  holdId: string;
  requestId: string | null;
  depositId: string | null;
  bookingId: string | null;
}

async function loadAnchorRefs(holdId: string): Promise<AnchorRefs | null> {
  const db = getDb();
  if (!db) return null;
  const [hold] = await db
    .select({ id: directBookingHolds.id })
    .from(directBookingHolds)
    .where(eq(directBookingHolds.id, holdId))
    .limit(1);
  if (!hold) return null;
  const [req] = await db
    .select({ id: directBookingRequests.id, bookingId: directBookingRequests.bookingId })
    .from(directBookingRequests)
    .where(eq(directBookingRequests.holdId, hold.id))
    .limit(1);
  let depositId: string | null = null;
  if (req) {
    const [dep] = await db
      .select({ id: directBookingDeposits.id })
      .from(directBookingDeposits)
      .where(eq(directBookingDeposits.requestId, req.id))
      .limit(1);
    depositId = dep?.id ?? null;
  }
  return {
    holdId: hold.id,
    requestId: req?.id ?? null,
    depositId,
    bookingId: req?.bookingId ?? null,
  };
}

/**
 * Rebuild the snapshot for a chain anchored on any of the four IDs +
 * queue a guest notification if the stage changed.  Best-effort — any
 * failure is swallowed and logged.
 */
export async function syncGuestStatusForChain(args: {
  holdId?: string | null;
  requestId?: string | null;
  depositId?: string | null;
  bookingId?: string | null;
  /** Used to build the `nextActionHref` in queued notifications.  When
   *  the caller does not have the raw token (most lifecycle actions
   *  don't), pass `null` and the notification href will be omitted. */
  token?: string | null;
}): Promise<void> {
  try {
    let holdId = args.holdId ?? null;
    if (!holdId && args.requestId) holdId = await holdIdForRequest(args.requestId);
    if (!holdId && args.depositId) holdId = await holdIdForDeposit(args.depositId);
    if (!holdId && args.bookingId) holdId = await holdIdForBooking(args.bookingId);
    if (!holdId) return;
    const outcome = await rebuildGuestStatusSnapshotForHold(holdId, args.token ?? null);
    if (!outcome) return;
    if (outcome.prevStage === outcome.nextStage) return;
    const refs = await loadAnchorRefs(holdId);
    if (!refs) return;
    await queueStageTransitionNotification(
      outcome.prevStage,
      outcome.nextStage,
      {
        token: args.token ?? "",
        holdId: refs.holdId,
        requestId: refs.requestId,
        depositId: refs.depositId,
        bookingId: refs.bookingId,
      },
    );
  } catch (err) {
    console.error("[direct-booking] syncGuestStatusForChain failed", err);
  }
}
