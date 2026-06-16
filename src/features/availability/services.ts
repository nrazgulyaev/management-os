import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  lt,
  lte,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  villaCalendarBlocks,
  type VillaCalendarBlock,
} from "@/lib/db/schema/availability";
import { villas, projects as projectsTable } from "@/lib/db/schema/projects";
import { bookings } from "@/lib/db/schema/bookings";
import { requireOrgId } from "@/features/auth/require-org";
import {
  bookingDatesToBlockRange,
  detectConflicts,
  hasConflict,
  type CalendarBlockLike,
} from "./calendar";

// -----------------------------------------------------------------------------
// Read APIs
// -----------------------------------------------------------------------------

export interface CalendarBlockRow {
  id: string;
  villaId: string;
  villaCode: string | null;
  projectId: string | null;
  projectName: string | null;
  blockType: string;
  sourceType: string | null;
  sourceId: string | null;
  startsAt: string;
  endsAt: string;
  title: string;
  description: string | null;
  status: string;
  ownerVisible: boolean;
  guestVisible: boolean;
  createdAt: string;
}

function mapBlock(
  r: VillaCalendarBlock,
  villaCode: string | null,
  projectName: string | null,
): CalendarBlockRow {
  return {
    id: r.id,
    villaId: r.villaId,
    villaCode,
    projectId: r.projectId,
    projectName,
    blockType: r.blockType,
    sourceType: r.sourceType,
    sourceId: r.sourceId,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
    title: r.title,
    description: r.description,
    status: r.status,
    ownerVisible: r.ownerVisible,
    guestVisible: r.guestVisible,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function listVillaCalendarBlocks(opts?: {
  villaId?: string;
  projectId?: string;
  status?: string;
  blockType?: string;
  rangeStart?: Date;
  rangeEnd?: Date;
  limit?: number;
}): Promise<CalendarBlockRow[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const filters = [eq(villaCalendarBlocks.organizationId, organizationId)];
  if (opts?.villaId) filters.push(eq(villaCalendarBlocks.villaId, opts.villaId));
  if (opts?.projectId)
    filters.push(eq(villaCalendarBlocks.projectId, opts.projectId));
  if (opts?.status) filters.push(eq(villaCalendarBlocks.status, opts.status));
  if (opts?.blockType)
    filters.push(eq(villaCalendarBlocks.blockType, opts.blockType));
  if (opts?.rangeEnd)
    filters.push(lt(villaCalendarBlocks.startsAt, opts.rangeEnd));
  if (opts?.rangeStart)
    filters.push(gt(villaCalendarBlocks.endsAt, opts.rangeStart));

  const rows = await db
    .select({
      b: villaCalendarBlocks,
      villaCode: villas.unitCode,
      projectName: projectsTable.name,
    })
    .from(villaCalendarBlocks)
    .leftJoin(villas, eq(villas.id, villaCalendarBlocks.villaId))
    .leftJoin(projectsTable, eq(projectsTable.id, villaCalendarBlocks.projectId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(villaCalendarBlocks.startsAt))
    .limit(opts?.limit ?? 500);

  return rows.map((r) => mapBlock(r.b, r.villaCode ?? null, r.projectName ?? null));
}

/**
 * Pull blocks for one villa over a window — used by `getVillaAvailability`,
 * conflict detection, and the per-villa calendar UI. Returns DB rows shaped
 * for the pure helpers in `calendar.ts`.
 */
export async function loadActiveBlocksForVilla(
  villaId: string,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<CalendarBlockLike[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: villaCalendarBlocks.id,
      villaId: villaCalendarBlocks.villaId,
      blockType: villaCalendarBlocks.blockType,
      status: villaCalendarBlocks.status,
      startsAt: villaCalendarBlocks.startsAt,
      endsAt: villaCalendarBlocks.endsAt,
    })
    .from(villaCalendarBlocks)
    .where(
      and(
        eq(villaCalendarBlocks.villaId, villaId),
        eq(villaCalendarBlocks.status, "active"),
        // A row overlaps [rangeStart, rangeEnd) iff
        // row.startsAt < rangeEnd AND row.endsAt > rangeStart.
        lt(villaCalendarBlocks.startsAt, rangeEnd),
        gt(villaCalendarBlocks.endsAt, rangeStart),
      ),
    )
    .orderBy(asc(villaCalendarBlocks.startsAt));
  return rows;
}

export interface VillaAvailability {
  villaId: string;
  rangeStart: string;
  rangeEnd: string;
  available: boolean;
  conflictingBlocks: CalendarBlockLike[];
}

export async function getVillaAvailability(
  villaId: string,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<VillaAvailability> {
  const blocks = await loadActiveBlocksForVilla(villaId, rangeStart, rangeEnd);
  const conflicts = detectConflicts(blocks, {
    villaId,
    startsAt: rangeStart,
    endsAt: rangeEnd,
  });
  return {
    villaId,
    rangeStart: rangeStart.toISOString(),
    rangeEnd: rangeEnd.toISOString(),
    available: conflicts.length === 0,
    conflictingBlocks: conflicts,
  };
}

export async function detectAvailabilityConflicts(
  villaId: string,
  rangeStart: Date,
  rangeEnd: Date,
  excludeBlockId?: string,
): Promise<CalendarBlockLike[]> {
  const blocks = await loadActiveBlocksForVilla(villaId, rangeStart, rangeEnd);
  return detectConflicts(blocks, {
    villaId,
    startsAt: rangeStart,
    endsAt: rangeEnd,
    excludeBlockId,
  });
}

/**
 * List villas with no conflicting active block in [rangeStart, rangeEnd).
 * Two queries: (1) candidate villas, (2) active blocks intersecting the
 * window. Then filter in memory using the pure helper. Cheaper than a
 * NOT EXISTS subquery for the typical 50-villa portfolio.
 */
export async function listAvailableVillas(opts: {
  projectId?: string;
  rangeStart: Date;
  rangeEnd: Date;
}): Promise<
  { id: string; unitCode: string; projectId: string; projectName: string | null }[]
> {
  const db = getDb();
  if (!db) return [];

  // TENANCY — villas anchor their org via projects. Inner-join projects and
  // require the caller's org so the unfiltered base set (no projectId) can't
  // leak villas from other tenants.
  const organizationId = await requireOrgId();
  const villaFilters = [
    eq(villas.status, "active"),
    eq(projectsTable.organizationId, organizationId),
  ];
  if (opts.projectId) villaFilters.push(eq(villas.projectId, opts.projectId));

  const allVillas = await db
    .select({
      id: villas.id,
      unitCode: villas.unitCode,
      projectId: villas.projectId,
      projectName: projectsTable.name,
    })
    .from(villas)
    .innerJoin(projectsTable, eq(projectsTable.id, villas.projectId))
    .where(and(...villaFilters))
    .orderBy(asc(villas.unitCode));

  if (allVillas.length === 0) return [];

  const villaIds = allVillas.map((v) => v.id);
  const candidateBlocks = await db
    .select({
      id: villaCalendarBlocks.id,
      villaId: villaCalendarBlocks.villaId,
      blockType: villaCalendarBlocks.blockType,
      status: villaCalendarBlocks.status,
      startsAt: villaCalendarBlocks.startsAt,
      endsAt: villaCalendarBlocks.endsAt,
    })
    .from(villaCalendarBlocks)
    .where(
      and(
        inArray(villaCalendarBlocks.villaId, villaIds),
        eq(villaCalendarBlocks.status, "active"),
        lt(villaCalendarBlocks.startsAt, opts.rangeEnd),
        gt(villaCalendarBlocks.endsAt, opts.rangeStart),
      ),
    );

  return allVillas
    .filter(
      (v) =>
        !hasConflict(candidateBlocks, {
          villaId: v.id,
          startsAt: opts.rangeStart,
          endsAt: opts.rangeEnd,
        }),
    )
    .map((v) => ({
      id: v.id,
      unitCode: v.unitCode,
      projectId: v.projectId,
      projectName: v.projectName ?? null,
    }));
}

// -----------------------------------------------------------------------------
// Booking sync — keeps a `guest_booking` block in lockstep with the booking.
// -----------------------------------------------------------------------------

export interface BookingSyncOutcome {
  blockId: string | null;
  action: "created" | "updated" | "cancelled" | "skipped";
  reason?: string;
}

const BOOKING_INACTIVE_STATUSES = new Set(["cancelled", "no_show"]);

/**
 * Materialise (or update / cancel) the `guest_booking` calendar block for
 * a booking. Idempotent. Cancelled bookings flip the existing block to
 * `cancelled` so the partial-unique source index lets a new active row
 * be created if the same `source_id` ever recurs.
 */
export async function syncBookingCalendarBlock(
  bookingId: string,
  actorUserId: string | null = null,
): Promise<BookingSyncOutcome> {
  const db = getDb();
  if (!db) return { blockId: null, action: "skipped", reason: "no db" };

  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!booking) return { blockId: null, action: "skipped", reason: "no booking" };

  // Find any existing block (active or cancelled) bound to this booking.
  const [existing] = await db
    .select()
    .from(villaCalendarBlocks)
    .where(
      and(
        eq(villaCalendarBlocks.sourceType, "booking"),
        eq(villaCalendarBlocks.sourceId, booking.id),
      ),
    )
    .orderBy(desc(villaCalendarBlocks.createdAt))
    .limit(1);

  if (BOOKING_INACTIVE_STATUSES.has(booking.status)) {
    if (existing && existing.status === "active") {
      await db
        .update(villaCalendarBlocks)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(villaCalendarBlocks.id, existing.id));
      return { blockId: existing.id, action: "cancelled" };
    }
    return { blockId: existing?.id ?? null, action: "skipped", reason: "booking inactive" };
  }

  const { startsAt, endsAt } = bookingDatesToBlockRange(
    booking.checkIn as unknown as string,
    booking.checkOut as unknown as string,
  );
  const title = `Booking ${booking.bookingCode}`;
  const villaId = booking.villaId;
  const [villaRow] = await db
    .select({ projectId: villas.projectId })
    .from(villas)
    .where(eq(villas.id, villaId))
    .limit(1);

  if (existing) {
    await db
      .update(villaCalendarBlocks)
      .set({
        villaId,
        projectId: villaRow?.projectId ?? null,
        blockType: "guest_booking",
        startsAt,
        endsAt,
        title,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(villaCalendarBlocks.id, existing.id));
    return { blockId: existing.id, action: "updated" };
  }

  const [inserted] = await db
    .insert(villaCalendarBlocks)
    .values({
      organizationId: booking.organizationId,
      villaId,
      projectId: villaRow?.projectId ?? null,
      blockType: "guest_booking",
      sourceType: "booking",
      sourceId: booking.id,
      startsAt,
      endsAt,
      title,
      status: "active",
      ownerVisible: false,
      guestVisible: false,
      createdBy: actorUserId,
    })
    .returning({ id: villaCalendarBlocks.id });
  return { blockId: inserted!.id, action: "created" };
}

// -----------------------------------------------------------------------------
// Re-exports for action layer
// -----------------------------------------------------------------------------

export {
  detectConflicts,
  hasConflict,
  isBlockingType,
  bookingDatesToBlockRange,
} from "./calendar";

// -----------------------------------------------------------------------------
// Owner-safe calendar projection (read-only). NOT routed yet — this is the
// shape we'll expose to /owner once owner-stay UX lands. Filters to
// `owner_visible = true` and strips guest detail. Internal-only callers can
// still use this as a baseline.
// -----------------------------------------------------------------------------

export interface OwnerSafeCalendarBlock {
  id: string;
  villaId: string;
  blockType: string;
  startsAt: string;
  endsAt: string;
  title: string;
}

export async function listOwnerSafeCalendarBlocks(opts: {
  villaIds: string[];
  rangeStart: Date;
  rangeEnd: Date;
}): Promise<OwnerSafeCalendarBlock[]> {
  const db = getDb();
  if (!db || opts.villaIds.length === 0) return [];
  const rows = await db
    .select({
      id: villaCalendarBlocks.id,
      villaId: villaCalendarBlocks.villaId,
      blockType: villaCalendarBlocks.blockType,
      startsAt: villaCalendarBlocks.startsAt,
      endsAt: villaCalendarBlocks.endsAt,
    })
    .from(villaCalendarBlocks)
    .where(
      and(
        inArray(villaCalendarBlocks.villaId, opts.villaIds),
        eq(villaCalendarBlocks.status, "active"),
        eq(villaCalendarBlocks.ownerVisible, true),
        lt(villaCalendarBlocks.startsAt, opts.rangeEnd),
        gt(villaCalendarBlocks.endsAt, opts.rangeStart),
      ),
    );
  return rows.map((r) => ({
    id: r.id,
    villaId: r.villaId,
    blockType: r.blockType,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
    // Generic title — we never leak the booking title to the owner surface.
    title:
      r.blockType === "guest_booking"
        ? "Guest stay"
        : r.blockType === "owner_stay"
          ? "Owner stay"
          : r.blockType.replace(/_/g, " "),
  }));
}

// Keep unused-import warnings quiet for `notInArray`, `lte`, `gte`, `or`, `sql` —
// re-export so future call sites can use them without pulling drizzle-orm
// directly.
export const _drizzleHelpers = { notInArray, lte, gte, or, sql };
