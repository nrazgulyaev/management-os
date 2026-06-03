"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { differenceInCalendarDays } from "date-fns";
import { getDb } from "@/lib/db/client";
import { bookings } from "@/lib/db/schema/bookings";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { canManageEntity } from "@/features/auth/permissions";
import { bookingStatusEnum, createBookingSchema } from "./schema";
import type { ActionResult } from "@/features/projects/actions";

const idSchema = z.string().uuid();

export async function createBookingAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await canManageEntity("booking"))) {
    return { ok: false, error: "Not authorised." };
  }
  const parsed = createBookingSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form and correct the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const d = parsed.data;
  const nights = differenceInCalendarDays(new Date(d.checkOut), new Date(d.checkIn));
  if (nights <= 0) return { ok: false, error: "Check-out must be after check-in." };
  const me = await getCurrentAppUser();
  const netExpected =
    d.grossAmount + d.cleaningFeeAmount - d.channelFeeAmount - d.paymentFeeAmount;

  let id: string;
  try {
    const [row] = await db
      .insert(bookings)
      .values({
        villaId: d.villaId,
        channelId: d.channelId && d.channelId !== "" ? d.channelId : null,
        guestId: d.guestId && d.guestId !== "" ? d.guestId : null,
        bookingCode: d.bookingCode,
        sourceReference: d.sourceReference && d.sourceReference !== "" ? d.sourceReference : null,
        status: d.status,
        checkIn: d.checkIn,
        checkOut: d.checkOut,
        nights,
        adults: d.adults ?? null,
        children: d.children ?? null,
        currency: d.currency,
        grossAmount: String(d.grossAmount),
        cleaningFeeAmount: String(d.cleaningFeeAmount),
        channelFeeAmount: String(d.channelFeeAmount),
        paymentFeeAmount: String(d.paymentFeeAmount),
        netExpectedAmount: String(netExpected),
        notes: d.notes && d.notes !== "" ? d.notes : null,
      })
      .returning({ id: bookings.id });
    id = row.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Insert failed";
    return {
      ok: false,
      error: msg.includes("unique") ? "Booking code already in use." : msg,
    };
  }

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "booking.create",
    entityType: "booking",
    entityId: id,
    after: { ...d, nights, netExpected },
  });

  revalidatePath("/dashboard/bookings");
  redirect(`/dashboard/bookings/${id}`);
}

export async function updateBookingAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await canManageEntity("booking"))) {
    return { ok: false, error: "Not authorised." };
  }
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { ok: false, error: "Missing booking id." };

  const parsed = createBookingSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form and correct the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const d = parsed.data;
  const nights = differenceInCalendarDays(new Date(d.checkOut), new Date(d.checkIn));
  if (nights <= 0) return { ok: false, error: "Check-out must be after check-in." };

  const me = await getCurrentAppUser();
  const [before] = await db.select().from(bookings).where(eq(bookings.id, id.data)).limit(1);
  if (!before) return { ok: false, error: "Booking not found." };
  const netExpected =
    d.grossAmount + d.cleaningFeeAmount - d.channelFeeAmount - d.paymentFeeAmount;

  await db
    .update(bookings)
    .set({
      villaId: d.villaId,
      channelId: d.channelId && d.channelId !== "" ? d.channelId : null,
      guestId: d.guestId && d.guestId !== "" ? d.guestId : null,
      bookingCode: d.bookingCode,
      sourceReference: d.sourceReference && d.sourceReference !== "" ? d.sourceReference : null,
      status: d.status,
      checkIn: d.checkIn,
      checkOut: d.checkOut,
      nights,
      adults: d.adults ?? null,
      children: d.children ?? null,
      currency: d.currency,
      grossAmount: String(d.grossAmount),
      cleaningFeeAmount: String(d.cleaningFeeAmount),
      channelFeeAmount: String(d.channelFeeAmount),
      paymentFeeAmount: String(d.paymentFeeAmount),
      netExpectedAmount: String(netExpected),
      notes: d.notes && d.notes !== "" ? d.notes : null,
    })
    .where(eq(bookings.id, id.data));

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "booking.update",
    entityType: "booking",
    entityId: id.data,
    before: {
      ...before,
      createdAt: before.createdAt.toISOString(),
      updatedAt: before.updatedAt.toISOString(),
    },
    after: { ...d, nights, netExpected },
  });

  revalidatePath("/dashboard/bookings");
  revalidatePath(`/dashboard/bookings/${id.data}`);
  redirect(`/dashboard/bookings/${id.data}`);
}

const statusUpdateSchema = z.object({
  id: z.string().uuid(),
  status: bookingStatusEnum,
});

export async function setBookingStatusAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await canManageEntity("booking"))) return { ok: false, error: "Not authorised." };
  const parsed = statusUpdateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid status." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const [before] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, parsed.data.id))
    .limit(1);
  if (!before) return { ok: false, error: "Booking not found." };
  await db
    .update(bookings)
    .set({ status: parsed.data.status })
    .where(eq(bookings.id, parsed.data.id));
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "booking.status.update",
    entityType: "booking",
    entityId: parsed.data.id,
    before: { status: before.status },
    after: { status: parsed.data.status },
  });
  revalidatePath("/dashboard/bookings");
  revalidatePath(`/dashboard/bookings/${parsed.data.id}`);
  // A desk check-in/out also moves the Front office boards.
  revalidatePath("/dashboard/front-office");
  revalidatePath("/dashboard/front-office/arrivals");
  return { ok: true };
}
