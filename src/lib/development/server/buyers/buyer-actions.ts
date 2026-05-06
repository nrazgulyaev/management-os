"use server";

import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { buyers, buyerUnitAssignments } from "@/lib/db/schema/buyers";
import { requireInternalUser } from "@/features/auth/permissions";

const KYC_STATUSES = [
  "not_started",
  "in_progress",
  "submitted",
  "verified",
  "rejected",
  "expired",
] as const;

const ASSIGNMENT_STATUSES = [
  "reserved",
  "contracted",
  "paying",
  "paid_in_full",
  "handed_over",
  "cancelled",
] as const;

const createBuyerSchema = z.object({
  contactId: z.string().uuid().nullable().optional(),
  displayName: z.string().min(1),
  primaryEmail: z.string().email().nullable().optional(),
  primaryPhone: z.string().nullable().optional(),
  whatsappPhone: z.string().nullable().optional(),
  preferredLanguage: z.string().default("en"),
  kycStatus: z.enum(KYC_STATUSES).default("not_started"),
  internalNotes: z.string().nullable().optional(),
});

export async function createBuyer(input: z.input<typeof createBuyerSchema>) {
  await requireInternalUser();
  const parsed = createBuyerSchema.parse(input);
  const db = requireDb();

  // Generate a buyer_code: BYR-XXX where XXX is a zero-padded sequence.
  const [{ count }] = await db
    .select({ count: sql<string>`COUNT(*)::text` })
    .from(buyers);
  const next = String(Number(count ?? "0") + 1).padStart(3, "0");
  const buyerCode = `BYR-${next}`;

  const [row] = await db
    .insert(buyers)
    .values({
      buyerCode,
      contactId: parsed.contactId ?? null,
      displayName: parsed.displayName,
      primaryEmail: parsed.primaryEmail ?? null,
      primaryPhone: parsed.primaryPhone ?? null,
      whatsappPhone: parsed.whatsappPhone ?? null,
      preferredLanguage: parsed.preferredLanguage,
      kycStatus: parsed.kycStatus,
      internalNotes: parsed.internalNotes ?? null,
    })
    .returning();
  return row;
}

const assignUnitSchema = z.object({
  buyerId: z.string().uuid(),
  unitId: z.string().uuid(),
  status: z.enum(ASSIGNMENT_STATUSES).default("reserved"),
  reservationId: z.string().uuid().nullable().optional(),
  contractId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function assignUnitToBuyer(
  input: z.input<typeof assignUnitSchema>,
) {
  await requireInternalUser();
  const parsed = assignUnitSchema.parse(input);
  const db = requireDb();
  const [row] = await db
    .insert(buyerUnitAssignments)
    .values({
      buyerId: parsed.buyerId,
      unitId: parsed.unitId,
      status: parsed.status,
      reservationId: parsed.reservationId ?? null,
      contractId: parsed.contractId ?? null,
      assignedAt: new Date().toISOString().slice(0, 10),
      notes: parsed.notes ?? null,
    })
    .returning();
  return row;
}

const inviteSchema = z.object({
  buyerId: z.string().uuid(),
  supabaseUserId: z.string().uuid(),
});

export async function activateBuyerPortalAccess(
  input: z.input<typeof inviteSchema>,
) {
  await requireInternalUser();
  const parsed = inviteSchema.parse(input);
  const db = requireDb();
  const [row] = await db
    .update(buyers)
    .set({
      supabaseUserId: parsed.supabaseUserId,
      portalAccessEnabled: true,
      portalInvitedAt: new Date(),
    })
    .where(eq(buyers.id, parsed.buyerId))
    .returning();
  return row;
}

const updateKycSchema = z.object({
  buyerId: z.string().uuid(),
  kycStatus: z.enum(KYC_STATUSES),
});

export async function updateBuyerKycStatus(
  input: z.input<typeof updateKycSchema>,
) {
  await requireInternalUser();
  const parsed = updateKycSchema.parse(input);
  const db = requireDb();
  const [row] = await db
    .update(buyers)
    .set({
      kycStatus: parsed.kycStatus,
      kycCompletedAt:
        parsed.kycStatus === "verified" ? new Date() : null,
    })
    .where(eq(buyers.id, parsed.buyerId))
    .returning();
  return row;
}
