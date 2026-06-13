import "server-only";

import { and, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { guestIdDocuments } from "@/lib/db/schema/guest-stays";
import { bookings, guests } from "@/lib/db/schema/bookings";
import { villas } from "@/lib/db/schema/projects";
import { listArrivals } from "./services";
import { isTurnoverRisk, visaSeverity, type VisaSeverity } from "./watch-rules";

/**
 * FC-MANAGEMENT-FRONT-OFFICE §agents — deterministic front-office watch agents.
 * Rule-based monitors (no LLM): they scan existing data and surface flags for
 * the desk. The Watch panel runs them live; a nightly cron can reuse them.
 *
 * - turnover-monitor: villas with an arrival today that aren't ready yet.
 * - visa-watcher: captured guest IDs that expire during the stay / already expired.
 * - vip-prep: today's arrivals flagged VIP (guests.is_vip or a per-stay override).
 */

export interface TurnoverFlag {
  bookingId: string;
  villaCode: string | null;
  guestDisplay: string;
  readinessStatus: string;
}

export interface VipFlag {
  bookingId: string;
  villaCode: string | null;
  /** Masked display name — same privacy posture as the other monitors. */
  guestDisplay: string;
  checkIn: string;
  notes: string | null;
}

export interface VisaFlag {
  bookingId: string;
  villaCode: string | null;
  guestName: string | null;
  expiresAt: string | null;
  checkOut: string;
  severity: VisaSeverity;
}

export async function detectTurnoverRisks(date: Date = new Date()): Promise<TurnoverFlag[]> {
  const arrivals = await listArrivals(date);
  return arrivals
    .filter((a) => isTurnoverRisk(a.readinessStatus))
    .map((a) => ({
      bookingId: a.bookingId,
      villaCode: a.villaCode,
      guestDisplay: a.guestDisplay,
      readinessStatus: a.readinessStatus,
    }));
}

export async function detectVipPrep(date: Date = new Date()): Promise<VipFlag[]> {
  const arrivals = await listArrivals(date);
  return arrivals
    .filter((a) => a.isVip)
    .map((a) => ({
      bookingId: a.bookingId,
      villaCode: a.villaCode,
      guestDisplay: a.guestDisplay,
      checkIn: a.checkInDate,
      notes: a.bookingNotes,
    }));
}

export async function detectVisaWatch(now: Date = new Date()): Promise<VisaFlag[]> {
  const db = getDb();
  if (!db) return [];
  // TENANCY: scope via the booking join — bookings.organization_id is NOT NULL.
  // The service-role connection bypasses RLS, so without this every org's guest
  // ID documents leak into the visa-watcher panel.
  const organizationId = await requireOrgId();
  const rows = await db
    .select({
      bookingId: bookings.id,
      checkOut: bookings.checkOut,
      villaCode: villas.unitCode,
      guestName: guests.fullName,
      expiresAt: guestIdDocuments.expiresAt,
    })
    .from(guestIdDocuments)
    .innerJoin(bookings, eq(bookings.id, guestIdDocuments.bookingId))
    .leftJoin(villas, eq(villas.id, bookings.villaId))
    .leftJoin(guests, eq(guests.id, bookings.guestId))
    .where(
      and(
        isNotNull(guestIdDocuments.expiresAt),
        eq(bookings.organizationId, organizationId),
      ),
    )
    .limit(500);

  const flags: VisaFlag[] = [];
  for (const r of rows) {
    const checkOut = r.checkOut as unknown as string;
    // Only current/future stays.
    const co = Date.parse(checkOut);
    if (!Number.isNaN(co) && co < now.getTime()) continue;
    const severity = visaSeverity(r.expiresAt, checkOut, now);
    if (severity === "ok") continue;
    flags.push({
      bookingId: r.bookingId,
      villaCode: r.villaCode ?? null,
      guestName: r.guestName ?? null,
      expiresAt: r.expiresAt,
      checkOut,
      severity,
    });
  }
  return flags;
}
