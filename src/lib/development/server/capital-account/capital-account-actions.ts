import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { investorWallets, investors } from "@/lib/db/schema/investor-capital";
import { walletMovements } from "@/lib/db/schema/wallet-movements";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";

const MOVEMENT_TYPES = [
  "capital_contribution",
  "capital_return",
  "profit_distribution",
  "reinvestment_out",
  "reinvestment_in",
  "withdrawal_request",
  "withdrawal_executed",
  "manual_adjustment",
  "residual_inventory_realloc",
] as const;

const BUCKETS = [
  "cash",
  "economic",
  "reinvestment",
  "committed",
  "pending_distribution",
  "residual_inventory",
] as const;

const BUCKET_TO_COLUMN = {
  cash: "cashBalanceMinor",
  economic: "economicBalanceMinor",
  reinvestment: "reinvestmentBalanceMinor",
  committed: "committedBalanceMinor",
  pending_distribution: "pendingDistributionMinor",
  residual_inventory: "residualInventoryValueMinor",
} as const satisfies Record<(typeof BUCKETS)[number], keyof typeof investorWallets._.columns>;

const recordMovementSchema = z.object({
  walletId: z.string().uuid(),
  investorId: z.string().uuid(),
  movementType: z.enum(MOVEMENT_TYPES),
  amountMinor: z.bigint(),
  currency: z.string().default("USD"),
  fxRateToUsd: z.number().positive().default(1),
  affectsBalance: z.enum(BUCKETS),
  sourceProjectId: z.string().uuid().nullable().optional(),
  targetProjectId: z.string().uuid().nullable().optional(),
  relatedDistributionId: z.string().uuid().nullable().optional(),
  relatedCommitmentId: z.string().uuid().nullable().optional(),
  relatedDrawdownId: z.string().uuid().nullable().optional(),
  relatedResidualUnitId: z.string().uuid().nullable().optional(),
  reason: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

/**
 * Atomic: write the movement row and update the relevant balance bucket
 * on the wallet inside one transaction. Movement is signed — positive
 * `amountMinor` credits the bucket, negative debits.
 */
export async function recordWalletMovement(
  input: z.input<typeof recordMovementSchema>,
) {
  const ctx = await requireInternalUser();
  const organizationId = await requireOrgId();
  const parsed = recordMovementSchema.parse(input);
  const db = requireDb();

  return db.transaction(async (tx) => {
    // Insert the movement record (immutable audit log).
    const [movement] = await tx
      .insert(walletMovements)
      .values({
        organizationId,
        walletId: parsed.walletId,
        investorId: parsed.investorId,
        movementType: parsed.movementType,
        amountMinor: parsed.amountMinor,
        currency: parsed.currency,
        fxRateToUsd: String(parsed.fxRateToUsd),
        affectsBalance: parsed.affectsBalance,
        sourceProjectId: parsed.sourceProjectId ?? null,
        targetProjectId: parsed.targetProjectId ?? null,
        relatedDistributionId: parsed.relatedDistributionId ?? null,
        relatedCommitmentId: parsed.relatedCommitmentId ?? null,
        relatedDrawdownId: parsed.relatedDrawdownId ?? null,
        relatedResidualUnitId: parsed.relatedResidualUnitId ?? null,
        status: "recorded",
        effectedBy: ctx.appUser?.id ?? null,
        reason: parsed.reason ?? null,
        notes: parsed.notes ?? null,
      })
      .returning();

    // Update the bucket on the wallet.
    const column = BUCKET_TO_COLUMN[parsed.affectsBalance];
    await tx
      .update(investorWallets)
      .set({
        [column]: sql`${investorWallets[column]} + ${parsed.amountMinor}`,
        lastActivityAt: new Date(),
      })
      .where(
        and(
          eq(investorWallets.id, parsed.walletId),
          eq(investorWallets.organizationId, organizationId),
        ),
      );

    return movement;
  });
}

const crossProjectMovementSchema = z.object({
  sourceWalletId: z.string().uuid(),
  targetWalletId: z.string().uuid(),
  investorId: z.string().uuid(),
  amountMinor: z.bigint().positive(),
  currency: z.string().default("USD"),
  sourceProjectId: z.string().uuid(),
  targetProjectId: z.string().uuid(),
  reason: z.string().nullable().optional(),
});

/**
 * Move capital from one wallet to another. Always writes a *pair* of
 * movements (reinvestment_out from source, reinvestment_in to target)
 * inside one Drizzle transaction. The source movement carries a
 * negative amount; the target movement positive — both report the
 * other wallet's project as their source/target for traceability.
 */
export async function recordCrossProjectMovement(
  input: z.input<typeof crossProjectMovementSchema>,
) {
  const ctx = await requireInternalUser();
  const organizationId = await requireOrgId();
  const parsed = crossProjectMovementSchema.parse(input);
  const db = requireDb();

  return db.transaction(async (tx) => {
    const [out] = await tx
      .insert(walletMovements)
      .values({
        organizationId,
        walletId: parsed.sourceWalletId,
        investorId: parsed.investorId,
        movementType: "reinvestment_out",
        amountMinor: -parsed.amountMinor,
        currency: parsed.currency,
        affectsBalance: "cash",
        sourceProjectId: parsed.sourceProjectId,
        targetProjectId: parsed.targetProjectId,
        status: "recorded",
        effectedBy: ctx.appUser?.id ?? null,
        reason: parsed.reason ?? null,
      })
      .returning();

    const [into] = await tx
      .insert(walletMovements)
      .values({
        organizationId,
        walletId: parsed.targetWalletId,
        investorId: parsed.investorId,
        movementType: "reinvestment_in",
        amountMinor: parsed.amountMinor,
        currency: parsed.currency,
        affectsBalance: "committed",
        sourceProjectId: parsed.sourceProjectId,
        targetProjectId: parsed.targetProjectId,
        status: "recorded",
        effectedBy: ctx.appUser?.id ?? null,
        reason: parsed.reason ?? null,
      })
      .returning();

    await tx
      .update(investorWallets)
      .set({
        cashBalanceMinor: sql`${investorWallets.cashBalanceMinor} - ${parsed.amountMinor}`,
        lastActivityAt: new Date(),
      })
      .where(
        and(
          eq(investorWallets.id, parsed.sourceWalletId),
          eq(investorWallets.organizationId, organizationId),
        ),
      );

    await tx
      .update(investorWallets)
      .set({
        committedBalanceMinor: sql`${investorWallets.committedBalanceMinor} + ${parsed.amountMinor}`,
        lastActivityAt: new Date(),
      })
      .where(
        and(
          eq(investorWallets.id, parsed.targetWalletId),
          eq(investorWallets.organizationId, organizationId),
        ),
      );

    return { out, into };
  });
}

export async function reverseWalletMovement(input: {
  movementId: string;
  reason: string;
}) {
  const ctx = await requireInternalUser();
  const organizationId = await requireOrgId();
  const db = requireDb();

  return db.transaction(async (tx) => {
    const [original] = await tx
      .select()
      .from(walletMovements)
      .where(
        and(
          eq(walletMovements.id, input.movementId),
          eq(walletMovements.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!original) throw new Error(`movement ${input.movementId} not found`);
    if (original.status !== "recorded") {
      throw new Error(
        `cannot reverse movement in status '${original.status}'`,
      );
    }

    // Mark original as reversed.
    await tx
      .update(walletMovements)
      .set({ status: "reversed" })
      .where(
        and(
          eq(walletMovements.id, input.movementId),
          eq(walletMovements.organizationId, organizationId),
        ),
      );

    // Write a compensating entry.
    const [reversal] = await tx
      .insert(walletMovements)
      .values({
        organizationId,
        walletId: original.walletId,
        investorId: original.investorId,
        movementType: "manual_adjustment",
        amountMinor: -original.amountMinor,
        currency: original.currency,
        fxRateToUsd: original.fxRateToUsd,
        affectsBalance: original.affectsBalance,
        sourceProjectId: original.sourceProjectId,
        targetProjectId: original.targetProjectId,
        status: "recorded",
        effectedBy: ctx.appUser?.id ?? null,
        reason: `reversal of ${input.movementId}: ${input.reason}`,
      })
      .returning();

    // Roll back the bucket.
    const column = BUCKET_TO_COLUMN[
      original.affectsBalance as (typeof BUCKETS)[number]
    ];
    await tx
      .update(investorWallets)
      .set({
        [column]: sql`${investorWallets[column]} - ${original.amountMinor}`,
        lastActivityAt: new Date(),
      })
      .where(
        and(
          eq(investorWallets.id, original.walletId),
          eq(investorWallets.organizationId, organizationId),
        ),
      );

    return reversal;
  });
}
