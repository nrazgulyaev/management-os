import "server-only";

import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { checkins, guestIdDocuments } from "@/lib/db/schema/guest-stays";
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

export interface GuestIdRecord {
  status: string;
  docType: string;
  fullName: string | null;
  nationality: string | null;
  documentNumber: string | null;
  expiresAt: string | null;
  confidence: number;
}

/** bookingId → guest-ID extraction, for the Front office check-in review. */
export async function getGuestIdMap(
  bookingIds: string[],
): Promise<Record<string, GuestIdRecord>> {
  const db = getDb();
  if (!db || bookingIds.length === 0) return {};
  const rows = await db
    .select({
      bookingId: guestIdDocuments.bookingId,
      status: guestIdDocuments.status,
      docType: guestIdDocuments.docType,
      fullName: guestIdDocuments.fullName,
      nationality: guestIdDocuments.nationality,
      documentNumber: guestIdDocuments.documentNumber,
      expiresAt: guestIdDocuments.expiresAt,
      confidence: guestIdDocuments.confidence,
    })
    .from(guestIdDocuments)
    .where(inArray(guestIdDocuments.bookingId, bookingIds));
  const map: Record<string, GuestIdRecord> = {};
  for (const r of rows) {
    map[r.bookingId] = {
      status: r.status,
      docType: r.docType,
      fullName: r.fullName,
      nationality: r.nationality,
      documentNumber: r.documentNumber,
      expiresAt: r.expiresAt,
      confidence: Number(r.confidence ?? "0"),
    };
  }
  return map;
}
