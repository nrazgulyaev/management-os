"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import {
  sharedCostAllocations,
  sharedCostAllocationLines,
} from "@/lib/db/schema/shared-costs";
import { devTransactions } from "@/lib/db/schema/dev-finance";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import {
  computeAllocationAmounts,
  type AllocationMethod,
} from "./allocation-helpers";

/**
 * Shared cost allocation actions. Allocation math is in the pure
 * helpers module so it's runtime-testable. Approval is the operator
 * action that creates derivative dev_transactions atomically.
 */

const proposeSchema = z.object({
  sourceTransactionId: z.string().uuid(),
  allocationMethod: z.enum([
    "by_floor_area",
    "by_land_area",
    "by_unit_count",
    "by_budget_size",
    "by_revenue_share",
    "by_time_spent",
    "by_headcount",
    "fixed_percentage",
    "manual_split",
    "custom_formula",
  ]),
  /** Snapshot of weights/areas used for the split. */
  allocationBasis: z.record(z.string(), z.unknown()).optional(),
  lines: z
    .array(
      z.object({
        projectId: z.string().uuid(),
        percentage: z.number().min(0.0001).max(100),
      }),
    )
    .min(2),
  notes: z.string().max(2000).optional(),
});

/**
 * Propose a shared cost allocation. Computes per-line amounts via the
 * pure helper and inserts everything in one transaction. The DB
 * trigger validates the percentages sum to 100% at COMMIT.
 */
export async function proposeSharedCostAllocation(
  input: z.input<typeof proposeSchema>,
): Promise<{
  allocationId: string;
  lineCount: number;
}> {
  const parsed = proposeSchema.parse(input);
  await requireInternalUser();
  const organizationId = await requireOrgId();
  const db = requireDb();

  const [source] = await db
    .select({
      id: devTransactions.id,
      amountUsdMinor: devTransactions.amountUsdMinor,
      currency: devTransactions.currency,
    })
    .from(devTransactions)
    .where(eq(devTransactions.id, parsed.sourceTransactionId))
    .limit(1);
  if (!source) throw new Error("Source transaction not found");
  const sourceAmt = BigInt(source.amountUsdMinor);
  // Use absolute value — outflows are stored signed in dev_transactions.
  const absAmt = sourceAmt < 0n ? -sourceAmt : sourceAmt;

  const computed = computeAllocationAmounts(absAmt, parsed.lines);

  return await db.transaction(async (tx) => {
    const [alloc] = await tx
      .insert(sharedCostAllocations)
      .values({
        organizationId,
        sourceTransactionId: parsed.sourceTransactionId,
        allocationMethod: parsed.allocationMethod,
        allocationBasis:
          (parsed.allocationBasis as typeof sharedCostAllocations.$inferInsert["allocationBasis"]) ??
          null,
        notes: parsed.notes ?? null,
      })
      .returning({ id: sharedCostAllocations.id });

    for (const line of computed) {
      await tx.insert(sharedCostAllocationLines).values({
        organizationId,
        allocationId: alloc.id,
        projectId: line.projectId,
        percentage: line.percentage.toFixed(4),
        amountMinor: line.amountMinor,
        currency: source.currency,
      });
    }

    return { allocationId: alloc.id, lineCount: computed.length };
  });
}

const approveSchema = z.object({ allocationId: z.string().uuid() });

/**
 * Approve an allocation. Marks it `applied` and (in the same transaction)
 * creates derivative `dev_transactions` rows pointing to each project,
 * one per allocation line. Each derivative line is tagged with the
 * source transaction's category and currency.
 *
 * For Stage 4.A.3 the derivative transactions reuse the source
 * account/category and amount sign — they're informational
 * "allocated cost" entries on each project's books, NOT additional
 * cash movements. The source transaction stays as the canonical cash
 * record.
 */
