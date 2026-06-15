import "server-only";

import { and, eq, isNull, lt, inArray, or } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  directBookingDepositEvents,
  directBookingDeposits,
  type DirectBookingDeposit,
} from "@/lib/db/schema/payments";
import {
  directBookingHolds,
  directBookingRequests,
} from "@/lib/db/schema/direct-booking";
import { recordAuditEvent } from "@/features/audit/services";
import { queueNotification } from "@/features/notifications/services";
import { releaseInternalHoldBlockForDirectHold } from "./availability";
import { shouldExpireDeposit } from "./finance-pure";
import { syncGuestStatusForChain } from "./guest-status-lifecycle";

/**
 * Expiry sweep for unpaid deposits.
 *
 * Rules:
 *   - `pending` / `requires_action` deposits with `expires_at < now`
 *     flip to `expired`.
 *   - The linked request, if still in `submitted | under_review |
 *     approved`, also flips to `expired` (when the hold isn't already
 *     converted).
 *   - The linked hold, if `active`, flips to `expired` and the
 *     internal_hold calendar block is released.
 *   - Idempotent: re-running on an already-expired deposit is a
 *     no-op.
 */

export async function listExpiredPendingDeposits(
  now: Date = new Date(),
  limit = 100,
): Promise<DirectBookingDeposit[]> {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(directBookingDeposits)
    .where(
      and(
        inArray(directBookingDeposits.status, [
          "pending",
          "requires_action",
        ]),
        lt(directBookingDeposits.expiresAt, now),
      ),
    )
    .limit(limit);
}

export async function expireDeposit(
  depositId: string,
  actorUserId: string | null = null,
  now: Date = new Date(),
  /**
   * TENANCY: when provided (tenant-initiated expiry), a deposit owned by
   * another org reads as not_found before any status flip + cascade. The
   * cron sweep (expireUnpaidDeposits) omits it and runs unscoped.
   */
  organizationId?: string,
): Promise<{ ok: boolean; reason?: string }> {
  const db = getDb();
  if (!db) return { ok: false, reason: "no_db" };
  const [deposit] = await db
    .select()
    .from(directBookingDeposits)
    .where(
      organizationId
        ? and(
            eq(directBookingDeposits.id, depositId),
            // NULL org = legacy pre-backfill row, allowed for the internal caller.
            or(
              eq(directBookingDeposits.organizationId, organizationId),
              isNull(directBookingDeposits.organizationId),
            ),
          )
        : eq(directBookingDeposits.id, depositId),
    )
    .limit(1);
  if (!deposit) return { ok: false, reason: "not_found" };
  if (deposit.status === "expired") return { ok: true, reason: "already_expired" };
  if (
    !shouldExpireDeposit(
      deposit.status as Parameters<typeof shouldExpireDeposit>[0],
      deposit.expiresAt,
      now,
    )
  ) {
    return { ok: false, reason: `cannot_expire_${deposit.status}` };
  }
  await db
    .update(directBookingDeposits)
    .set({
      status: "expired",
      expiresReason: deposit.expiresReason ?? "expiry_cron",
      updatedAt: now,
    })
    .where(eq(directBookingDeposits.id, depositId));
  await db.insert(directBookingDepositEvents).values({
    // TENANCY-FINANCE-DOCS — child event copies the parent deposit's org.
    organizationId: deposit.organizationId,
    depositId,
    eventType: "expired",
    actorType: actorUserId ? "internal" : "system",
    actorUserId,
    message: "Deposit expired",
  });

  // Cascade to request + hold (best-effort; never throws).
  if (deposit.requestId) {
    const [req] = await db
      .select()
      .from(directBookingRequests)
      .where(eq(directBookingRequests.id, deposit.requestId))
      .limit(1);
    if (
      req &&
      (req.status === "submitted" ||
        req.status === "under_review" ||
        req.status === "approved")
    ) {
      await db
        .update(directBookingRequests)
        .set({ status: "expired", updatedAt: now })
        .where(eq(directBookingRequests.id, deposit.requestId));
    }
  }
  if (deposit.holdId) {
    const [hold] = await db
      .select()
      .from(directBookingHolds)
      .where(eq(directBookingHolds.id, deposit.holdId))
      .limit(1);
    if (hold && hold.status === "active") {
      await db
        .update(directBookingHolds)
        .set({ status: "expired", updatedAt: now })
        .where(eq(directBookingHolds.id, deposit.holdId));
      await releaseInternalHoldBlockForDirectHold(deposit.holdId);
    }
  }

  await queueNotification({
    recipientType: "role",
    organizationId: deposit.organizationId ?? undefined,
    channel: "in_app",
    templateKey: "direct_booking.deposit_expired",
    title: "Deposit expired",
    body: `Deposit ${deposit.depositCode} expired without payment.`,
    dedupeKey: `direct-booking-deposit-expired:${deposit.id}`,
    payload: { depositId: deposit.id, role: "finance_manager" },
    priority: "low",
  });
  await syncGuestStatusForChain({ depositId: deposit.id });
  await recordAuditEvent({
    actorUserId,
    action: "direct_booking.deposit.expire",
    entityType: "direct_booking_deposit",
    entityId: deposit.id,
    after: { depositCode: deposit.depositCode, expiredAt: now.toISOString() },
  });
  return { ok: true };
}

export async function expireUnpaidDeposits(
  now: Date = new Date(),
  limit = 100,
): Promise<{ expired: number; skipped: number }> {
  const candidates = await listExpiredPendingDeposits(now, limit);
  let expired = 0;
  let skipped = 0;
  for (const d of candidates) {
    const out = await expireDeposit(d.id, null, now);
    if (out.ok && out.reason !== "already_expired") expired++;
    else skipped++;
  }
  return { expired, skipped };
}
