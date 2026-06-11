import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  directBookingHolds,
  directBookingRequests,
} from "@/lib/db/schema/direct-booking";
import {
  appendRequestEvent,
  finishExpiryRun,
  findHoldsToExpire,
  startExpiryRun,
  updateHoldStatus,
  updateRequestStatus,
} from "./services";
import { releaseInternalHoldBlockForDirectHold } from "./availability";
import { notifyHoldExpired } from "./notifications";
import { syncGuestStatusForChain } from "./guest-status-lifecycle";
import { recordAuditEvent } from "@/features/audit/services";

/**
 * Run the expiry sweep:
 *   - find active holds whose `expires_at < now` and have no
 *     converted booking
 *   - mark each as `expired`
 *   - release the calendar block
 *   - mark any submitted/under_review requests linked to the hold as
 *     `expired` (unless they're already approved/converted)
 *   - record observability + audit
 */
export async function runDirectBookingExpiry(
  now: Date = new Date(),
): Promise<{
  expiredHolds: number;
  expiredRequests: number;
  releasedBlocks: number;
  runId: string | null;
}> {
  const db = getDb();
  if (!db)
    return {
      expiredHolds: 0,
      expiredRequests: 0,
      releasedBlocks: 0,
      runId: null,
    };

  const run = await startExpiryRun();
  let expiredHolds = 0;
  let expiredRequests = 0;
  let releasedBlocks = 0;
  try {
    const candidates = await findHoldsToExpire(now, 200);
    for (const hold of candidates) {
      if (hold.convertedBookingId) continue;
      await updateHoldStatus(hold.id, "expired");
      const out = await releaseInternalHoldBlockForDirectHold(hold.id);
      if (out.released) releasedBlocks++;
      expiredHolds++;
      // Linked requests in non-terminal states.
      const linked = await db
        .select({ id: directBookingRequests.id, requestCode: directBookingRequests.requestCode, status: directBookingRequests.status })
        .from(directBookingRequests)
        .where(
          and(
            eq(directBookingRequests.holdId, hold.id),
            inArray(directBookingRequests.status, [
              "submitted",
              "under_review",
            ]),
          ),
        );
      for (const req of linked) {
        await updateRequestStatus(req.id, "expired");
        await appendRequestEvent({
          requestId: req.id,
          eventType: "hold_expired",
          actorType: "system",
          message: `Hold ${hold.holdCode} expired`,
        });
        expiredRequests++;
      }
      await notifyHoldExpired({
        holdId: hold.id,
        holdCode: hold.holdCode,
        organizationId: hold.organizationId,
      });
      await syncGuestStatusForChain({ holdId: hold.id });
      await recordAuditEvent({
        actorUserId: null,
        action: "direct_booking.hold.expire",
        entityType: "direct_booking_hold",
        entityId: hold.id,
        after: { holdCode: hold.holdCode, expiredAt: now.toISOString() },
      });
    }
    if (run) {
      await finishExpiryRun({
        id: run.id,
        expiredHoldsCount: expiredHolds,
        expiredRequestsCount: expiredRequests,
        releasedBlocksCount: releasedBlocks,
        status: "success",
      });
    }
    return {
      expiredHolds,
      expiredRequests,
      releasedBlocks,
      runId: run?.id ?? null,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown_error";
    if (run) {
      await finishExpiryRun({
        id: run.id,
        expiredHoldsCount: expiredHolds,
        expiredRequestsCount: expiredRequests,
        releasedBlocksCount: releasedBlocks,
        status: "failed",
        errorMessage: message,
      });
    }
    return {
      expiredHolds,
      expiredRequests,
      releasedBlocks,
      runId: run?.id ?? null,
    };
  }
}

/** Quiet imports the typechecker can't see being used otherwise. */
export const __reserved = { sql, directBookingHolds };
