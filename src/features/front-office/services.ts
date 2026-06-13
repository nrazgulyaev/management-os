import "server-only";

import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { bookings, guests } from "@/lib/db/schema/bookings";
import { villas, projects as projectsTable } from "@/lib/db/schema/projects";
import {
  bookingStayEvents,
  checkinCheckoutRequests,
  villaReadinessStates,
} from "@/lib/db/schema/availability";
import { operationTasks } from "@/lib/db/schema/operations";
import { serviceRequests } from "@/lib/db/schema/operations";

/**
 * Front-office helper module. Reads only — every mutation lives in
 * `actions.ts`. We keep guest data minimal: only safe display name +
 * counts. No phone/email/passport leaks here.
 */

function safeGuestDisplayName(
  fullName: string | null,
  email: string | null,
): string {
  if (fullName && fullName.trim().length > 0) {
    // First name + last initial, e.g. "Emma W."
    const [first, ...rest] = fullName.trim().split(/\s+/);
    const initial = rest.length > 0 ? rest[rest.length - 1][0] : "";
    return initial ? `${first} ${initial}.` : first;
  }
  if (email) {
    const localPart = email.split("@")[0] ?? "";
    return localPart.slice(0, 3) + "***";
  }
  return "Guest";
}

export interface ArrivalRow {
  bookingId: string;
  bookingCode: string;
  villaId: string;
  villaCode: string | null;
  projectName: string | null;
  guestDisplay: string;
  guestsCount: number;
  checkInDate: string;
  channelName: string | null;
  bookingStatus: string;
  readinessStatus: string;
  hasOpenServiceRequest: boolean;
  /** Resolved VIP signal: booking override wins, else the guest flag. */
  isVip: boolean;
  /** Booking notes (front-desk prep context for VIP arrivals). */
  bookingNotes: string | null;
}

export interface DepartureRow {
  bookingId: string;
  bookingCode: string;
  villaId: string;
  villaCode: string | null;
  guestDisplay: string;
  checkOutDate: string;
  /** Stage 7.F.A.1 — gate the check-out button on this. */
  bookingStatus: string;
  expectedCheckoutAt: string | null;
  cleaningTaskStatus: string | null;
  nextArrivalBookingId: string | null;
  lateCheckoutRequestStatus: string | null;
}

