"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { differenceInCalendarDays } from "date-fns";
import { getDb } from "@/lib/db/client";
import { bookings } from "@/lib/db/schema/bookings";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { canManageEntity } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { bookingStatusEnum, createBookingSchema } from "./schema";
import { assertHoldDatesStillAvailable } from "@/features/direct-booking/availability";
import type { ActionResult } from "@/features/projects/actions";

const idSchema = z.string().uuid();

// -----------------------------------------------------------------------------
// Booking status state machine (E2E-HARDENING). A direct call to
// setBookingStatusAction would otherwise accept any valid enum value, letting a
// booking jump from e.g. `cancelled`/`no_show`/`inquiry` straight to
// `checked_out`. This map keeps the lifecycle honest. Mirrors the
// PAYOUT_LINE_TRANSITIONS pattern in src/features/finance/actions.ts.
//
// NOTE: this is a sensible default — the operator can refine it (e.g. allow
// re-opening a cancelled inquiry) without touching the guard logic.
const BOOKING_TRANSITIONS: Record<string, readonly string[]> = {
  inquiry: ["tentative", "confirmed", "cancelled"],
  tentative: ["confirmed", "cancelled", "no_show"],
  confirmed: ["checked_in", "cancelled", "no_show"],
  checked_in: ["checked_out"],
  checked_out: [], // terminal
  cancelled: [], // terminal
  no_show: [], // terminal
};

function isAllowedTransition(
  table: Record<string, readonly string[]>,
  from: string,
  to: string,
): boolean {
  if (from === to) return true; // idempotent re-apply is a no-op, not an attack
  return (table[from] ?? []).includes(to);
}

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

  // Overlap guard — a villa can't hold two stays on the same nights.
  // Skips cancelled / no-show (they don't occupy the calendar). Reuses
  // the canonical availability check (existing bookings + active blocks
  // / holds, half-open [check_in, check_out)).
  if (d.status !== "cancelled" && d.status !== "no_show") {
    const avail = await assertHoldDatesStillAvailable(d.villaId, d.checkIn, d.checkOut);
    if (!avail.available) {
      const reasonMsg =
        avail.reason === "booking_conflict"
          ? "This villa is already booked for one or more of those nights."
          : avail.reason === "hold_conflict"
            ? "Those nights are on hold for this villa — release the hold first."
            : "This villa is blocked (maintenance / out-of-order) for those nights.";
      return {
        ok: false,
        error: reasonMsg,
        fieldErrors: { checkIn: [reasonMsg], villaId: [reasonMsg] },
      };
    }
  }

  const me = await getCurrentAppUser();
  const organizationId = await requireOrgId();
  const netExpected =
    d.grossAmount + d.cleaningFeeAmount - d.channelFeeAmount - d.paymentFeeAmount;

  let id: string;
  try {
    const [row] = await db
      .insert(bookings)
      .values({
        organizationId,
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
  const organizationId = await requireOrgId();
  const [before] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, id.data), eq(bookings.organizationId, organizationId)))
    .limit(1);
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
    .where(and(eq(bookings.id, id.data), eq(bookings.organizationId, organizationId)));

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
  const organizationId = await requireOrgId();
  const [before] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, parsed.data.id), eq(bookings.organizationId, organizationId)))
    .limit(1);
  if (!before) return { ok: false, error: "Booking not found." };
  // State-machine guard: refuse illegal lifecycle jumps (e.g. cancelled →
  // checked_out). Mirrors setPayoutLineStatusAction's guard in finance.
  if (!isAllowedTransition(BOOKING_TRANSITIONS, before.status, parsed.data.status)) {
    return {
      ok: false,
      error: `Cannot move a booking from "${before.status}" to "${parsed.data.status}".`,
    };
  }
  await db
    .update(bookings)
    .set({ status: parsed.data.status })
    .where(and(eq(bookings.id, parsed.data.id), eq(bookings.organizationId, organizationId)));
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
