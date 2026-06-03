import "server-only";

import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { checkins } from "@/lib/db/schema/guest-stays";
import type { CheckinStatus } from "./state-machine";

export interface CheckinRecord {
  id: string;
  status: CheckinStatus;
  guestCount: number | null;
  eta: string | null;
  passportUploaded: boolean;
  submittedAt: string | null;
  approvedAt: string | null;
  codeIssuedAt: string | null;
}

export async function getCheckinByBooking(bookingId: string): Promise<CheckinRecord | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(checkins)
    .where(eq(checkins.bookingId, bookingId))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    status: row.status as CheckinStatus,
    guestCount: row.guestCount,
    eta: row.eta,
    passportUploaded: row.passportUploaded,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    codeIssuedAt: row.codeIssuedAt?.toISOString() ?? null,
  };
}

/** bookingId → checkin.status, for decorating the Front office arrivals board. */
export async function getCheckinStatusMap(
  bookingIds: string[],
): Promise<Record<string, CheckinStatus>> {
  const db = getDb();
  if (!db || bookingIds.length === 0) return {};
  const rows = await db
    .select({ bookingId: checkins.bookingId, status: checkins.status })
    .from(checkins)
    .where(inArray(checkins.bookingId, bookingIds));
  const map: Record<string, CheckinStatus> = {};
  for (const r of rows) map[r.bookingId] = r.status as CheckinStatus;
  return map;
}
