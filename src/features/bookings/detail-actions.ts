"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { bookings } from "@/lib/db/schema/bookings";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { canManageEntity } from "@/features/auth/permissions";
import type { ActionResult } from "@/features/projects/actions";

/**
 * Update the free-text notes on a booking. Drives the detail-page notes
 * editor + its sticky "unsaved edit" bar; the edit is audit-trailed so it
 * also shows on the Activity tab as a `booking.update` event.
 */
export async function updateBookingNotesAction(
  bookingId: string,
  notes: string,
): Promise<ActionResult> {
  if (!(await canManageEntity("booking"))) {
    return { ok: false, error: "Not authorised." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const clean = notes.trim().slice(0, 2000);

  const [before] = await db
    .select({ notes: bookings.notes })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!before) return { ok: false, error: "Booking not found." };

  const next = clean === "" ? null : clean;
  if ((before.notes ?? null) === next) {
    return { ok: true };
  }

  await db
    .update(bookings)
    .set({ notes: next, updatedAt: new Date() })
    .where(eq(bookings.id, bookingId));

  const me = await getCurrentAppUser();
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "booking.update",
    entityType: "booking",
    entityId: bookingId,
    before: { notes: before.notes },
    after: { notes: next },
    metadata: { field: "notes" },
  });

  revalidatePath(`/dashboard/bookings/${bookingId}`);
  return { ok: true };
}
