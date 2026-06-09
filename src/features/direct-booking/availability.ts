import "server-only";

import { and, eq, gte, lte, ne, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { villaCalendarBlocks } from "@/lib/db/schema/availability";
import {
  directBookingHolds,
  type DirectBookingHold,
} from "@/lib/db/schema/direct-booking";
import { villas, projects } from "@/lib/db/schema/projects";
import { bookings } from "@/lib/db/schema/bookings";

/**
 * Direct-booking availability helpers — bridge between the hold layer
 * and the canonical `villa_calendar_blocks` primitive.
 *
 * Source-of-truth pattern:
 *   `villa_calendar_blocks.block_type = 'internal_hold'`
 *   `villa_calendar_blocks.source_type = 'direct_booking_hold'`
 *   `villa_calendar_blocks.source_id   = direct_booking_holds.id`
 */

export interface AvailabilityCheck {
  available: boolean;
  reason: "available" | "booking_conflict" | "block_conflict" | "hold_conflict";
}

/**
 * Pure-ish: given a `[checkIn, checkOut)` window for a villa, return
 * whether the dates are still bookable. Considers:
 *   - existing bookings (excludes cancelled / no_show)
 *   - existing active calendar blocks (any type)
 *   - existing active holds whose calendar block we exclude via
 *     `excludeHoldId`
 */
export async function assertHoldDatesStillAvailable(
  villaId: string,
  checkIn: string,
  checkOut: string,
  excludeHoldId?: string,
): Promise<AvailabilityCheck> {
  const db = getDb();
  if (!db) return { available: true, reason: "available" };
  const startsAt = new Date(`${checkIn}T00:00:00.000Z`);
  const endsAt = new Date(`${checkOut}T00:00:00.000Z`);

  // Bookings overlap (half-open).
  const conflictBookings = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        eq(bookings.villaId, villaId),
        sql`${bookings.checkOut} > ${checkIn}`,
        sql`${bookings.checkIn} < ${checkOut}`,
        sql`${bookings.status} NOT IN ('cancelled','no_show')`,
      ),
    )
    .limit(1);
  if (conflictBookings.length > 0) {
    return { available: false, reason: "booking_conflict" };
  }

  const conflictBlocks = await db
    .select({
      id: villaCalendarBlocks.id,
      sourceType: villaCalendarBlocks.sourceType,
      sourceId: villaCalendarBlocks.sourceId,
    })
    .from(villaCalendarBlocks)
    .where(
      and(
        eq(villaCalendarBlocks.villaId, villaId),
        eq(villaCalendarBlocks.status, "active"),
        lte(villaCalendarBlocks.startsAt, endsAt),
        gte(villaCalendarBlocks.endsAt, startsAt),
      ),
    );

  for (const b of conflictBlocks) {
    // If this block belongs to the same hold we're checking — ignore.
    if (
      excludeHoldId &&
      b.sourceType === "direct_booking_hold" &&
      b.sourceId === excludeHoldId
    ) {
      continue;
    }
    return {
      available: false,
      reason:
        b.sourceType === "direct_booking_hold"
          ? "hold_conflict"
          : "block_conflict",
    };
  }

  return { available: true, reason: "available" };
}

/**
 * Insert (or refresh) an `internal_hold` calendar block for this hold
 * row. Idempotent: looks for an existing block by `(source_type,
 * source_id)` and updates it instead of creating a duplicate.
 */
export async function createInternalHoldBlockForDirectHold(
  holdId: string,
  actorAppUserId: string | null = null,
): Promise<{ blockId: string | null }> {
  const db = getDb();
  if (!db) return { blockId: null };
  const [hold] = await db
    .select()
    .from(directBookingHolds)
    .where(eq(directBookingHolds.id, holdId))
    .limit(1);
  if (!hold) return { blockId: null };
  const [villa] = await db
    .select({
      projectId: villas.projectId,
      organizationId: projects.organizationId,
    })
    .from(villas)
    .leftJoin(projects, eq(projects.id, villas.projectId))
    .where(eq(villas.id, hold.villaId))
    .limit(1);
  const startsAt = new Date(`${hold.checkIn}T00:00:00.000Z`);
  const endsAt = new Date(`${hold.checkOut}T00:00:00.000Z`);
  const [existing] = await db
    .select()
    .from(villaCalendarBlocks)
    .where(
      and(
        eq(villaCalendarBlocks.sourceType, "direct_booking_hold"),
        eq(villaCalendarBlocks.sourceId, hold.id),
      ),
    )
    .limit(1);
  if (existing) {
    await db
      .update(villaCalendarBlocks)
      .set({
        startsAt,
        endsAt,
        status: "active",
        title: "Direct booking hold",
        description: hold.holdCode,
        updatedAt: new Date(),
      })
      .where(eq(villaCalendarBlocks.id, existing.id));
    return { blockId: existing.id };
  }
  const [inserted] = await db
    .insert(villaCalendarBlocks)
    .values({
      organizationId: villa?.organizationId ?? null,
      villaId: hold.villaId,
      projectId: villa?.projectId ?? null,
      blockType: "internal_hold",
      sourceType: "direct_booking_hold",
      sourceId: hold.id,
      startsAt,
      endsAt,
      title: "Direct booking hold",
      description: hold.holdCode,
      status: "active",
      ownerVisible: false,
      guestVisible: false,
      createdBy: actorAppUserId,
    })
    .returning({ id: villaCalendarBlocks.id });
  return { blockId: inserted?.id ?? null };
}

/**
 * Mark the hold's calendar block as `released` (status='released') so
 * the availability merger no longer counts it. We DO NOT hard-delete
 * the row — it stays for audit.
 */
export async function releaseInternalHoldBlockForDirectHold(
  holdId: string,
): Promise<{ released: boolean }> {
  const db = getDb();
  if (!db) return { released: false };
  const result = await db
    .update(villaCalendarBlocks)
    .set({ status: "released", updatedAt: new Date() })
    .where(
      and(
        eq(villaCalendarBlocks.sourceType, "direct_booking_hold"),
        eq(villaCalendarBlocks.sourceId, holdId),
        ne(villaCalendarBlocks.status, "released"),
      ),
    )
    .returning({ id: villaCalendarBlocks.id });
  return { released: result.length > 0 };
}

/**
 * Pure-ish helper: keep the calendar block in sync with the hold's
 * current status. Active → active block; otherwise → released.
 */
export async function syncHoldStatusToCalendarBlock(
  holdId: string,
): Promise<void> {
  const db = getDb();
  if (!db) return;
  const [hold] = await db
    .select()
    .from(directBookingHolds)
    .where(eq(directBookingHolds.id, holdId))
    .limit(1);
  if (!hold) return;
  if (hold.status === "active" || hold.status === "converted") {
    // Keep block active for active holds; converted holds keep the
    // block until the booking creates its own `guest_booking` block.
    await createInternalHoldBlockForDirectHold(holdId);
    return;
  }
  await releaseInternalHoldBlockForDirectHold(holdId);
}

/** Pure helper: extract villa id and dates from a hold row. */
export function holdWindow(hold: DirectBookingHold): {
  startsAt: Date;
  endsAt: Date;
} {
  return {
    startsAt: new Date(`${hold.checkIn}T00:00:00.000Z`),
    endsAt: new Date(`${hold.checkOut}T00:00:00.000Z`),
  };
}
