/**
 * Phase 2.3 owner-04 / Packet C PR 1 — getOwnerCalendar.
 *
 * Wires the calendar event stream + pipeline against:
 *   - bookings (guest stays — checkIn..checkOut overlap)
 *   - owner_stay_requests (the rich personal-stay table that
 *     already exists in owner-stays.ts) for the personal /
 *     personal_request events
 *
 * Ownership scope: villas filtered through listMyVillas before the
 * query window applies, so an owner can't probe other villas by
 * guessing a villaId.
 */

import "server-only";
import { and, asc, eq, gte, inArray, lte, or } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { bookings } from "@/lib/db/schema/bookings";
import { guests } from "@/lib/db/schema/bookings";
import { ownerStayRequests } from "@/lib/db/schema/owner-stays";
import { villaCalendarBlocks } from "@/lib/db/schema/availability";
import { listMyVillas } from "@/features/owner-portal/owner-portal-queries";
import type { CalendarEvent } from "@/components/owner-portal/month-calendar";
import type { PipelineBooking } from "@/components/owner-portal/pipeline-list";

export interface OwnerCalendarResult {
  month: string;
  events: CalendarEvent[];
  pipeline: PipelineBooking[];
  villas: { id: string; label: string }[];
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, (m ?? 1) - 1, 1));
  const end = new Date(Date.UTC(y, m ?? 1, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const a = new Date(checkIn + "T00:00:00Z");
  const b = new Date(checkOut + "T00:00:00Z");
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}

/**
 * Owner-portal privacy: owners never see full guest names on their
 * calendar — only masked initials (preserves the masking the legacy
 * owner-calendar enforced; emails / phones / access codes are never
 * selected here). Booking codes (no PII) pass through unchanged.
 */
function maskGuestName(fullName: string): string {
  const initials = fullName
    .split(/[\s·.,]+/)
    .filter((p) => p.length > 0)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return initials ? `Guest ${initials}` : "Guest";
}

/** Owner-facing label for an owner-visible villa block. */
function blockLabel(blockType: string): string {
  if (blockType === "out_of_order") return "Out of order";
  if (blockType === "maintenance") return "Maintenance";
  return "Blocked";
}

const BOOKING_STATUSES_FOR_CAL = ["confirmed", "checked_in", "checked_out"] as const;

export async function getOwnerCalendar(
  ownerId: string,
  month?: string,
): Promise<OwnerCalendarResult> {
  const targetMonth = month ?? currentMonth();
  const owned = await listMyVillas(ownerId).catch(() => []);
  const villaIds = owned.map((v) => v.villaId);
  const villaCodeById = new Map(owned.map((v) => [v.villaId, v.villaCode ?? "Villa"]));

  const db = getDb();
  if (!db || villaIds.length === 0) {
    return {
      month: targetMonth,
      events: [],
      pipeline: [],
      villas: owned.map((v) => ({
        id: v.villaId,
        label: v.villaCode ?? v.villaName ?? "Villa",
      })),
    };
  }

  const { start, end } = monthBounds(targetMonth);

  // Guest bookings overlapping the month: (check_in <= end) AND (check_out >= start)
  const guestRows = await db
    .select({
      id: bookings.id,
      villaId: bookings.villaId,
      checkIn: bookings.checkIn,
      checkOut: bookings.checkOut,
      status: bookings.status,
      bookingCode: bookings.bookingCode,
      guestName: guests.fullName,
    })
    .from(bookings)
    .leftJoin(guests, eq(guests.id, bookings.guestId))
    .where(
      and(
        inArray(bookings.villaId, villaIds),
        inArray(bookings.status, [...BOOKING_STATUSES_FOR_CAL]),
        lte(bookings.checkIn, end),
        gte(bookings.checkOut, start),
      ),
    )
    .orderBy(asc(bookings.checkIn))
    .limit(200);

  // Owner stays overlapping the month from ownerStayRequests.
  const stayRows = await db
    .select({
      id: ownerStayRequests.id,
      villaId: ownerStayRequests.villaId,
      checkIn: ownerStayRequests.requestedStart,
      checkOut: ownerStayRequests.requestedEnd,
      status: ownerStayRequests.status,
    })
    .from(ownerStayRequests)
    .where(
      and(
        eq(ownerStayRequests.ownerId, ownerId),
        inArray(ownerStayRequests.villaId, villaIds),
        lte(ownerStayRequests.requestedStart, end),
        gte(ownerStayRequests.requestedEnd, start),
      ),
    )
    .orderBy(asc(ownerStayRequests.requestedStart))
    .limit(200);

  const events: CalendarEvent[] = [];
  for (const r of guestRows) {
    events.push({
      id: `b-${r.id}`,
      kind: "guest",
      startDate: r.checkIn,
      endDate: r.checkOut,
      label: r.guestName ? maskGuestName(r.guestName) : r.bookingCode,
    });
  }
  for (const r of stayRows) {
    const isConfirmed = r.status === "approved" || r.status === "confirmed" || r.status === "completed";
    events.push({
      id: `s-${r.id}`,
      kind: isConfirmed ? "owner_confirmed" : "owner_request",
      startDate: r.checkIn,
      endDate: r.checkOut,
      label: "Your stay",
    });
  }

  // Villa blocks (maintenance / out-of-order / holds) overlapping the month.
  // Only operator-flagged `owner_visible` blocks surface; titles/notes are
  // never shown — owners see a generic type label so internal ops detail
  // stays private.
  const blockRows = await db
    .select({
      id: villaCalendarBlocks.id,
      blockType: villaCalendarBlocks.blockType,
      startsAt: villaCalendarBlocks.startsAt,
      endsAt: villaCalendarBlocks.endsAt,
    })
    .from(villaCalendarBlocks)
    .where(
      and(
        inArray(villaCalendarBlocks.villaId, villaIds),
        eq(villaCalendarBlocks.status, "active"),
        eq(villaCalendarBlocks.ownerVisible, true),
        lte(villaCalendarBlocks.startsAt, new Date(`${end}T23:59:59.999Z`)),
        gte(villaCalendarBlocks.endsAt, new Date(`${start}T00:00:00.000Z`)),
      ),
    )
    .limit(100);
  for (const r of blockRows) {
    events.push({
      id: `k-${r.id}`,
      kind: "block",
      startDate: r.startsAt.toISOString().slice(0, 10),
      endDate: r.endsAt.toISOString().slice(0, 10),
      label: blockLabel(r.blockType),
    });
  }

  // Pipeline = next 30 days from today, ordered ascending, cap 8.
  const todayIso = new Date().toISOString().slice(0, 10);
  const upcomingGuest = await db
    .select({
      id: bookings.id,
      villaId: bookings.villaId,
      checkIn: bookings.checkIn,
      checkOut: bookings.checkOut,
      status: bookings.status,
      bookingCode: bookings.bookingCode,
      guestName: guests.fullName,
    })
    .from(bookings)
    .leftJoin(guests, eq(guests.id, bookings.guestId))
    .where(
      and(
        inArray(bookings.villaId, villaIds),
        inArray(bookings.status, [...BOOKING_STATUSES_FOR_CAL]),
        gte(bookings.checkIn, todayIso),
      ),
    )
    .orderBy(asc(bookings.checkIn))
    .limit(20);

  const upcomingStays = await db
    .select({
      id: ownerStayRequests.id,
      villaId: ownerStayRequests.villaId,
      checkIn: ownerStayRequests.requestedStart,
      checkOut: ownerStayRequests.requestedEnd,
      status: ownerStayRequests.status,
    })
    .from(ownerStayRequests)
    .where(
      and(
        eq(ownerStayRequests.ownerId, ownerId),
        inArray(ownerStayRequests.villaId, villaIds),
        gte(ownerStayRequests.requestedStart, todayIso),
        or(
          eq(ownerStayRequests.status, "requested"),
          eq(ownerStayRequests.status, "approved"),
          eq(ownerStayRequests.status, "confirmed"),
        ),
      ),
    )
    .orderBy(asc(ownerStayRequests.requestedStart))
    .limit(20);

  const pipeline: PipelineBooking[] = [
    ...upcomingGuest.map<PipelineBooking>((r) => ({
      id: `b-${r.id}`,
      villaCode: villaCodeById.get(r.villaId) ?? "Villa",
      dateLabel: r.checkIn,
      guestOrLabel: r.guestName ? maskGuestName(r.guestName) : r.bookingCode,
      nights: nightsBetween(r.checkIn, r.checkOut),
      kind: "guest",
      state: "confirmed",
    })),
    ...upcomingStays.map<PipelineBooking>((r) => ({
      id: `s-${r.id}`,
      villaCode: villaCodeById.get(r.villaId) ?? "Villa",
      dateLabel: r.checkIn,
      guestOrLabel: "Your stay",
      nights: nightsBetween(r.checkIn, r.checkOut),
      kind: "owner_stay",
      state:
        r.status === "approved" || r.status === "confirmed"
          ? "confirmed"
          : "requested",
    })),
  ]
    .sort((a, b) => a.dateLabel.localeCompare(b.dateLabel))
    .slice(0, 8);

  return {
    month: targetMonth,
    events,
    pipeline,
    villas: owned.map((v) => ({
      id: v.villaId,
      label: v.villaCode ?? v.villaName ?? "Villa",
    })),
  };
}
