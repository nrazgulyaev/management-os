"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { checkins } from "@/lib/db/schema/guest-stays";
import { bookings } from "@/lib/db/schema/bookings";
import { canManageEntity } from "@/features/auth/permissions";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { createOrGetStubSmartLockCode } from "@/features/guest-stays/smart-lock-stub";
import { assertTransition, canApprove, type CheckinStatus } from "./state-machine";
import { emitCheckinEvent } from "./events";

export type ApproveResult = { ok: boolean; error?: string };

/**
 * Operator approves a submitted online check-in (FC-MANAGEMENT-FRONT-OFFICE
 * §arrivals). Server-enforced transition submitted → approved → code_issued:
 * issues the door code (smart_lock_access_codes), flips booking.status →
 * checked_in, and emits the events. The guest's villa code unlocks once
 * checkin.status='code_issued'.
 */
export async function approveStayCheckinAction(bookingId: string): Promise<ApproveResult> {
  if (!(await canManageEntity("booking"))) return { ok: false, error: "Not authorised." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const user = await getCurrentAppUser();

  const [c] = await db
    .select({ id: checkins.id, status: checkins.status })
    .from(checkins)
    .where(eq(checkins.bookingId, bookingId))
    .limit(1);
  if (!c) return { ok: false, error: "No check-in has been submitted for this booking." };

  const from = c.status as CheckinStatus;
  if (from === "code_issued") return { ok: true }; // already approved + issued
  if (!canApprove(from)) {
    return { ok: false, error: `Can't approve a ${from} check-in (must be submitted).` };
  }
  // submitted → approved → code_issued (both edges legal, chained in one action).
  assertTransition(from, "approved");
  assertTransition("approved", "code_issued");

  const now = new Date();
  // Issue (or reuse) the door code for this booking.
  await createOrGetStubSmartLockCode(bookingId, user?.id ?? null);

  await db
    .update(checkins)
    .set({
      status: "code_issued",
      approvedAt: now,
      codeIssuedAt: now,
      approvedBy: user?.id ?? null,
      updatedAt: now,
    })
    .where(eq(checkins.id, c.id));

  // Self-check-in is the check-in: flip the booking so the manager panel shows it.
  await db.update(bookings).set({ status: "checked_in" }).where(eq(bookings.id, bookingId));

  await emitCheckinEvent({ verb: "approved", checkinId: c.id, bookingId, actorUserId: user?.id });
  await emitCheckinEvent({ verb: "code_issued", checkinId: c.id, bookingId, actorUserId: user?.id });
  revalidatePath("/dashboard/bookings");
  return { ok: true };
}
