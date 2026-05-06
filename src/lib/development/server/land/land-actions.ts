import "server-only";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireDb } from "@/lib/db/client";
import {
  landProfiles,
  landPaymentSchedules,
  landPaymentInstallments,
  landTransactionCosts,
} from "@/lib/db/schema/land";
import { projects } from "@/lib/db/schema/projects";
import { devTransactions } from "@/lib/db/schema/dev-finance";
import { requireInternalUser } from "@/features/auth/permissions";

/**
 * Land profile + payment lifecycle actions. All mutations atomic via
 * Drizzle transactions where they touch multiple tables.
 */

const upsertProfileSchema = z.object({
  projectId: z.string().uuid(),
  acquisitionMode: z.enum([
    "leasehold",
    "freehold",
    "joint_venture",
    "landowner_partnership",
    "nominee",
    "revenue_share",
    "custom",
  ]),
  acquisitionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  leaseStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  leaseExpiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  leaseTenureYears: z.number().int().min(1).max(99).optional(),
  totalLandSizeSqm: z.union([z.number(), z.string()]).optional(),
  zoningClassification: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});

export async function upsertLandProfile(
  input: z.input<typeof upsertProfileSchema>,
): Promise<{ id: string }> {
  const parsed = upsertProfileSchema.parse(input);
  await requireInternalUser();
  const db = requireDb();
  const [row] = await db
    .insert(landProfiles)
    .values({
      projectId: parsed.projectId,
      acquisitionMode: parsed.acquisitionMode,
      acquisitionDate: parsed.acquisitionDate ?? null,
      leaseStartDate: parsed.leaseStartDate ?? null,
      leaseExpiryDate: parsed.leaseExpiryDate ?? null,
      leaseTenureYears: parsed.leaseTenureYears ?? null,
      totalLandSizeSqm:
        parsed.totalLandSizeSqm != null
          ? String(parsed.totalLandSizeSqm)
          : null,
      zoningClassification: parsed.zoningClassification ?? null,
      notes: parsed.notes ?? null,
    })
    .onConflictDoUpdate({
      target: landProfiles.projectId,
      set: {
        acquisitionMode: parsed.acquisitionMode,
        acquisitionDate: parsed.acquisitionDate ?? null,
        leaseStartDate: parsed.leaseStartDate ?? null,
        leaseExpiryDate: parsed.leaseExpiryDate ?? null,
        leaseTenureYears: parsed.leaseTenureYears ?? null,
        totalLandSizeSqm:
          parsed.totalLandSizeSqm != null
            ? String(parsed.totalLandSizeSqm)
            : null,
        zoningClassification: parsed.zoningClassification ?? null,
        notes: parsed.notes ?? null,
        updatedAt: new Date(),
      },
    })
    .returning({ id: landProfiles.id });
  await revalidateProjectLand(parsed.projectId);
  return { id: row.id };
}

const createScheduleSchema = z.object({
  landProfileId: z.string().uuid(),
  totalPurchasePriceMinor: z.union([z.bigint(), z.string(), z.number()]),
  currency: z.string().length(3),
  upfrontPaymentMinor: z.union([z.bigint(), z.string(), z.number()]).optional(),
  installments: z
    .array(
      z.object({
        installmentNumber: z.number().int().min(1),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        amountMinor: z.union([z.bigint(), z.string(), z.number()]),
      }),
    )
    .min(1),
});

export async function createLandPaymentSchedule(
  input: z.input<typeof createScheduleSchema>,
): Promise<{ scheduleId: string; installmentCount: number }> {
  const parsed = createScheduleSchema.parse(input);
  await requireInternalUser();
  const db = requireDb();
  const total = toBig(parsed.totalPurchasePriceMinor);
  const installmentSum = parsed.installments.reduce(
    (s, i) => s + toBig(i.amountMinor),
    0n,
  );
  if (installmentSum !== total) {
    throw new Error(
      `Installments sum (${installmentSum}) must equal total purchase price (${total})`,
    );
  }
  return await db.transaction(async (tx) => {
    const [schedule] = await tx
      .insert(landPaymentSchedules)
      .values({
        landProfileId: parsed.landProfileId,
        totalPurchasePriceMinor: total,
        currency: parsed.currency,
        upfrontPaymentMinor:
          parsed.upfrontPaymentMinor != null
            ? toBig(parsed.upfrontPaymentMinor)
            : 0n,
      })
      .returning({ id: landPaymentSchedules.id });
    for (const inst of parsed.installments) {
      await tx.insert(landPaymentInstallments).values({
        scheduleId: schedule.id,
        installmentNumber: inst.installmentNumber,
        dueDate: inst.dueDate,
        amountMinor: toBig(inst.amountMinor),
      });
    }
    return {
      scheduleId: schedule.id,
      installmentCount: parsed.installments.length,
    };
  });
}

