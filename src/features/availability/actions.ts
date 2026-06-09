"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { villaCalendarBlocks } from "@/lib/db/schema/availability";
import { villas } from "@/lib/db/schema/projects";
import { bookings } from "@/lib/db/schema/bookings";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import {
  assignBookingToVillaSchema,
  cancelCalendarBlockSchema,
  createCalendarBlockSchema,
} from "./schema";
import {
  detectAvailabilityConflicts,
  syncBookingCalendarBlock,
} from "./services";
import type { ActionResult } from "@/features/projects/actions";

export async function createVillaCalendarBlockAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { blockId?: string }> {
  await requirePermission("availability.write");
  const raw = Object.fromEntries(formData.entries());
  // Booleans arrive as "on" / undefined; normalise.
  const normalised = {
    ...raw,
    ownerVisible: raw.ownerVisible === "on" || raw.ownerVisible === "true",
    guestVisible: raw.guestVisible === "on" || raw.guestVisible === "true",
    projectId: raw.projectId || null,
    description: raw.description || null,
  };
  const parsed = createCalendarBlockSchema.safeParse(normalised);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const organizationId = await requireOrgId();

  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = new Date(parsed.data.endsAt);
  const conflicts = await detectAvailabilityConflicts(
    parsed.data.villaId,
    startsAt,
    endsAt,
  );
  if (conflicts.length > 0) {
    return {
      ok: false,
      error: `Conflicts with ${conflicts.length} existing block(s).`,
    };
  }

  // Resolve project_id from the villa if not supplied.
  let projectId = parsed.data.projectId ?? null;
  if (!projectId) {
    const [v] = await db
      .select({ projectId: villas.projectId })
      .from(villas)
      .where(eq(villas.id, parsed.data.villaId))
      .limit(1);
    projectId = v?.projectId ?? null;
  }

  const [row] = await db
    .insert(villaCalendarBlocks)
    .values({
      organizationId,
      villaId: parsed.data.villaId,
      projectId,
      blockType: parsed.data.blockType,
      sourceType: "manual",
      sourceId: null,
      startsAt,
      endsAt,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      status: "active",
      ownerVisible: parsed.data.ownerVisible ?? false,
      guestVisible: parsed.data.guestVisible ?? false,
      createdBy: me?.id ?? null,
    })
    .returning({ id: villaCalendarBlocks.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "availability.block.create",
    entityType: "villa_calendar_block",
    entityId: row!.id,
    after: {
      villaId: parsed.data.villaId,
      blockType: parsed.data.blockType,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
    },
  });

  revalidatePath("/dashboard/availability");
  revalidatePath("/dashboard/availability/blocks");
  return { ok: true, blockId: row!.id };
}

export async function cancelVillaCalendarBlockAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("availability.write");
  const parsed = cancelCalendarBlockSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: "Missing block id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();

  const [before] = await db
    .select()
    .from(villaCalendarBlocks)
    .where(eq(villaCalendarBlocks.id, parsed.data.id))
    .limit(1);
  if (!before) return { ok: false, error: "Block not found." };
  if (before.sourceType === "booking") {
    return {
      ok: false,
      error:
        "Booking-sourced blocks cannot be cancelled directly — cancel the booking instead.",
    };
  }
  if (before.status !== "active") {
    return { ok: false, error: `Block is already ${before.status}.` };
  }

  await db
    .update(villaCalendarBlocks)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(villaCalendarBlocks.id, parsed.data.id));

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "availability.block.cancel",
    entityType: "villa_calendar_block",
    entityId: parsed.data.id,
    before: { status: before.status },
    after: { status: "cancelled" },
  });

  revalidatePath("/dashboard/availability");
  revalidatePath("/dashboard/availability/blocks");
  return { ok: true };
}

/**
 * Re-point a booking to a different villa. Validates that the target
 * villa is free for the booking's check-in/check-out, then updates the
 * booking and re-syncs its calendar block.
 */
export async function assignBookingToVillaAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("front_office.write");
  const parsed = assignBookingToVillaSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) return { ok: false, error: "Missing booking or villa id." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();

  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, parsed.data.bookingId))
    .limit(1);
  if (!booking) return { ok: false, error: "Booking not found." };

  const startsAt = new Date(`${booking.checkIn as unknown as string}T00:00:00.000Z`);
  const endsAt = new Date(`${booking.checkOut as unknown as string}T00:00:00.000Z`);
  // We pass the booking's *current* block id (if any) as exclude so re-pointing
  // back to the same villa doesn't fight itself.
  const conflicts = await detectAvailabilityConflicts(
    parsed.data.villaId,
    startsAt,
    endsAt,
  );
  if (conflicts.length > 0) {
    return {
      ok: false,
      error: `Target villa has ${conflicts.length} conflicting block(s).`,
    };
  }

  await db
    .update(bookings)
    .set({ villaId: parsed.data.villaId, updatedAt: new Date() })
    .where(eq(bookings.id, parsed.data.bookingId));

  // Re-sync — the existing block (if any) gets updated to the new villa.
  await syncBookingCalendarBlock(parsed.data.bookingId, me?.id ?? null);

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "front_office.booking.reassign_villa",
    entityType: "booking",
    entityId: parsed.data.bookingId,
    before: { villaId: booking.villaId },
    after: { villaId: parsed.data.villaId },
  });

  revalidatePath("/dashboard/front-office");
  revalidatePath("/dashboard/availability");
  return { ok: true };
}
