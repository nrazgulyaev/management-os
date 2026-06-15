import "server-only";

import { eq, sql, and, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import {
  distributionAllocations,
  distributions,
  investorWallets,
  walletTransactions,
} from "@/lib/db/schema/investor-capital";
import {
  DISTRIBUTION_TRIGGER_REASONS,
  DISTRIBUTION_TYPES,
} from "@/lib/development/constants/investor-constants";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { recordAuditEvent } from "@/features/audit/services";
import {
  computeCapitalReturn,
  computeProfitDistribution,
  _internals,
} from "./distributions";

const declareSchema = z.object({
  projectId: z.string().uuid().nullable(),
  totalAmountUsdMinor: z.union([z.bigint(), z.string(), z.number()]),
  distributionType: z.enum(DISTRIBUTION_TYPES),
  triggerReason: z.enum(DISTRIBUTION_TRIGGER_REASONS),
  triggerCompanyBalanceUsdMinor: z
    .union([z.bigint(), z.string(), z.number()])
    .optional()
    .nullable(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional().nullable(),
});

const toBig = (v: bigint | string | number): bigint =>
  typeof v === "bigint"
    ? v
    : BigInt(typeof v === "number" ? Math.trunc(v) : v);

/**
 * **`declareDistribution`** — atomic. Computes the per-commitment
 * allocation rows from the same algorithm as `previewDistribution` and
 * persists them in a single transaction with the parent `distributions`
 * row. Status starts at `'declared'`; no wallet balances move yet.
 *
 * Returns the new distribution_id and the computed allocations so the UI
 * can confirm before clicking "Execute".
 */
export async function declareDistribution(
  input: z.input<typeof declareSchema>,
): Promise<{
  distributionId: string;
  distributionNumber: number;
  allocationCount: number;
  totalAllocatedUsdMinor: string;
  unallocatedUsdMinor: string;
}> {
  const ctx = await requireInternalUser();
  const organizationId = await requireOrgId();
  const parsed = declareSchema.parse(input);
  const total = toBig(parsed.totalAmountUsdMinor);
  if (total <= 0n) throw new Error("totalAmountUsdMinor must be > 0");

  const db = requireDb();

  // Compute allocations OUTSIDE the transaction (pure read of a snapshot
  // that's stable on the order of ms — re-reading inside the tx would
  // require holding row locks which postgres-js doesn't expose cleanly).
  const snapshots = await _internals.loadCommitmentSnapshots(
    parsed.projectId,
    organizationId,
  );
  if (snapshots.length === 0) {
    throw new Error(
      "No active commitments found for this project — cannot allocate distribution",
    );
  }

  let capitalMap = new Map<string, bigint>();
  let profitMap = new Map<string, bigint>();
  if (parsed.distributionType === "capital_return") {
    capitalMap = computeCapitalReturn(snapshots, total);
  } else if (parsed.distributionType === "profit_distribution") {
    profitMap = computeProfitDistribution(snapshots, total);
  } else {
    capitalMap = computeCapitalReturn(snapshots, total);
    let allocated = 0n;
    for (const v of capitalMap.values()) allocated += v;
    if (allocated < total) {
      profitMap = computeProfitDistribution(snapshots, total - allocated);
    }
  }

  const allCommitmentIds = new Set<string>([
    ...capitalMap.keys(),
    ...profitMap.keys(),
  ]);
  if (allCommitmentIds.size === 0) {
    throw new Error(
      "Distribution would allocate $0 — check that commitments have outstanding capital (for capital_return) or are drawn (for profit_distribution)",
    );
  }

  const result = await db.transaction(async (tx) => {
    const [maxRow] = await tx
      .select({
        next: sql<number>`coalesce(max(distribution_number), 0)::int + 1`,
      })
      .from(distributions)
      .where(
        parsed.projectId
          ? eq(distributions.projectId, parsed.projectId)
          : isNull(distributions.projectId),
      );
    const distributionNumber = Number(maxRow?.next ?? 1);

    const [d] = await tx
      .insert(distributions)
      .values({
        organizationId,
        projectId: parsed.projectId,
        distributionNumber,
        distributionType: parsed.distributionType,
        totalAmountUsdMinor: total,
        triggerReason: parsed.triggerReason,
        triggerCompanyBalanceUsdMinor:
          parsed.triggerCompanyBalanceUsdMinor != null
            ? toBig(parsed.triggerCompanyBalanceUsdMinor)
            : null,
        effectiveDate: parsed.effectiveDate,
        notes: parsed.notes ?? null,
        status: "declared",
        declaredBy: ctx.appUser?.id ?? null,
      })
      .returning({ id: distributions.id });

    let totalAllocated = 0n;
    for (const s of snapshots) {
      if (!allCommitmentIds.has(s.commitmentId)) continue;
      const cap = capitalMap.get(s.commitmentId) ?? 0n;
      const profit = profitMap.get(s.commitmentId) ?? 0n;
      if (cap === 0n && profit === 0n) continue;
      await tx.insert(distributionAllocations).values({
        organizationId,
        distributionId: d.id,
        commitmentId: s.commitmentId,
        capitalReturnAmountUsdMinor: cap,
        profitAmountUsdMinor: profit,
        totalAmountUsdMinor: cap + profit,
        outstandingCapitalAtDeclareUsdMinor: s.outstandingCapitalUsdMinor,
        profitSharePercentUsed: s.profitSharePercent,
        status: "pending",
      });
      totalAllocated += cap + profit;
    }

    return {
      distributionId: d.id,
      distributionNumber,
      allocationCount: allCommitmentIds.size,
      totalAllocatedUsdMinor: totalAllocated.toString(),
      unallocatedUsdMinor: (total - totalAllocated).toString(),
    };
  });

  await recordAuditEvent({
    action: "distribution.declare",
    entityType: "distribution",
    entityId: result.distributionId,
    actorUserId: ctx.appUser?.id ?? null,
    organizationId,
    after: {
      projectId: parsed.projectId,
      distributionNumber: result.distributionNumber,
      distributionType: parsed.distributionType,
      totalAmountUsdMinor: total.toString(),
      triggerReason: parsed.triggerReason,
      effectiveDate: parsed.effectiveDate,
      allocationCount: result.allocationCount,
      totalAllocatedUsdMinor: result.totalAllocatedUsdMinor,
      status: "declared",
    },
  });

  return result;
}

/**
 * **`executeDistribution`** — atomic. Walks every pending allocation and
 * moves money into the corresponding wallet. For each allocation:
 *
 *   1. INSERT a `wallet_transactions` row of type 'capital_return' (if cap > 0)
 *      and/or 'profit_distribution' (if profit > 0) — separate rows so the
 *      ledger reads cleanly. Each row gets the allocation_id linked via
 *      `distribution_id`.
 *   2. UPDATE the wallet's `available_balance_usd_minor` (+= total),
 *      `total_returned_capital_usd_minor` (+= cap),
 *      `total_profit_distributed_usd_minor` (+= profit).
 *   3. UPDATE the allocation row with status='executed', executed_at,
 *      and the wallet_transaction_id of the LAST row (or capital row
 *      if both — convention: capital row is primary).
 *
 * Distribution itself transitions `declared → executing → completed`.
 * If any allocation fails, the whole tx rolls back.
 *
 * Cash-out to investors (i.e. moving money from a bank account) is NOT
 * part of this action — that's `withdrawFromWallet`. This action only
 * attributes funds to wallets.
 */
export async function executeDistribution(distributionId: string): Promise<{
  executedAllocations: number;
  totalExecutedUsdMinor: string;
}> {
  const ctx = await requireInternalUser();
  const organizationId = await requireOrgId();
  const db = requireDb();

  const result = await db.transaction(async (tx) => {
    // SECURITY (IDOR): scope the load by org so a foreign distribution id
    // returns no row and cannot be executed. Single-tenant today => the
    // extra predicate is a no-op against current behaviour.
    const [d] = await tx
      .select()
      .from(distributions)
      .where(
        and(
          eq(distributions.id, distributionId),
          eq(distributions.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!d) throw new Error("Distribution not found");
    if (d.status !== "declared") {
      throw new Error(
        `Cannot execute distribution with status='${d.status}' (must be 'declared')`,
      );
    }

    // Mark as executing so concurrent attempts can't double-process.
    await tx
      .update(distributions)
      .set({ status: "executing", updatedAt: new Date() })
      .where(
        and(
          eq(distributions.id, distributionId),
          eq(distributions.organizationId, organizationId),
        ),
      );

    const allocs = await tx
      .select()
      .from(distributionAllocations)
      .where(
        and(
          eq(distributionAllocations.distributionId, distributionId),
          eq(distributionAllocations.status, "pending"),
        ),
      );

    let executed = 0;
    let totalExecuted = 0n;
    const occurredAt = new Date();

    for (const a of allocs) {
      const [wallet] = await tx
        .select()
        .from(investorWallets)
        .where(eq(investorWallets.commitmentId, a.commitmentId))
        .limit(1);
      if (!wallet) {
        throw new Error(
          `Wallet missing for commitment ${a.commitmentId} — distribution aborted`,
        );
      }
      const cap = BigInt(a.capitalReturnAmountUsdMinor);
      const profit = BigInt(a.profitAmountUsdMinor);
      const totalForCommitment = cap + profit;

      const newAvail =
        BigInt(wallet.availableBalanceUsdMinor) + totalForCommitment;
      const newHold = BigInt(wallet.holdBalanceUsdMinor);

      // Capital_return wallet_tx row (if cap > 0)
      let primaryTxId: string | null = null;
      let runningAvail = BigInt(wallet.availableBalanceUsdMinor);
      if (cap > 0n) {
        runningAvail += cap;
        const [txRow] = await tx
          .insert(walletTransactions)
          .values({
            walletId: wallet.id,
            commitmentId: a.commitmentId,
            transactionType: "capital_return",
            amountUsdMinor: cap,
            balanceAvailableAfterUsdMinor: runningAvail,
            balanceHoldAfterUsdMinor: newHold,
            distributionId: d.id,
            description: `Capital return — distribution #${d.distributionNumber}`,
            occurredAt,
          })
          .returning({ id: walletTransactions.id });
        primaryTxId = txRow.id;
      }
      if (profit > 0n) {
        runningAvail += profit;
        const [txRow] = await tx
          .insert(walletTransactions)
          .values({
            walletId: wallet.id,
            commitmentId: a.commitmentId,
            transactionType: "profit_distribution",
            amountUsdMinor: profit,
            balanceAvailableAfterUsdMinor: runningAvail,
            balanceHoldAfterUsdMinor: newHold,
            distributionId: d.id,
            description: `Profit distribution — distribution #${d.distributionNumber}`,
            occurredAt,
          })
          .returning({ id: walletTransactions.id });
        if (!primaryTxId) primaryTxId = txRow.id;
      }

      await tx
        .update(investorWallets)
        .set({
          availableBalanceUsdMinor: newAvail,
          totalReturnedCapitalUsdMinor:
            BigInt(wallet.totalReturnedCapitalUsdMinor) + cap,
          totalProfitDistributedUsdMinor:
            BigInt(wallet.totalProfitDistributedUsdMinor) + profit,
          lastActivityAt: occurredAt,
          updatedAt: new Date(),
        })
        .where(eq(investorWallets.id, wallet.id));

      await tx
        .update(distributionAllocations)
        .set({
          status: "executed",
          executedAt: occurredAt,
          walletTransactionId: primaryTxId,
          updatedAt: new Date(),
        })
        .where(eq(distributionAllocations.id, a.id));

      executed += 1;
      totalExecuted += totalForCommitment;
    }

    await tx
      .update(distributions)
      .set({
        status: "completed",
        completedAt: occurredAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(distributions.id, distributionId),
          eq(distributions.organizationId, organizationId),
        ),
      );

    return {
      executedAllocations: executed,
      totalExecutedUsdMinor: totalExecuted.toString(),
      distributionNumber: d.distributionNumber,
    };
  });

  await recordAuditEvent({
    action: "distribution.execute",
    entityType: "distribution",
    entityId: distributionId,
    actorUserId: ctx.appUser?.id ?? null,
    organizationId,
    before: { status: "declared" },
    after: {
      status: "completed",
      distributionNumber: result.distributionNumber,
      executedAllocations: result.executedAllocations,
      totalExecutedUsdMinor: result.totalExecutedUsdMinor,
    },
  });

  return {
    executedAllocations: result.executedAllocations,
    totalExecutedUsdMinor: result.totalExecutedUsdMinor,
  };
}

export async function cancelDistribution(
  distributionId: string,
  reason: string,
): Promise<void> {
  const ctx = await requireInternalUser();
  const organizationId = await requireOrgId();
  if (!reason || reason.trim().length < 3) {
    throw new Error("cancelDistribution: reason is required (min 3 chars)");
  }
  const db = requireDb();

  await db.transaction(async (tx) => {
    // SECURITY (IDOR): scope by org so a foreign distribution cannot be
    // cancelled.
    const [d] = await tx
      .select({ status: distributions.status })
      .from(distributions)
      .where(
        and(
          eq(distributions.id, distributionId),
          eq(distributions.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!d) throw new Error("Distribution not found");
    if (d.status !== "declared") {
      throw new Error(
        `Cannot cancel distribution with status='${d.status}' — only 'declared' distributions can be cancelled`,
      );
    }
    await tx
      .update(distributionAllocations)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(
        and(
          eq(distributionAllocations.distributionId, distributionId),
          eq(distributionAllocations.organizationId, organizationId),
        ),
      );
    await tx
      .update(distributions)
      .set({
        status: "cancelled",
        notes: reason,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(distributions.id, distributionId),
          eq(distributions.organizationId, organizationId),
        ),
      );
  });

  await recordAuditEvent({
    action: "distribution.cancel",
    entityType: "distribution",
    entityId: distributionId,
    actorUserId: ctx.appUser?.id ?? null,
    organizationId,
    before: { status: "declared" },
    after: { status: "cancelled", reason },
  });
}

// ---------------------------------------------------------------------------
// Stage 6.P7-CATCHUP — Edit a declared (not-yet-executed) distribution.
//
// Once executed, distributions are immutable (allocations have moved real
// wallet balances). Editing is therefore restricted to the `declared` state
// where allocations have only been computed, not credited.
// ---------------------------------------------------------------------------

const editDistributionSchema = z.object({
  id: z.string().uuid(),
  effectiveDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .optional(),
  notes: z.string().max(2000).nullable().optional(),
  triggerReason: z.enum(DISTRIBUTION_TRIGGER_REASONS).optional(),
});

/**
 * Edit a declared distribution's metadata. Refuses edits to executed,
 * cancelled, or completed distributions.
 *
 * Note: changing `totalAmountUsdMinor` would require recomputing every
 * allocation row — that's a bigger redeclare flow, intentionally out of
 * scope. Operators wanting to change the amount should `cancelDistribution`
 * + `declareDistribution` again.
 */
export async function editDistribution(
  input: z.input<typeof editDistributionSchema>,
): Promise<void> {
  const ctx = await requireInternalUser();
  const organizationId = await requireOrgId();
  const parsed = editDistributionSchema.parse(input);
  const db = requireDb();

  // SECURITY (IDOR): scope by org so a foreign distribution cannot be edited.
  const [existing] = await db
    .select({ status: distributions.status })
    .from(distributions)
    .where(
      and(
        eq(distributions.id, parsed.id),
        eq(distributions.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!existing) throw new Error("Distribution not found");
  if (existing.status !== "declared") {
    throw new Error(
      `Cannot edit distribution with status='${existing.status}' — only 'declared' distributions accept metadata edits`,
    );
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.effectiveDate !== undefined)
    patch.effectiveDate = parsed.effectiveDate;
  if (parsed.notes !== undefined) patch.notes = parsed.notes;
  if (parsed.triggerReason !== undefined)
    patch.triggerReason = parsed.triggerReason;

  await db
    .update(distributions)
    .set(patch)
    .where(
      and(
        eq(distributions.id, parsed.id),
        eq(distributions.organizationId, organizationId),
      ),
    );

  await recordAuditEvent({
    action: "distribution.edit",
    entityType: "distribution",
    entityId: parsed.id,
    actorUserId: ctx.appUser?.id ?? null,
    organizationId,
    after: {
      effectiveDate: parsed.effectiveDate ?? null,
      notes: parsed.notes ?? null,
      triggerReason: parsed.triggerReason ?? null,
    },
  });
}