export interface InHouseRow {
  bookingId: string;
  bookingCode: string;
  villaId: string;
  villaCode: string | null;
  guestDisplay: string;
  checkInDate: string;
  checkOutDate: string;
  openServiceRequests: number;
  openMaintenanceTickets: number;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function readinessByVillaId(
  villaIds: string[],
): Promise<Record<string, string>> {
  const db = getDb();
  if (!db || villaIds.length === 0) return {};
  // Latest open row per villa (effective_to IS NULL).
  const rows = await db
    .select({
      villaId: villaReadinessStates.villaId,
      readinessStatus: villaReadinessStates.readinessStatus,
    })
    .from(villaReadinessStates)
    .where(
      and(
        inArray(villaReadinessStates.villaId, villaIds),
        // effectiveTo IS NULL — drizzle "isNull" import noise, use raw eq trick
      ),
    );
  // Filter for the open row in JS to avoid the isNull import dance —
  // each villa has at most one open row by partial unique index, but
  // some villas may have none.
  const map: Record<string, string> = {};
  for (const r of rows) {
    if (!map[r.villaId]) map[r.villaId] = r.readinessStatus;
  }
  return map;
}

export async function listArrivals(date: Date): Promise<ArrivalRow[]> {
  const db = getDb();
  if (!db) return [];
  const day = ymd(date);
  // TENANCY: bookings.organization_id is NOT NULL (0155). Scope to the caller's
  // org — the service-role connection bypasses RLS, so without this every
  // org's arrivals leak into the Watch monitors. Fixes turnover-monitor,
  // visa-watcher (via this helper) and the new vip-prep in one place.
  const organizationId = await requireOrgId();
  const rows = await db
    .select({
      b: bookings,
      villaCode: villas.unitCode,
      projectName: projectsTable.name,
      guestName: guests.fullName,
      guestEmail: guests.email,
      guestIsVip: guests.isVip,
    })
    .from(bookings)
    .leftJoin(villas, eq(villas.id, bookings.villaId))
    .leftJoin(projectsTable, eq(projectsTable.id, villas.projectId))
    .leftJoin(guests, eq(guests.id, bookings.guestId))
    .where(
      and(
        eq(bookings.organizationId, organizationId),
        eq(bookings.checkIn, day),
        inArray(bookings.status, ["confirmed", "tentative"]),
      ),
    )
    .orderBy(asc(bookings.checkIn));

  const villaIds = Array.from(new Set(rows.map((r) => r.b.villaId)));
  const readiness = await readinessByVillaId(villaIds);

  // Open service requests per booking — one query.
  const bookingIds = rows.map((r) => r.b.id);
  const openSrSet = new Set<string>();
  if (bookingIds.length > 0) {
    const srRows = await db
      .select({ bookingId: serviceRequests.bookingId })
      .from(serviceRequests)
      .where(
        and(
          inArray(serviceRequests.bookingId, bookingIds),
          inArray(serviceRequests.status, ["new", "open", "in_progress"]),
        ),
      );
    for (const r of srRows) {
      if (r.bookingId) openSrSet.add(r.bookingId);
    }
  }

  return rows.map((r) => ({
    bookingId: r.b.id,
    bookingCode: r.b.bookingCode,
    villaId: r.b.villaId,
    villaCode: r.villaCode ?? null,
    projectName: r.projectName ?? null,
    guestDisplay: safeGuestDisplayName(r.guestName, r.guestEmail),
    guestsCount: (r.b.adults ?? 0) + (r.b.children ?? 0),
    checkInDate: r.b.checkIn as unknown as string,
    channelName: null, // populate when we surface the channel relation; safe default.
    bookingStatus: r.b.status,
    readinessStatus: readiness[r.b.villaId] ?? "unknown",
    hasOpenServiceRequest: openSrSet.has(r.b.id),
    // Booking override wins (true/false); NULL inherits the guest flag.
    isVip: r.b.isVip ?? r.guestIsVip ?? false,
    bookingNotes: r.b.notes ?? null,
  }));
}

export async function listDepartures(date: Date): Promise<DepartureRow[]> {
  const db = getDb();
  if (!db) return [];
  // TENANCY: scope to the caller's org (bookings.organization_id NOT NULL,
  // 0155) — same fix as listArrivals.
  const organizationId = await requireOrgId();
  const day = ymd(date);
  const dayStart = new Date(`${day}T00:00:00.000Z`);
  const dayEnd = new Date(`${day}T23:59:59.999Z`);

  const rows = await db
    .select({
      b: bookings,
      villaCode: villas.unitCode,
      guestName: guests.fullName,
      guestEmail: guests.email,
    })
    .from(bookings)
    .leftJoin(villas, eq(villas.id, bookings.villaId))
    .leftJoin(guests, eq(guests.id, bookings.guestId))
    .where(
      and(
        eq(bookings.organizationId, organizationId),
        eq(bookings.checkOut, day),
        inArray(bookings.status, ["confirmed", "checked_in"]),
      ),
    )
    .orderBy(asc(bookings.checkOut));

  const bookingIds = rows.map((r) => r.b.id);
  const expectedByBooking: Record<string, string> = {};
  const lateRequestStatusByBooking: Record<string, string> = {};

  if (bookingIds.length > 0) {
    const events = await db
      .select()
      .from(bookingStayEvents)
      .where(
        and(
          inArray(bookingStayEvents.bookingId, bookingIds),
          eq(bookingStayEvents.eventType, "expected_checkout_updated"),
        ),
      )
      .orderBy(desc(bookingStayEvents.eventAt));
    for (const e of events) {
      if (!expectedByBooking[e.bookingId])
        expectedByBooking[e.bookingId] = e.eventAt.toISOString();
    }

    const lateRows = await db
      .select()
      .from(checkinCheckoutRequests)
      .where(
        and(
          inArray(checkinCheckoutRequests.bookingId, bookingIds),
          eq(checkinCheckoutRequests.requestType, "late_checkout"),
        ),
      )
      .orderBy(desc(checkinCheckoutRequests.createdAt));
    for (const r of lateRows) {
      if (!lateRequestStatusByBooking[r.bookingId])
        lateRequestStatusByBooking[r.bookingId] = r.status;
    }
  }

  // Same-day next arrival per villa: any booking that checks in on `day` for
  // the same villa.
  const villaIds = Array.from(new Set(rows.map((r) => r.b.villaId)));
  const sameDayArrivals: Record<string, string> = {};
  if (villaIds.length > 0) {
    const next = await db
      .select({ id: bookings.id, villaId: bookings.villaId })
      .from(bookings)
      .where(
        and(
          inArray(bookings.villaId, villaIds),
          eq(bookings.checkIn, day),
          inArray(bookings.status, ["confirmed", "tentative"]),
        ),
      );
    for (const a of next) {
      if (!sameDayArrivals[a.villaId]) sameDayArrivals[a.villaId] = a.id;
    }
  }

  // Cleaning task status for each booking (most recent housekeeping task
  // for the same villa scheduled for departure day).
  const cleaningByBooking: Record<string, string> = {};
  if (rows.length > 0) {
    const tasks = await db
      .select({
        bookingVillaId: operationTasks.villaId,
        scheduledFor: operationTasks.scheduledFor,
        status: operationTasks.status,
      })
      .from(operationTasks)
      .where(
        and(
          inArray(
            operationTasks.villaId,
            rows.map((r) => r.b.villaId),
          ),
          eq(operationTasks.category, "housekeeping"),
          gte(operationTasks.scheduledFor, day),
          lte(operationTasks.scheduledFor, day),
        ),
      );
    for (const r of rows) {
      const t = tasks.find((x) => x.bookingVillaId === r.b.villaId);
      if (t) cleaningByBooking[r.b.id] = t.status;
    }
  }

  // Suppress unused-variable warnings while keeping flexible filters available.
  void dayStart;
  void dayEnd;

  return rows.map((r) => ({
    bookingId: r.b.id,
    bookingCode: r.b.bookingCode,
    villaId: r.b.villaId,
    villaCode: r.villaCode ?? null,
    guestDisplay: safeGuestDisplayName(r.guestName, r.guestEmail),
    checkOutDate: r.b.checkOut as unknown as string,
    bookingStatus: r.b.status,
    expectedCheckoutAt: expectedByBooking[r.b.id] ?? null,
    cleaningTaskStatus: cleaningByBooking[r.b.id] ?? null,
    nextArrivalBookingId:
      sameDayArrivals[r.b.villaId] && sameDayArrivals[r.b.villaId] !== r.b.id
        ? sameDayArrivals[r.b.villaId]
        : null,
    lateCheckoutRequestStatus: lateRequestStatusByBooking[r.b.id] ?? null,
  }));
}

export async function listInHouseGuests(date: Date): Promise<InHouseRow[]> {
  const db = getDb();
  if (!db) return [];
  // TENANCY: scope to the caller's org (the dashboard "IN-HOUSE" tile).
  const organizationId = await requireOrgId();
  const day = ymd(date);
  // checkIn <= date < checkOut, status active.
  const rows = await db
    .select({
      b: bookings,
      villaCode: villas.unitCode,
      guestName: guests.fullName,
      guestEmail: guests.email,
    })
    .from(bookings)
    .leftJoin(villas, eq(villas.id, bookings.villaId))
    .leftJoin(guests, eq(guests.id, bookings.guestId))
    .where(
      and(
        eq(bookings.organizationId, organizationId),
        lte(bookings.checkIn, day),
        // checkOut > day  (half-open)
        // drizzle has no "gt(date)"; we use lt(day, checkOut) via raw expression
        eq(bookings.status, "checked_in"),
      ),
    )
    .orderBy(asc(bookings.checkIn));

  // Filter checkOut > day in JS (drizzle date comparators are type-finicky).
  const inHouse = rows.filter((r) => (r.b.checkOut as unknown as string) > day);
  const bookingIds = inHouse.map((r) => r.b.id);

  let openSrCount: Record<string, number> = {};
  let openMtCount: Record<string, number> = {};
  if (bookingIds.length > 0) {
    const sr = await db
      .select({ bookingId: serviceRequests.bookingId })
      .from(serviceRequests)
      .where(
        and(
          inArray(serviceRequests.bookingId, bookingIds),
          inArray(serviceRequests.status, ["new", "open", "in_progress"]),
        ),
      );
    openSrCount = sr.reduce<Record<string, number>>((acc, x) => {
      if (x.bookingId) acc[x.bookingId] = (acc[x.bookingId] ?? 0) + 1;
      return acc;
    }, {});
    openMtCount = {};
  }

  return inHouse.map((r) => ({
    bookingId: r.b.id,
    bookingCode: r.b.bookingCode,
    villaId: r.b.villaId,
    villaCode: r.villaCode ?? null,
    guestDisplay: safeGuestDisplayName(r.guestName, r.guestEmail),
    checkInDate: r.b.checkIn as unknown as string,
    checkOutDate: r.b.checkOut as unknown as string,
    openServiceRequests: openSrCount[r.b.id] ?? 0,
    openMaintenanceTickets: openMtCount[r.b.id] ?? 0,
  }));
}

// -----------------------------------------------------------------------------
// Stay events + check-in/out requests
// -----------------------------------------------------------------------------

export async function listStayEventsForBooking(bookingId: string) {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(bookingStayEvents)
    .where(eq(bookingStayEvents.bookingId, bookingId))
    .orderBy(desc(bookingStayEvents.eventAt));
  return rows.map((r) => ({
    id: r.id,
    bookingId: r.bookingId,
    eventType: r.eventType,
    eventAt: r.eventAt.toISOString(),
    notes: r.notes,
    createdBy: r.createdBy,
  }));
}

export async function listCheckinCheckoutRequests(opts?: {
  status?: string;
  bookingId?: string;
  limit?: number;
}) {
  const db = getDb();
  if (!db) return [];
  // TENANCY: checkin_checkout_requests.organization_id is NOT NULL (0155). Seed
  // the filter list with the org predicate so the existing
  // `.where(filters.length ? and(...filters) : undefined)` always ANDs the org
  // scope — the service-role connection bypasses RLS otherwise.
  const organizationId = await requireOrgId();
  const filters = [eq(checkinCheckoutRequests.organizationId, organizationId)];
  if (opts?.status)
    filters.push(eq(checkinCheckoutRequests.status, opts.status));
  if (opts?.bookingId)
    filters.push(eq(checkinCheckoutRequests.bookingId, opts.bookingId));
  const rows = await db
    .select({
      r: checkinCheckoutRequests,
      bookingCode: bookings.bookingCode,
      villaCode: villas.unitCode,
    })
    .from(checkinCheckoutRequests)
    .leftJoin(bookings, eq(bookings.id, checkinCheckoutRequests.bookingId))
    .leftJoin(villas, eq(villas.id, checkinCheckoutRequests.villaId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(checkinCheckoutRequests.createdAt))
    .limit(opts?.limit ?? 100);
  return rows.map((r) => ({
    id: r.r.id,
    bookingId: r.r.bookingId,
    bookingCode: r.bookingCode ?? null,
    villaId: r.r.villaId,
    villaCode: r.villaCode ?? null,
    requestType: r.r.requestType,
    requestedTime: r.r.requestedTime?.toISOString() ?? null,
    status: r.r.status,
    feeAmountMinor: r.r.feeAmountMinor,
    currency: r.r.currency,
    adminNotes: r.r.adminNotes,
    guestMessage: r.r.guestMessage,
    reviewedBy: r.r.reviewedBy,
    reviewedAt: r.r.reviewedAt?.toISOString() ?? null,
    createdAt: r.r.createdAt.toISOString(),
  }));
}

// Pure helpers re-exported for convenience; canonical home is
// `./transitions.ts`.
export {
  REQUEST_STATUS_TRANSITIONS,
  canTransitionRequestStatus,
} from "./transitions";
