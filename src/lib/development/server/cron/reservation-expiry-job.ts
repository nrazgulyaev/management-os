import "server-only";

import { and, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { reservations } from "@/lib/db/schema/sales";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Marks reservations as expired when `expires_at < now()` and the
 * reservation is still in `pending_payment` or `active`.
 *
 * Idempotent: a row already at status='expired' is skipped (the WHERE
 * clause filters for the two pre-expiry statuses).
 */
export async function runDevOsReservationExpiry(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { expired: 0 },
      error: "DB unavailable",
    };
  }

  const now = new Date();
  const expiredRows = await db
    .update(reservations)
    .set({ status: "expired", updatedAt: now })
    .where(
      and(
        inArray(reservations.status, ["pending_payment", "active"]),
        isNotNull(reservations.expiresAt),
        lte(reservations.expiresAt, now),
      ),
    )
    .returning({ id: reservations.id, villaId: reservations.villaId });

  for (const row of expiredRows) {
    await handle.event("info", "reservation_expired", {
      reservationId: row.id,
      villaId: row.villaId,
    });
  }

  // Sanity count check.
  const [pendingCount] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(reservations)
    .where(eq(reservations.status, "pending_payment"));

  return {
    status: "success",
    summary: `Expired ${expiredRows.length} reservations. ${pendingCount?.c ?? 0} still pending payment.`,
    metrics: {
      expired: expiredRows.length,
      stillPendingPayment: Number(pendingCount?.c ?? 0),
    },
  };
}
