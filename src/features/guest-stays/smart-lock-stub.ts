import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  smartLockAccessCodes,
  type SmartLockAccessCode,
} from "@/lib/db/schema/guest-stays";
import { bookings } from "@/lib/db/schema/bookings";
import {
  deriveStubLockCode,
  deriveStubLockWindow,
  isStubLockVisible,
} from "./smart-lock-stub-pure";

/**
 * V9E — smart-lock stub helpers. NO real lock APIs. The display value
 * is deterministic from (booking_id, villa_id) so tests + demo flows
 * are reproducible.
 */

export interface StubLockRow {
  id: string;
  bookingId: string;
  villaId: string;
  codeDisplay: string | null;
  validFrom: string;
  validUntil: string;
  status: string;
  source: string;
  createdAt: string;
}

function mapRow(r: SmartLockAccessCode): StubLockRow {
  return {
    id: r.id,
    bookingId: r.bookingId,
    villaId: r.villaId,
    codeDisplay: r.codeDisplay,
    validFrom: r.validFrom.toISOString(),
    validUntil: r.validUntil.toISOString(),
    status: r.status,
    source: r.source,
    createdAt: r.createdAt.toISOString(),
  };
}

/**
 * Idempotent: return the active stub code for a booking, or create one.
 * Validity is `[checkIn-24h, checkOut+3h]`. Revoking a previous code
 * (status='revoked') frees the partial unique index so a new active row
 * can be created if needed.
 */
export async function createOrGetStubSmartLockCode(
  bookingId: string,
  actorUserId: string | null = null,
): Promise<StubLockRow | null> {
  const db = getDb();
  if (!db) return null;

  // Existing active code?
  const [existing] = await db
    .select()
    .from(smartLockAccessCodes)
    .where(
      and(
        eq(smartLockAccessCodes.bookingId, bookingId),
        eq(smartLockAccessCodes.status, "active"),
      ),
    )
    .limit(1);
  if (existing) return mapRow(existing);

  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!booking) return null;

  const window = deriveStubLockWindow(
    booking.checkIn as unknown as string,
    booking.checkOut as unknown as string,
  );
  const codeDisplay = deriveStubLockCode(booking.id, booking.villaId);

  const [row] = await db
    .insert(smartLockAccessCodes)
    .values({
      bookingId: booking.id,
      villaId: booking.villaId,
      codeDisplay,
      validFrom: window.validFrom,
      validUntil: window.validUntil,
      status: "active",
      source: "stub",
      createdBy: actorUserId,
    })
    .returning();
  return row ? mapRow(row) : null;
}

export async function getActiveStubLockForBooking(
  bookingId: string,
): Promise<StubLockRow | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(smartLockAccessCodes)
    .where(
      and(
        eq(smartLockAccessCodes.bookingId, bookingId),
        eq(smartLockAccessCodes.status, "active"),
      ),
    )
    .limit(1);
  return row ? mapRow(row) : null;
}

/**
 * Pure visibility helper exposed for the guest-route renderer. Returns
 * the code only when status=active AND we're inside the validity window.
 * The caller is responsible for permission checks.
 */
export function presentStubLockToGuest(
  row: StubLockRow | null,
  now: Date = new Date(),
): { visible: boolean; codeDisplay: string | null; validFrom: string; validUntil: string } | null {
  if (!row) return null;
  const visible = isStubLockVisible({
    status: row.status,
    validFrom: row.validFrom,
    validUntil: row.validUntil,
    now,
  });
  return {
    visible,
    codeDisplay: visible ? row.codeDisplay : null,
    validFrom: row.validFrom,
    validUntil: row.validUntil,
  };
}

export async function revokeStubSmartLockCode(
  id: string,
  actorUserId: string | null,
): Promise<{ ok: boolean; reason?: string }> {
  const db = getDb();
  if (!db) return { ok: false, reason: "db unavailable" };
  await db
    .update(smartLockAccessCodes)
    .set({
      status: "revoked",
      revokedAt: new Date(),
      revokedBy: actorUserId,
    })
    .where(eq(smartLockAccessCodes.id, id));
  return { ok: true };
}

// Suppress unused-import warnings (kept for future helpers).
export const _drizzle = { sql };
