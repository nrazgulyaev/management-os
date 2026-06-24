import "server-only";

import { and, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import {
  capitalCommitments,
  investorWallets,
  walletTransactions,
} from "@/lib/db/schema/investor-capital";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";

/**
 * Wallet write actions. **All transactional**: every balance change
 * writes both an `investor_wallets` UPDATE and a `wallet_transactions`
 * INSERT in a single Drizzle transaction. If either fails, the whole
 * operation rolls back — there is no compensating action pattern in
 * this stage.
 */

const toBig = (v: bigint | string | number): bigint => {
  if (typeof v === "bigint") return v;
  return BigInt(typeof v === "number" ? Math.trunc(v) : v);
};

const withdrawSchema = z.object({
  walletId: z.string().uuid(),
  amountUsdMinor: z.union([z.bigint(), z.string(), z.number()]),
  paymentMethod: z.string().min(1).max(64),
  externalReference: z.string().optional().nullable(),
  occurredAt: z.string().optional(),
  description: z.string().optional().nullable(),
});

export async function withdrawFromWallet(
  input: z.input<typeof withdrawSchema>,
): Promise<{
  walletTransactionId: string;
  newAvailableBalanceUsdMinor: string;
}> {
  await requireInternalUser();
  const organizationId = await requireOrgId();
  const parsed = withdrawSchema.parse(input);
  const db = requireDb();
  const amountUsd = toBig(parsed.amountUsdMinor);
  if (amountUsd <= 0n) throw new Error("amountUsdMinor must be > 0");
  const occurredAt = parsed.occurredAt
    ? new Date(parsed.occurredAt)
    : new Date();

  return await db.transaction(async (tx) => {
    const [w] = await tx
      .select({
        id: investorWallets.id,
        commitmentId: investorWallets.commitmentId,
        availableBalanceUsdMinor: investorWallets.availableBalanceUsdMinor,
      })
      .from(investorWallets)
      .where(
        and(
          eq(investorWallets.id, parsed.walletId),
          eq(investorWallets.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!w) throw new Error("Wallet not found");

    // CONCURRENCY: debit SQL-side with a balance guard so two concurrent
    // withdrawals can't both pass a stale-snapshot check and overdraw. The
    // `>= amountUsd` predicate makes the UPDATE the atomic gate; if it matches
    // 0 rows the balance was insufficient at commit time → reject. Keep the
    // detailed insufficient-balance message (using the pre-read snapshot for
    // display only).
    const debited = await tx
      .update(investorWallets)
      .set({
        availableBalanceUsdMinor: sql`${investorWallets.availableBalanceUsdMinor} - ${amountUsd}`,
        totalWithdrawnUsdMinor: sql`${investorWallets.totalWithdrawnUsdMinor} + ${amountUsd}`,
        lastActivityAt: occurredAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(investorWallets.id, w.id),
          eq(investorWallets.organizationId, organizationId),
          gte(investorWallets.availableBalanceUsdMinor, amountUsd),
        ),
      )
      .returning({
        availableBalanceUsdMinor: investorWallets.availableBalanceUsdMinor,
        holdBalanceUsdMinor: investorWallets.holdBalanceUsdMinor,
      });
    if (debited.length !== 1) {
      throw new Error(
        `Insufficient available balance: have USD ${(Number(w.availableBalanceUsdMinor) / 100).toFixed(2)}, need USD ${(Number(amountUsd) / 100).toFixed(2)}`,
      );
    }
    const newAvailable = BigInt(debited[0].availableBalanceUsdMinor);
    const newHold = BigInt(debited[0].holdBalanceUsdMinor);

    const [walletTx] = await tx
      .insert(walletTransactions)
      .values({
        walletId: w.id,
        commitmentId: w.commitmentId,
        transactionType: "wallet_withdrawal",
        amountUsdMinor: -amountUsd, // negative = outflow
        balanceAvailableAfterUsdMinor: newAvailable,
        balanceHoldAfterUsdMinor: newHold,
        description:
          parsed.description ?? `Withdrawal via ${parsed.paymentMethod}`,
        externalReference: parsed.externalReference ?? null,
        occurredAt,
      })
      .returning({ id: walletTransactions.id });

    return {
      walletTransactionId: walletTx.id,
      newAvailableBalanceUsdMinor: newAvailable.toString(),
    };
  });
}

const reinvestSchema = z.object({
  sourceWalletId: z.string().uuid(),
  amountUsdMinor: z.union([z.bigint(), z.string(), z.number()]),
  targetCommitmentId: z.string().uuid(),
  occurredAt: z.string().optional(),
  description: z.string().optional().nullable(),
});

/**
 * Atomic two-leg transaction: moves funds from one commitment's wallet
 * into another commitment's wallet. Both wallets and both
 * `wallet_transactions` rows are written inside the same DB transaction.
 *
 * The target commitment must be active. The source wallet must have
 * sufficient available balance.
 */
export async function reinvestFromWallet(
  input: z.input<typeof reinvestSchema>,
): Promise<{
  outTransactionId: string;
  inTransactionId: string;
}> {
  await requireInternalUser();
  const organizationId = await requireOrgId();
  const parsed = reinvestSchema.parse(input);
  const db = requireDb();
  const amountUsd = toBig(parsed.amountUsdMinor);
  if (amountUsd <= 0n) throw new Error("amountUsdMinor must be > 0");
  const occurredAt = parsed.occurredAt
    ? new Date(parsed.occurredAt)
    : new Date();

  return await db.transaction(async (tx) => {
    const [source] = await tx
      .select({
        id: investorWallets.id,
        commitmentId: investorWallets.commitmentId,
      })
      .from(investorWallets)
      .where(
        and(
          eq(investorWallets.id, parsed.sourceWalletId),
          eq(investorWallets.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!source) throw new Error("Source wallet not found");

    const [targetCommitment] = await tx
      .select({
        id: capitalCommitments.id,
        status: capitalCommitments.status,
        organizationId: capitalCommitments.organizationId,
      })
      .from(capitalCommitments)
      .where(eq(capitalCommitments.id, parsed.targetCommitmentId))
      .limit(1);
    // capital_commitments.organization_id is a nullable legacy column
    // (migration 0072): NULL = pre-threading row (allowed); a set-but-
    // mismatched org means a cross-org target and is rejected.
    if (
      !targetCommitment ||
      (targetCommitment.organizationId &&
        targetCommitment.organizationId !== organizationId)
    ) {
      throw new Error("Target commitment not found");
    }
    if (targetCommitment.status !== "active") {
      throw new Error(
        `Target commitment must be active (got '${targetCommitment.status}')`,
      );
    }
    if (parsed.sourceWalletId === parsed.targetCommitmentId) {
      throw new Error("Cannot reinvest into the same commitment");
    }

    const [target] = await tx
      .select({
        id: investorWallets.id,
        commitmentId: investorWallets.commitmentId,
      })
      .from(investorWallets)
      .where(
        and(
          eq(investorWallets.commitmentId, targetCommitment.id),
          eq(investorWallets.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!target) {
      throw new Error("Target wallet not found (commitment lacks a wallet row)");
    }

    // Source leg — CONCURRENCY: guarded SQL-side debit. The `>= amountUsd`
    // predicate makes the UPDATE the atomic gate; 0 rows = insufficient
    // balance at commit time.
    const debited = await tx
      .update(investorWallets)
      .set({
        availableBalanceUsdMinor: sql`${investorWallets.availableBalanceUsdMinor} - ${amountUsd}`,
        totalReinvestedUsdMinor: sql`${investorWallets.totalReinvestedUsdMinor} + ${amountUsd}`,
        lastActivityAt: occurredAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(investorWallets.id, source.id),
          eq(investorWallets.organizationId, organizationId),
          gte(investorWallets.availableBalanceUsdMinor, amountUsd),
        ),
      )
      .returning({
        availableBalanceUsdMinor: investorWallets.availableBalanceUsdMinor,
        holdBalanceUsdMinor: investorWallets.holdBalanceUsdMinor,
      });
    if (debited.length !== 1) {
      throw new Error("Insufficient available balance in source wallet");
    }
    const newSourceAvail = BigInt(debited[0].availableBalanceUsdMinor);

    const [outTx] = await tx
      .insert(walletTransactions)
      .values({
        walletId: source.id,
        commitmentId: source.commitmentId,
        transactionType: "wallet_reinvest_out",
        amountUsdMinor: -amountUsd,
        balanceAvailableAfterUsdMinor: newSourceAvail,
        balanceHoldAfterUsdMinor: BigInt(debited[0].holdBalanceUsdMinor),
        reinvestTargetCommitmentId: targetCommitment.id,
        description:
          parsed.description ??
          `Reinvest into commitment ${targetCommitment.id}`,
        occurredAt,
      })
      .returning({ id: walletTransactions.id });

    // Target leg — CONCURRENCY: SQL-side increment composes under concurrent
    // writes; RETURNING gives the authoritative post-balances for the ledger.
    const [creditedTarget] = await tx
      .update(investorWallets)
      .set({
        availableBalanceUsdMinor: sql`${investorWallets.availableBalanceUsdMinor} + ${amountUsd}`,
        // Reinvest-in counts as drawn capital from the system's POV
        totalDrawnUsdMinor: sql`${investorWallets.totalDrawnUsdMinor} + ${amountUsd}`,
        lastActivityAt: occurredAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(investorWallets.id, target.id),
          eq(investorWallets.organizationId, organizationId),
        ),
      )
      .returning({
        availableBalanceUsdMinor: investorWallets.availableBalanceUsdMinor,
        holdBalanceUsdMinor: investorWallets.holdBalanceUsdMinor,
      });
    const newTargetAvail = BigInt(creditedTarget.availableBalanceUsdMinor);

    const [inTx] = await tx
      .insert(walletTransactions)
      .values({
        walletId: target.id,
        commitmentId: target.commitmentId,
        transactionType: "wallet_reinvest_in",
        amountUsdMinor: amountUsd,
        balanceAvailableAfterUsdMinor: newTargetAvail,
        balanceHoldAfterUsdMinor: BigInt(creditedTarget.holdBalanceUsdMinor),
        reinvestTargetCommitmentId: source.commitmentId, // reverse pointer
        description:
          parsed.description ??
          `Reinvest from commitment ${source.commitmentId}`,
        occurredAt,
      })
      .returning({ id: walletTransactions.id });

    return { outTransactionId: outTx.id, inTransactionId: inTx.id };
  });
}

const holdSchema = z.object({
  walletId: z.string().uuid(),
  amountUsdMinor: z.union([z.bigint(), z.string(), z.number()]),
  reason: z.string().min(3),
});

export async function setWalletHold(
  input: z.input<typeof holdSchema>,
): Promise<{ walletTransactionId: string }> {
  await requireInternalUser();
  const organizationId = await requireOrgId();
  const parsed = holdSchema.parse(input);
  const db = requireDb();
  const amountUsd = toBig(parsed.amountUsdMinor);
  if (amountUsd <= 0n) throw new Error("amountUsdMinor must be > 0");

  return await db.transaction(async (tx) => {
    const [w] = await tx
      .select({
        id: investorWallets.id,
        commitmentId: investorWallets.commitmentId,
      })
      .from(investorWallets)
      .where(
        and(
          eq(investorWallets.id, parsed.walletId),
          eq(investorWallets.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!w) throw new Error("Wallet not found");

    const occurredAt = new Date();

    // CONCURRENCY: move funds available→hold SQL-side with a balance guard so
    // concurrent holds can't over-commit available. 0 rows = insufficient.
    const held = await tx
      .update(investorWallets)
      .set({
        availableBalanceUsdMinor: sql`${investorWallets.availableBalanceUsdMinor} - ${amountUsd}`,
        holdBalanceUsdMinor: sql`${investorWallets.holdBalanceUsdMinor} + ${amountUsd}`,
        lastActivityAt: occurredAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(investorWallets.id, w.id),
          eq(investorWallets.organizationId, organizationId),
          gte(investorWallets.availableBalanceUsdMinor, amountUsd),
        ),
      )
      .returning({
        availableBalanceUsdMinor: investorWallets.availableBalanceUsdMinor,
        holdBalanceUsdMinor: investorWallets.holdBalanceUsdMinor,
      });
    if (held.length !== 1) {
      throw new Error("Insufficient available balance to hold");
    }
    const newAvail = BigInt(held[0].availableBalanceUsdMinor);
    const newHold = BigInt(held[0].holdBalanceUsdMinor);

    const [walletTx] = await tx
      .insert(walletTransactions)
      .values({
        walletId: w.id,
        commitmentId: w.commitmentId,
        transactionType: "wallet_hold_set",
        amountUsdMinor: amountUsd,
        balanceAvailableAfterUsdMinor: newAvail,
        balanceHoldAfterUsdMinor: newHold,
        description: parsed.reason,
        occurredAt,
      })
      .returning({ id: walletTransactions.id });

    return { walletTransactionId: walletTx.id };
  });
}

export async function releaseWalletHold(
  input: z.input<typeof holdSchema>,
): Promise<{ walletTransactionId: string }> {
  await requireInternalUser();
  const organizationId = await requireOrgId();
  const parsed = holdSchema.parse(input);
  const db = requireDb();
  const amountUsd = toBig(parsed.amountUsdMinor);
  if (amountUsd <= 0n) throw new Error("amountUsdMinor must be > 0");

  return await db.transaction(async (tx) => {
    const [w] = await tx
      .select({
        id: investorWallets.id,
        commitmentId: investorWallets.commitmentId,
      })
      .from(investorWallets)
      .where(
        and(
          eq(investorWallets.id, parsed.walletId),
          eq(investorWallets.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!w) throw new Error("Wallet not found");

    const occurredAt = new Date();

    // CONCURRENCY: move funds hold→available SQL-side with a hold guard so
    // concurrent releases can't release more than is held. 0 rows = insufficient.
    const released = await tx
      .update(investorWallets)
      .set({
        availableBalanceUsdMinor: sql`${investorWallets.availableBalanceUsdMinor} + ${amountUsd}`,
        holdBalanceUsdMinor: sql`${investorWallets.holdBalanceUsdMinor} - ${amountUsd}`,
        lastActivityAt: occurredAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(investorWallets.id, w.id),
          eq(investorWallets.organizationId, organizationId),
          gte(investorWallets.holdBalanceUsdMinor, amountUsd),
        ),
      )
      .returning({
        availableBalanceUsdMinor: investorWallets.availableBalanceUsdMinor,
        holdBalanceUsdMinor: investorWallets.holdBalanceUsdMinor,
      });
    if (released.length !== 1) {
      throw new Error("Insufficient hold balance to release");
    }
    const newAvail = BigInt(released[0].availableBalanceUsdMinor);
    const newHold = BigInt(released[0].holdBalanceUsdMinor);

    const [walletTx] = await tx
      .insert(walletTransactions)
      .values({
        walletId: w.id,
        commitmentId: w.commitmentId,
        transactionType: "wallet_hold_release",
        amountUsdMinor: amountUsd,
        balanceAvailableAfterUsdMinor: newAvail,
        balanceHoldAfterUsdMinor: newHold,
        description: parsed.reason,
        occurredAt,
      })
      .returning({ id: walletTransactions.id });

    return { walletTransactionId: walletTx.id };
  });
}

const adjustmentSchema = z.object({
  walletId: z.string().uuid(),
  amountUsdMinor: z.union([z.bigint(), z.string(), z.number()]),
  reason: z.string().min(3),
});

/**
 * Manual adjustment to a wallet's available balance. Use sparingly — every
 * adjustment requires an audit reason. Positive amount adds to available,
 * negative amount removes (subject to enough balance).
 */
export async function walletAdjustment(
  input: z.input<typeof adjustmentSchema>,
): Promise<{ walletTransactionId: string }> {
  await requireInternalUser();
  const organizationId = await requireOrgId();
  const parsed = adjustmentSchema.parse(input);
  const db = requireDb();
  const delta = toBig(parsed.amountUsdMinor);

  return await db.transaction(async (tx) => {
    const [w] = await tx
      .select({
        id: investorWallets.id,
        commitmentId: investorWallets.commitmentId,
      })
      .from(investorWallets)
      .where(
        and(
          eq(investorWallets.id, parsed.walletId),
          eq(investorWallets.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!w) throw new Error("Wallet not found");

    const occurredAt = new Date();

    // CONCURRENCY: apply the delta SQL-side with a non-negative guard so a
    // concurrent debit can't let two adjustments race the balance below zero.
    // The `available + delta >= 0` predicate makes the UPDATE the atomic gate;
    // works for both positive and negative deltas. 0 rows = would go negative.
    const adjusted = await tx
      .update(investorWallets)
      .set({
        availableBalanceUsdMinor: sql`${investorWallets.availableBalanceUsdMinor} + ${delta}`,
        lastActivityAt: occurredAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(investorWallets.id, w.id),
          eq(investorWallets.organizationId, organizationId),
          sql`${investorWallets.availableBalanceUsdMinor} + ${delta} >= 0`,
        ),
      )
      .returning({
        availableBalanceUsdMinor: investorWallets.availableBalanceUsdMinor,
        holdBalanceUsdMinor: investorWallets.holdBalanceUsdMinor,
      });
    if (adjusted.length !== 1) {
      throw new Error("Adjustment would make available balance negative");
    }
    const newAvail = BigInt(adjusted[0].availableBalanceUsdMinor);
    const newHold = BigInt(adjusted[0].holdBalanceUsdMinor);

    const [walletTx] = await tx
      .insert(walletTransactions)
      .values({
        walletId: w.id,
        commitmentId: w.commitmentId,
        transactionType: "adjustment",
        amountUsdMinor: delta,
        balanceAvailableAfterUsdMinor: newAvail,
        balanceHoldAfterUsdMinor: newHold,
        description: parsed.reason,
        occurredAt,
      })
      .returning({ id: walletTransactions.id });

    return { walletTransactionId: walletTx.id };
  });
}
