"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { differenceInCalendarDays } from "date-fns";
import { getDb } from "@/lib/db/client";
import { bookings } from "@/lib/db/schema/bookings";
import { villas, projects } from "@/lib/db/schema/projects";
import {
  bookingGuests,
  bookingCharges,
  bookingPayments,
} from "@/lib/db/schema/booking-detail";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { canManageEntity } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
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

/* --------------------------- add party guest --------------------------- */

const guestSchema = z.object({
  fullName: z.string().min(1, "Name is required").max(160),
  kind: z.enum(["adult", "child"]).default("adult"),
  role: z.enum(["primary", "accompanying", "child"]).default("accompanying"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  nationality: z.string().max(80).optional().or(z.literal("")),
  idType: z.string().max(20).optional().or(z.literal("")),
  idLast4: z.string().max(8).optional().or(z.literal("")),
  ageYears: z.coerce.number().int().min(0).max(120).optional(),
});

/** Append a named guest to the booking party (booking_guests). */
export async function addBookingGuestAction(
  bookingId: string,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await canManageEntity("booking"))) {
    return { ok: false, error: "Not authorised." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const parsed = guestSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const d = parsed.data;

  // Child row inherits the parent booking's org (tenancy).
  const [parent] = await db
    .select({ organizationId: bookings.organizationId })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!parent) return { ok: false, error: "Booking not found." };

  const existing = await db
    .select({ so: bookingGuests.sortOrder })
    .from(bookingGuests)
    .where(eq(bookingGuests.bookingId, bookingId));
  const nextSort = existing.reduce((max, r) => Math.max(max, r.so + 1), 0);
  const role = d.kind === "child" ? "child" : d.role;

  await db.insert(bookingGuests).values({
    organizationId: parent.organizationId,
    bookingId,
    fullName: d.fullName,
    role,
    kind: d.kind,
    email: d.email ? d.email : null,
    phone: d.phone ? d.phone : null,
    nationality: d.nationality ? d.nationality : null,
    idType: d.idType ? d.idType : null,
    idLast4: d.idLast4 ? d.idLast4 : null,
    ageYears: d.kind === "child" ? (d.ageYears ?? null) : null,
    sortOrder: nextSort,
  });

  const me = await getCurrentAppUser();
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "booking.guest.add",
    entityType: "booking",
    entityId: bookingId,
    after: { fullName: d.fullName, kind: d.kind, role },
  });

  revalidatePath(`/dashboard/bookings/${bookingId}`);
  return { ok: true };
}

/* ----------------------------- add charge ------------------------------ */

const chargeSchema = z.object({
  chargeType: z.enum(["nightly", "service", "fee", "tax", "discount"]).default("service"),
  description: z.string().min(1, "Description is required").max(200),
  amount: z.coerce.number().min(0).max(1_000_000_000),
  direction: z.enum(["charge", "deduction"]).default("charge"),
  note: z.string().max(40).optional().or(z.literal("")),
  currency: z.string().length(3).toUpperCase().default("IDR"),
});

/** Append a line to the booking charge ledger (booking_charges). */
export async function addBookingChargeAction(
  bookingId: string,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await canManageEntity("booking"))) {
    return { ok: false, error: "Not authorised." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const parsed = chargeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const d = parsed.data;
  const signed = d.direction === "deduction" ? -Math.abs(d.amount) : Math.abs(d.amount);

  // Child row inherits the parent booking's org (tenancy).
  const [parent] = await db
    .select({ organizationId: bookings.organizationId })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!parent) return { ok: false, error: "Booking not found." };

  const existing = await db
    .select({ so: bookingCharges.sortOrder })
    .from(bookingCharges)
    .where(eq(bookingCharges.bookingId, bookingId));
  const nextSort = existing.reduce((max, r) => Math.max(max, r.so + 1), 0);
  const today = new Date().toISOString().slice(0, 10);

  await db.insert(bookingCharges).values({
    organizationId: parent.organizationId,
    bookingId,
    chargeType: d.chargeType,
    description: d.description,
    amount: String(signed),
    currency: d.currency,
    note: d.note ? d.note : null,
    occurredOn: today,
    sortOrder: nextSort,
  });

  const me = await getCurrentAppUser();
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "booking.charge.add",
    entityType: "booking",
    entityId: bookingId,
    after: { chargeType: d.chargeType, description: d.description, amount: signed },
  });

  revalidatePath(`/dashboard/bookings/${bookingId}`);
  return { ok: true };
}

/* ----------------------------- extend stay ----------------------------- */

const extendSchema = z.object({ checkOut: z.string().date() });

/**
 * Push out a booking's check-out date. Re-checks the new window against
 * other bookings on the same villa (excluding this booking) before updating
 * `checkOut` + `nights`; audit-trailed as a `booking.update`.
 */