const markInstallmentPaidSchema = z.object({
  installmentId: z.string().uuid(),
  paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paidAmountMinor: z.union([z.bigint(), z.string(), z.number()]),
  paymentMethod: z.string().max(50).optional(),
  counterparty: z.string().max(200).optional(),
  /** Optional — if the operator already created the txn, link it. */
  relatedTransactionId: z.string().uuid().optional(),
});

export async function markLandInstallmentPaid(
  input: z.input<typeof markInstallmentPaidSchema>,
): Promise<{ ok: true; status: "paid" | "partial" }> {
  const parsed = markInstallmentPaidSchema.parse(input);
  await requireInternalUser();
  const db = requireDb();
  return await db.transaction(async (tx) => {
    const [installment] = await tx
      .select()
      .from(landPaymentInstallments)
      .where(eq(landPaymentInstallments.id, parsed.installmentId))
      .limit(1);
    if (!installment) throw new Error("Installment not found");
    if (installment.status === "cancelled") {
      throw new Error("Cannot mark a cancelled installment as paid");
    }
    const paidAmount = toBig(parsed.paidAmountMinor);
    const totalAmount = BigInt(installment.amountMinor);
    const newStatus: "paid" | "partial" =
      paidAmount >= totalAmount ? "paid" : "partial";
    await tx
      .update(landPaymentInstallments)
      .set({
        status: newStatus,
        paidDate: parsed.paidDate,
        paidAmountMinor: paidAmount,
        paymentMethod: parsed.paymentMethod ?? null,
        counterparty: parsed.counterparty ?? null,
        relatedTransactionId: parsed.relatedTransactionId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(landPaymentInstallments.id, parsed.installmentId));
    return { ok: true as const, status: newStatus };
  });
}

const addCostSchema = z.object({
  landProfileId: z.string().uuid(),
  costType: z.enum([
    "lease_tax",
    "purchase_tax",
    "notary_fee",
    "legal_due_diligence",
    "land_survey",
    "topographic_survey",
    "soil_test",
    "brokerage_fee",
    "agent_commission",
    "land_clearance",
    "access_road_preparation",
    "boundary_marking",
    "utility_connection",
    "environmental_assessment",
    "custom",
  ]),
  costLabel: z.string().min(1).max(200),
  plannedAmountMinor: z.union([z.bigint(), z.string(), z.number()]).optional(),
  currency: z.string().length(3).default("USD"),
  vendorId: z.string().uuid().optional(),
  notes: z.string().max(2000).optional(),
});

export async function addLandTransactionCost(
  input: z.input<typeof addCostSchema>,
): Promise<{ id: string }> {
  const parsed = addCostSchema.parse(input);
  await requireInternalUser();
  const db = requireDb();
  const [row] = await db
    .insert(landTransactionCosts)
    .values({
      landProfileId: parsed.landProfileId,
      costType: parsed.costType,
      costLabel: parsed.costLabel,
      plannedAmountMinor:
        parsed.plannedAmountMinor != null
          ? toBig(parsed.plannedAmountMinor)
          : null,
      currency: parsed.currency,
      vendorId: parsed.vendorId ?? null,
      notes: parsed.notes ?? null,
    })
    .returning({ id: landTransactionCosts.id });
  return { id: row.id };
}

// =========================================================================
// Read-side queries
// =========================================================================

export async function getLandProfileByProject(projectId: string) {
  const db = requireDb();
  const [row] = await db
    .select()
    .from(landProfiles)
    .where(eq(landProfiles.projectId, projectId))
    .limit(1);
  return row ?? null;
}

export async function getLandPaymentSchedule(landProfileId: string) {
  const db = requireDb();
  const [schedule] = await db
    .select()
    .from(landPaymentSchedules)
    .where(eq(landPaymentSchedules.landProfileId, landProfileId))
    .limit(1);
  if (!schedule) return null;
  const installments = await db
    .select()
    .from(landPaymentInstallments)
    .where(eq(landPaymentInstallments.scheduleId, schedule.id))
    .orderBy(landPaymentInstallments.installmentNumber);
  return { schedule, installments };
}

export async function getLandTransactionCosts(landProfileId: string) {
  const db = requireDb();
  return await db
    .select()
    .from(landTransactionCosts)
    .where(eq(landTransactionCosts.landProfileId, landProfileId));
}

// =========================================================================
// Helpers
// =========================================================================

function toBig(v: bigint | string | number): bigint {
  if (typeof v === "bigint") return v;
  return BigInt(typeof v === "number" ? Math.trunc(v) : v);
}

async function revalidateProjectLand(projectId: string): Promise<void> {
  const db = requireDb();
  const [p] = await db
    .select({ slug: projects.slug })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (p) revalidatePath(`/development-os/projects/${p.slug}/land`);
}
