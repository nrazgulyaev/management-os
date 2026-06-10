"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { contactRoles } from "@/lib/db/schema/contacts";
import { projects } from "@/lib/db/schema/projects";
import {
  contractGroups,
  contractTemplates,
  reservations,
  type Reservation,
} from "@/lib/db/schema/sales";
import { DEVELOPMENT_APP_PATH } from "@/lib/development/constants";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { recordAuditEvent } from "@/features/audit/services";
import { calculateCurrentPrice, createPriceSnapshot } from "./pricing";

const createReservationSchema = z.object({
  contactId: z.string().uuid(),
  villaId: z.string().uuid(),
  projectId: z.string().uuid(),
  contactRoleId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined)),
  reservationFeeUsdMinor: z.coerce.bigint().positive(),
  fxRateUsdToIdr: z.coerce.number().positive(),
  paymentMethod: z.enum([
    "bank_transfer",
    "crypto_usdt",
    "crypto_other",
    "cash",
    "card",
  ]),
  paymentReference: z.string().max(200).optional(),
  expiresInDays: z.coerce.number().int().min(1).max(90).default(14),
  notes: z.string().max(2000).optional(),
});

export type CreateReservationResult =
  | { ok: true; reservationId: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Creates a reservation: locks the unit's current price, writes a price
 * snapshot, transitions the lead role to `status='reservation'`, and
 * inserts the reservations row in `pending_payment`.
 *
 * Concurrency: the partial-unique index `reservations_villa_active_unique`
 * is the race-condition guard — a second concurrent attempt fails at the
 * SQL level with a unique-violation, which we map to a friendly error.
 */
export async function createReservation(
  formData: FormData,
): Promise<CreateReservationResult> {
  const parsed = createReservationSchema.safeParse({
    contactId: formData.get("contactId"),
    villaId: formData.get("villaId"),
    projectId: formData.get("projectId"),
    contactRoleId: formData.get("contactRoleId") ?? "",
    reservationFeeUsdMinor: formData.get("reservationFeeUsdMinor"),
    fxRateUsdToIdr: formData.get("fxRateUsdToIdr"),
    paymentMethod: formData.get("paymentMethod"),
    paymentReference: formData.get("paymentReference") ?? undefined,
    expiresInDays: formData.get("expiresInDays") ?? 14,
    notes: formData.get("notes") ?? undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid input.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const db = getDb();
  if (!db) {
    return {
      ok: false,
      error: "Database is not configured. Reservations require DATABASE_URL.",
    };
  }
  const data = parsed.data;

  const calc = await calculateCurrentPrice({
    villaId: data.villaId,
    fxRateUsdToIdr: data.fxRateUsdToIdr,
  });
  if (!calc) {
    return {
      ok: false,
      error:
        "No pricing rule for this project — cannot create a reservation. Add a pricing rule to the project first.",
    };
  }

  const snapshot = await createPriceSnapshot({
    villaId: data.villaId,
    priceUsdMinor: calc.finalPriceUsdMinor,
    priceIdrMinor: calc.priceIdrMinor,
    fxRateUsdToIdr: data.fxRateUsdToIdr,
    priceBasis: "rule_calculated",
    triggeredBy: "manual",
    notes: `Locked at reservation. ${calc.reason}`,
  });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + data.expiresInDays);

  const reservationFeeIdrMinor = BigInt(
    Math.round(Number(data.reservationFeeUsdMinor) * data.fxRateUsdToIdr),
  );

  try {
    const [reservation] = await db
      .insert(reservations)
      .values({
        contactId: data.contactId,
        villaId: data.villaId,
        projectId: data.projectId,
        contactRoleId: data.contactRoleId ?? null,
        reservationFeeUsdMinor: data.reservationFeeUsdMinor,
        reservationFeeIdrMinor,
        fxRateAtReservation: String(data.fxRateUsdToIdr),
        paymentMethod: data.paymentMethod,
        paymentReference: data.paymentReference ?? null,
        status: "pending_payment",
        expiresAt,
        priceLockedUsdMinor: calc.finalPriceUsdMinor,
        priceLockedSnapshotId: snapshot.id,
        notes: data.notes ?? null,
      })
      .returning();

    if (data.contactRoleId) {
      await db
        .update(contactRoles)
        .set({ status: "reservation", updatedAt: new Date() })
        .where(eq(contactRoles.id, data.contactRoleId));
    }

    revalidatePath(`${DEVELOPMENT_APP_PATH}/reservations`);
    revalidatePath(`${DEVELOPMENT_APP_PATH}/sales`);
    return { ok: true, reservationId: reservation.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg.includes("reservations_villa_active_unique")) {
      return {
        ok: false,
        error:
          "Another active reservation already exists for this villa. Cancel or expire it first.",
      };
    }
    return { ok: false, error: msg };
  }
}

const cancelReservationSchema = z.object({
  reservationId: z.string().uuid(),
  reason: z.string().min(2).max(500),
  refundAmountUsdMinor: z.coerce.bigint().nonnegative().optional(),
});

export async function cancelReservation(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = cancelReservationSchema.safeParse({
    reservationId: formData.get("reservationId"),
    reason: formData.get("reason"),
    refundAmountUsdMinor: formData.get("refundAmountUsdMinor") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const now = new Date();
  await db
    .update(reservations)
    .set({
      status: parsed.data.refundAmountUsdMinor ? "refunded" : "cancelled",
      cancelledAt: now,
      cancelledReason: parsed.data.reason,
      refundedAmountUsdMinor: parsed.data.refundAmountUsdMinor ?? null,
      refundedAt: parsed.data.refundAmountUsdMinor ? now : null,
      updatedAt: now,
    })
    .where(eq(reservations.id, parsed.data.reservationId));

  revalidatePath(`${DEVELOPMENT_APP_PATH}/reservations`);
  return { ok: true };
}

const extendReservationSchema = z.object({
  reservationId: z.string().uuid(),
  newExpiryDate: z.string().datetime(),
});

export async function extendReservationExpiry(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = extendReservationSchema.safeParse({
    reservationId: formData.get("reservationId"),
    newExpiryDate: formData.get("newExpiryDate"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  await db
    .update(reservations)
    .set({
      expiresAt: new Date(parsed.data.newExpiryDate),
      updatedAt: new Date(),
    })
    .where(eq(reservations.id, parsed.data.reservationId));

  revalidatePath(`${DEVELOPMENT_APP_PATH}/reservations`);
  return { ok: true };
}

const markReservationPaidSchema = z.object({
  reservationId: z.string().uuid(),
  paymentReference: z.string().max(200).optional(),
});

export async function markReservationPaid(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  // AUTH: internal-only money/status write. Throws for non-internal callers.
  const ctx = await requireInternalUser();
  const organizationId = await requireOrgId();

  const parsed = markReservationPaidSchema.safeParse({
    reservationId: formData.get("reservationId"),
    paymentReference: formData.get("paymentReference") ?? undefined,
  });
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  // SCOPE + STATE GUARD: load the reservation through its project so we can
  // (a) confirm it belongs to the caller's org (reservations carries no org
  // column — the project is the tenancy anchor; this kills the IDOR) and
  // (b) enforce the state machine. Marking paid is only legal from
  // pending_payment; "active" is treated as idempotent (already paid).
  const [row] = await db
    .select({
      id: reservations.id,
      status: reservations.status,
      organizationId: projects.organizationId,
    })
    .from(reservations)
    .innerJoin(projects, eq(projects.id, reservations.projectId))
    .where(eq(reservations.id, parsed.data.reservationId))
    .limit(1);
  if (!row || row.organizationId !== organizationId) {
    return { ok: false, error: "Reservation not found." };
  }
  if (row.status === "active") {
    return { ok: true }; // idempotent — already paid.
  }
  if (row.status !== "pending_payment") {
    return {
      ok: false,
      error: `Reservation is '${row.status}' — only a pending-payment reservation can be marked paid.`,
    };
  }

  const now = new Date();
  await db
    .update(reservations)
    .set({
      status: "active",
      paidAt: now,
      paymentReference: parsed.data.paymentReference ?? undefined,
      updatedAt: now,
    })
    .where(
      and(
        eq(reservations.id, parsed.data.reservationId),
        eq(reservations.status, "pending_payment"),
      ),
    );

  await recordAuditEvent({
    actorUserId: ctx.appUser?.id ?? null,
    action: "reservation.mark_paid",
    entityType: "reservation",
    entityId: parsed.data.reservationId,
    before: { status: row.status },
    after: { status: "active", paymentReference: parsed.data.paymentReference ?? null },
    metadata: { organizationId },
  });

  revalidatePath(`${DEVELOPMENT_APP_PATH}/reservations`);
  return { ok: true };
}

/** Validation helper: confirms a reservation exists and is in convertible state. */
export async function loadReservationForConversion(
  reservationId: string,
): Promise<Reservation | null> {
  const db = getDb();
  if (!db) return null;
  const [r] = await db
    .select()
    .from(reservations)
    .where(eq(reservations.id, reservationId))
    .limit(1);
  if (!r) return null;
  if (!["active", "pending_payment"].includes(r.status)) return null;
  return r;
}

/**
 * Returns true if the given template id exists and is active.
 * Used by `convertReservationToContract` in contract-actions.ts.
 */
export async function isContractTemplateActive(
  templateId: string,
): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const [r] = await db
    .select({ id: contractTemplates.id, isActive: contractTemplates.isActive })
    .from(contractTemplates)
    .where(eq(contractTemplates.id, templateId))
    .limit(1);
  return Boolean(r?.isActive);
}

/** Returns true if any contract group already references a given reservation. */
export async function reservationAlreadyConverted(
  reservationId: string,
): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const rows = await db
    .select({ id: contractGroups.id })
    .from(contractGroups)
    .where(
      and(
        eq(contractGroups.reservationId, reservationId),
        isNull(contractGroups.cancelledAt),
        inArray(contractGroups.status, [
          "draft",
          "pending_signature",
          "partial_signed",
          "fully_signed",
          "in_payment",
          "completed",
        ]),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
