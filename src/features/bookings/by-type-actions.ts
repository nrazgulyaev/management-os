"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { differenceInCalendarDays } from "date-fns";
import { getDb } from "@/lib/db/client";
import { bookings } from "@/lib/db/schema/bookings";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { canManageEntity } from "@/features/auth/permissions";
import { assertHoldDatesStillAvailable } from "@/features/direct-booking/availability";
import { listAvailableVillaTypes, type AvailableVillaType } from "./type-availability";
import type { ActionResult } from "@/features/projects/actions";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Client-callable: villa types with a free unit for the window. */
export async function getAvailableVillaTypesAction(
  checkIn: string,
  checkOut: string,
): Promise<AvailableVillaType[]> {
  if (!(await canManageEntity("booking"))) return [];
  if (!ISO.test(checkIn) || !ISO.test(checkOut)) return [];
  if (new Date(checkOut) <= new Date(checkIn)) return [];
  return listAvailableVillaTypes(checkIn, checkOut);
}

const schema = z.object({
  assetTypeId: z.string().uuid("Pick a villa type"),
  checkIn: z.string().date(),
  checkOut: z.string().date(),
  guestName: z.string().max(160).optional().or(z.literal("")),
  channelId: z.string().uuid().optional().or(z.literal("")),
  currency: z.string().length(3).toUpperCase().default("USD"),
  grossAmount: z.coerce.number().min(0).max(1_000_000),
  adults: z.coerce.number().int().min(0).max(40).optional(),
  children: z.coerce.number().int().min(0).max(20).optional(),
});

/**
 * Create a booking by TYPE: auto-assign the first free villa of the chosen
 * type for the dates, re-checking availability atomically before insert.
 */
export async function createBookingByTypeAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await canManageEntity("booking"))) {
    return { ok: false, error: "Not authorised." };
  }
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const d = parsed.data;
  const nights = differenceInCalendarDays(new Date(d.checkOut), new Date(d.checkIn));
  if (nights <= 0) return { ok: false, error: "Check-out must be after check-in." };

  // Re-resolve free villas of that type NOW (don't trust a stale client list).
  const types = await listAvailableVillaTypes(d.checkIn, d.checkOut);
  const t = types.find((x) => x.assetTypeId === d.assetTypeId);
  if (!t || t.freeVillaIds.length === 0) {
    const msg = "No free villa of that type for those dates — pick another type or dates.";
    return { ok: false, error: msg, fieldErrors: { assetTypeId: [msg] } };
  }
  const villaId = t.freeVillaIds[0];

  // Final overlap guard on the picked unit (race-safe-ish).
  const avail = await assertHoldDatesStillAvailable(villaId, d.checkIn, d.checkOut);
  if (!avail.available) {
    return { ok: false, error: "That villa was just taken — try again." };
  }

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const code = `BK-${Date.now().toString(36).toUpperCase().slice(-6)}`;

  let id: string;
  try {
    const [row] = await db
      .insert(bookings)
      .values({
        villaId,
        channelId: d.channelId && d.channelId !== "" ? d.channelId : null,
        bookingCode: code,
        status: "confirmed",
        checkIn: d.checkIn,
        checkOut: d.checkOut,
        nights,
        adults: d.adults ?? null,
        children: d.children ?? null,
        currency: d.currency,
        grossAmount: String(d.grossAmount),
        cleaningFeeAmount: "0",
        channelFeeAmount: "0",
        paymentFeeAmount: "0",
        netExpectedAmount: String(d.grossAmount),
        notes: d.guestName && d.guestName !== "" ? d.guestName : null,
      })
      .returning({ id: bookings.id });
    id = row.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Insert failed";
    return {
      ok: false,
      error: msg.includes("unique") ? "Booking code collided — try again." : msg,
    };
  }

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "booking.create",
    entityType: "booking",
    entityId: id,
    after: {
      villaId,
      assetTypeId: d.assetTypeId,
      autoAssigned: true,
      nights,
      checkIn: d.checkIn,
      checkOut: d.checkOut,
    },
  });

  revalidatePath("/dashboard/bookings");
  redirect(`/dashboard/bookings/${id}`);
}