export async function approveSharedCostAllocation(
  input: z.input<typeof approveSchema>,
): Promise<{ ok: true; derivativeCount: number }> {
  const parsed = approveSchema.parse(input);
  const me = await requireInternalUser();
  const organizationId = await requireOrgId();
  const meId = me.appUser?.id ?? null;
  const db = requireDb();
  return await db.transaction(async (tx) => {
    const [alloc] = await tx
      .select()
      .from(sharedCostAllocations)
      .where(
        and(
          eq(sharedCostAllocations.id, parsed.allocationId),
          eq(sharedCostAllocations.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!alloc) throw new Error("Allocation not found");
    if (alloc.status !== "draft") {
      throw new Error(`Cannot approve allocation in '${alloc.status}' state`);
    }

    const [source] = await tx
      .select()
      .from(devTransactions)
      .where(eq(devTransactions.id, alloc.sourceTransactionId))
      .limit(1);
    if (!source) throw new Error("Source transaction missing");

    const lines = await tx
      .select()
      .from(sharedCostAllocationLines)
      .where(
        and(
          eq(sharedCostAllocationLines.allocationId, alloc.id),
          eq(sharedCostAllocationLines.organizationId, organizationId),
        ),
      );

    let derivativeCount = 0;
    for (const line of lines) {
      // Generate informational derivative txn. Sign matches the source
      // (outflows stay outflows on each project's slice).
      const sign = BigInt(source.amountUsdMinor) < 0n ? -1n : 1n;
      const signedAmount = sign * BigInt(line.amountMinor);
      const code = `ALLOC-${alloc.id.slice(0, 8)}-${line.projectId.slice(0, 4)}`;
      const [derived] = await tx
        .insert(devTransactions)
        .values({
          organizationId,
          transactionCode: code,
          bankAccountId: source.bankAccountId,
          direction: source.direction,
          categoryId: source.categoryId,
          projectId: line.projectId,
          amountMinor: BigInt(line.amountMinor),
          currency: line.currency,
          fxRateAtTransaction: source.fxRateAtTransaction,
          amountUsdMinor: signedAmount,
          counterpartyName: source.counterpartyName,
          transactionDate: source.transactionDate,
          description: `[shared cost allocation ${alloc.id.slice(0, 8)}] ${source.description}`,
          allocationType: "single_project",
          notes: `Derivative of ${source.transactionCode} (${line.percentage}%)`,
          taxClassificationStatus: "tax_exempt",
        })
        .returning({ id: devTransactions.id });
      await tx
        .update(sharedCostAllocationLines)
        .set({ derivativeTransactionId: derived.id })
        .where(
          and(
            eq(sharedCostAllocationLines.id, line.id),
            eq(sharedCostAllocationLines.organizationId, organizationId),
          ),
        );
      derivativeCount += 1;
    }

    await tx
      .update(sharedCostAllocations)
      .set({
        status: "applied",
        approvedBy: meId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(sharedCostAllocations.id, alloc.id),
          eq(sharedCostAllocations.organizationId, organizationId),
        ),
      );

    return { ok: true as const, derivativeCount };
  });
}

const reverseSchema = z.object({
  allocationId: z.string().uuid(),
  reason: z.string().min(3).max(500),
});

export async function reverseSharedCostAllocation(
  input: z.input<typeof reverseSchema>,
): Promise<{ ok: true }> {
  const parsed = reverseSchema.parse(input);
  await requireInternalUser();
  const organizationId = await requireOrgId();
  const db = requireDb();
  await db
    .update(sharedCostAllocations)
    .set({
      status: "reversed",
      notes: sql`COALESCE(${sharedCostAllocations.notes} || E'\n', '') || ${'[REVERSED] ' + parsed.reason}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(sharedCostAllocations.id, parsed.allocationId),
        eq(sharedCostAllocations.organizationId, organizationId),
      ),
    );
  return { ok: true };
}

// =========================================================================
// Read-side queries
// =========================================================================

export async function listSharedCostAllocations() {
  const db = requireDb();
  return await db
    .select()
    .from(sharedCostAllocations)
    .orderBy(sql`${sharedCostAllocations.createdAt} desc`);
}

export async function getSharedCostAllocation(allocationId: string) {
  const db = requireDb();
  const [alloc] = await db
    .select()
    .from(sharedCostAllocations)
    .where(eq(sharedCostAllocations.id, allocationId))
    .limit(1);
  if (!alloc) return null;
  const lines = await db
    .select()
    .from(sharedCostAllocationLines)
    .where(eq(sharedCostAllocationLines.allocationId, allocationId));
  return { allocation: alloc, lines };
}