export async function extendBookingStayAction(
  bookingId: string,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await canManageEntity("booking"))) {
    return { ok: false, error: "Not authorised." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const parsed = extendSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: "Pick a valid check-out date." };
  }
  const newCheckOut = parsed.data.checkOut;

  const [bk] = await db
    .select({
      villaId: bookings.villaId,
      checkIn: bookings.checkIn,
      checkOut: bookings.checkOut,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!bk) return { ok: false, error: "Booking not found." };
  if (new Date(newCheckOut) <= new Date(bk.checkIn)) {
    return { ok: false, error: "Check-out must be after check-in." };
  }
  if (newCheckOut === bk.checkOut) return { ok: true };

  const conflict = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        eq(bookings.villaId, bk.villaId),
        ne(bookings.id, bookingId),
        sql`${bookings.checkOut} > ${bk.checkIn}`,
        sql`${bookings.checkIn} < ${newCheckOut}`,
        sql`${bookings.status} NOT IN ('cancelled','no_show')`,
      ),
    )
    .limit(1);
  if (conflict.length > 0) {
    return { ok: false, error: "Those dates overlap another booking on this villa." };
  }

  const nights = differenceInCalendarDays(new Date(newCheckOut), new Date(bk.checkIn));
  await db
    .update(bookings)
    .set({ checkOut: newCheckOut, nights, updatedAt: new Date() })
    .where(eq(bookings.id, bookingId));

  const me = await getCurrentAppUser();
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "booking.update",
    entityType: "booking",
    entityId: bookingId,
    before: { checkOut: bk.checkOut },
    after: { checkOut: newCheckOut, nights },
    metadata: { field: "checkOut", reason: "extend_stay" },
  });

  revalidatePath(`/dashboard/bookings/${bookingId}`);
  return { ok: true };
}

/* --------------------------- record payment ---------------------------- */

const paymentSchema = z.object({
  // method: cash | transfer | card-manual — the founder's three real-world
  // ways a guest hands over money (before check-in, on arrival, on checkout).
  method: z.enum(["cash", "transfer", "card-manual"]).default("cash"),
  amount: z.coerce.number().positive("Amount must be greater than 0").max(1_000_000_000),
  // received_at — defaults to today when blank.
  receivedAt: z.string().date().optional().or(z.literal("")),
  note: z.string().max(200).optional().or(z.literal("")),
  currency: z.string().length(3).toUpperCase().optional(),
});

/**
 * Record a payment received against a booking (the founder's three cash
 * cases — before check-in, on arrival, on check-out — are the same action at
 * any booking status; NOT gated by status).
 *
 * Org-scoping: the org is derived from the booking's villa → project
 * (`projects.organization_id`) AND re-checked against `requireOrgId()`, so a
 * caller can never post a payment onto another tenant's booking — a cross-org
 * id resolves to no row and 404s. The inserted row carries that org id, and a
 * `booking.payment.record` audit event is written.
 */
export async function recordBookingPaymentAction(
  bookingId: string,
  formData: FormData,
): Promise<ActionResult> {
  if (!(await canManageEntity("booking"))) {
    return { ok: false, error: "Not authorised." };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const parsed = paymentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const d = parsed.data;
  const organizationId = await requireOrgId();

  // Resolve the booking + its currency + the OWNING org via villa → project,
  // ANDed with the caller's org so a cross-tenant booking id is unreachable.
  const [bk] = await db
    .select({
      currency: bookings.currency,
      projectOrgId: projects.organizationId,
    })
    .from(bookings)
    .innerJoin(villas, eq(villas.id, bookings.villaId))
    .innerJoin(projects, eq(projects.id, villas.projectId))
    .where(
      and(
        eq(bookings.id, bookingId),
        eq(bookings.organizationId, organizationId),
        eq(projects.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!bk) return { ok: false, error: "Booking not found." };

  const currency = d.currency ?? bk.currency;
  const receivedAt = d.receivedAt
    ? new Date(`${d.receivedAt}T00:00:00.000Z`)
    : new Date();
  const amount = Math.abs(d.amount);

  await db.insert(bookingPayments).values({
    organizationId: bk.projectOrgId,
    bookingId,
    // A recorded receipt is a manual, money-in-hand payment, not a PSP capture.
    provider: "manual",
    method: d.method,
    amount: String(amount),
    currency,
    status: "captured",
    receivedAt,
    capturedAt: receivedAt,
    captureNote: d.note ? d.note : null,
  });

  const me = await getCurrentAppUser();
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "booking.payment.record",
    entityType: "booking",
    entityId: bookingId,
    after: {
      method: d.method,
      amount,
      currency,
      receivedAt: receivedAt.toISOString(),
    },
    metadata: { provider: "manual" },
  });

  revalidatePath(`/dashboard/bookings/${bookingId}`);
  return { ok: true };
}
