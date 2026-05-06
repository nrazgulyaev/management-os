import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import {
  capitalCommitments,
  investorWallets,
  walletTransactions,
} from "@/lib/db/schema/investor-capital";

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
  const parsed = withdrawSchema.parse(input);
  const db = requireDb();
  const amountUsd = toBig(parsed.amountUsdMinor);
  if (amountUsd <= 0n) throw new Error("amountUsdMinor must be > 0");
  const occurredAt = parsed.occurredAt
    ? new Date(parsed.occurredAt)
    : new Date();

  return await db.transaction(async (tx) => {
    const [w] = await tx
      .select()
      .from(investorWallets)
      .where(eq(investorWallets.id, parsed.walletId))
      .limit(1);
    if (!w) throw new Error("Wallet not found");
    if (BigInt(w.availableBalanceUsdMinor) < amountUsd) {
      throw new Error(
        `Insufficient available balance: have USD ${(Number(w.availableBalanceUsdMinor) / 100).toFixed(2)}, need USD ${(Number(amountUsd) / 100).toFixed(2)}`,
      );
    }

    const newAvailable = BigInt(w.availableBalanceUsdMinor) - amountUsd;
    const newHold = BigInt(w.holdBalanceUsdMinor);

    await tx
      .update(investorWallets)
      .set({
        availableBalanceUsdMinor: newAvailable,
        totalWithdrawnUsdMinor: BigInt(w.totalWithdrawnUsdMinor) + amountUsd,
        lastActivityAt: occurredAt,
        updatedAt: new Date(),
      })
      .where(eq(investorWallets.id, w.id));

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
  const parsed = reinvestSchema.parse(input);
  const db = requireDb();
  const amountUsd = toBig(parsed.amountUsdMinor);
  if (amountUsd <= 0n) throw new Error("amountUsdMinor must be > 0");
  const occurredAt = parsed.occurredAt
    ? new Date(parsed.occurredAt)
    : new Date();

  return await db.transaction(async (tx) => {
    const [source] = await tx
      .select()
      .from(investorWallets)
      .where(eq(investorWallets.id, parsed.sourceWalletId))
      .limit(1);
    if (!source) throw new Error("Source wallet not found");
    if (BigInt(source.availableBalanceUsdMinor) < amountUsd) {
      throw new Error("Insufficient available balance in source wallet");
    }

    const [targetCommitment] = await tx
      .select({
        id: capitalCommitments.id,
        status: capitalCommitments.status,
      })
      .from(capitalCommitments)
      .where(eq(capitalCommitments.id, parsed.targetCommitmentId))
      .limit(1);
    if (!targetCommitment) throw new Error("Target commitment not found");
    if (targetCommitment.status !== "active") {
      throw new Error(
        `Target commitment must be active (got '${targetCommitment.status}')`,
      );
    }
    if (parsed.sourceWalletId === parsed.targetCommitmentId) {
      throw new Error("Cannot reinvest into the same commitment");
    }

    const [target] = await tx
      .select()
      .from(investorWallets)
      .where(eq(investorWallets.commitmentId, targetCommitment.id))
      .limit(1);
    if (!target) {
      throw new Error("Target wallet not found (commitment lacks a wallet row)");
    }

    // Source leg
    const newSourceAvail =
      BigInt(source.availableBalanceUsdMinor) - amountUsd;
    await tx
      .update(investorWallets)
      .set({
        availableBalanceUsdMinor: newSourceAvail,
        totalReinvestedUsdMinor:
          BigInt(source.totalReinvestedUsdMinor) + amountUsd,
        lastActivityAt: occurredAt,
        updatedAt: new Date(),
      })
      .where(eq(investorWallets.id, source.id));

    const [outTx] = await tx
      .insert(walletTransactions)
      .values({
        walletId: source.id,
        commitmentId: source.commitmentId,
        transactionType: "wallet_reinvest_out",
        amountUsdMinor: -amountUsd,
        balanceAvailableAfterUsdMinor: newSourceAvail,
        balanceHoldAfterUsdMinor: BigInt(source.holdBalanceUsdMinor),
        reinvestTargetCommitmentId: targetCommitment.id,
        description:
          parsed.description ??
          `Reinvest into commitment ${targetCommitment.id}`,
        occurredAt,
      })
      .returning({ id: walletTransactions.id });

    // Target leg
    const newTargetAvail =
      BigInt(target.availableBalanceUsdMinor) + amountUsd;
    await tx
      .update(investorWallets)
      .set({
        availableBalanceUsdMinor: newTargetAvail,
        // Reinvest-in counts as drawn capital from the system's POV
        totalDrawnUsdMinor: BigInt(target.totalDrawnUsdMinor) + amountUsd,
        lastActivityAt: occurredAt,
        updatedAt: new Date(),
      })
      .where(eq(investorWallets.id, target.id));

    const [inTx] = await tx
      .insert(walletTransactions)
      .values({
        walletId: target.id,
        commitmentId: target.commitmentId,
        transactionType: "wallet_reinvest_in",
        amountUsdMinor: amountUsd,
        balanceAvailableAfterUsdMinor: newTargetAvail,
        balanceHoldAfterUsdMinor: BigInt(target.holdBalanceUsdMinor),
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
  const parsed = holdSchema.parse(input);
  const db = requireDb();
  const amountUsd = toBig(parsed.amountUsdMinor);
  if (amountUsd <= 0n) throw new Error("amountUsdMinor must be > 0");

  return await db.transaction(async (tx) => {
    const [w] = await tx
      .select()
      .from(investorWallets)
      .where(eq(investorWallets.id, parsed.walletId))
      .limit(1);
    if (!w) throw new Error("Wallet not found");
    if (BigInt(w.availableBalanceUsdMinor) < amountUsd) {
      throw new Error("Insufficient available balance to hold");
    }

    const newAvail = BigInt(w.availableBalanceUsdMinor) - amountUsd;
    const newHold = BigInt(w.holdBalanceUsdMinor) + amountUsd;
    const occurredAt = new Date();

    await tx
      .update(investorWallets)
      .set({
        availableBalanceUsdMinor: newAvail,
        holdBalanceUsdMinor: newHold,
        lastActivityAt: occurredAt,
        updatedAt: new Date(),
      })
      .where(eq(investorWallets.id, w.id));

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
  const parsed = holdSchema.parse(input);
  const db = requireDb();
  const amountUsd = toBig(parsed.amountUsdMinor);
  if (amountUsd <= 0n) throw new Error("amountUsdMinor must be > 0");

  return await db.transaction(async (tx) => {
    const [w] = await tx
      .select()
      .from(investorWallets)
      .where(eq(investorWallets.id, parsed.walletId))
      .limit(1);
    if (!w) throw new Error("Wallet not found");
    if (BigInt(w.holdBalanceUsdMinor) < amountUsd) {
      throw new Error("Insufficient hold balance to release");
    }

    const newAvail = BigInt(w.availableBalanceUsdMinor) + amountUsd;
    const newHold = BigInt(w.holdBalanceUsdMinor) - amountUsd;
    const occurredAt = new Date();

    await tx
      .update(investorWallets)
      .set({
        availableBalanceUsdMinor: newAvail,
        holdBalanceUsdMinor: newHold,
        lastActivityAt: occurredAt,
        updatedAt: new Date(),
      })
      .where(eq(investorWallets.id, w.id));

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
  const parsed = adjustmentSchema.parse(input);
  const db = requireDb();
  const delta = toBig(parsed.amountUsdMinor);

  return await db.transaction(async (tx) => {
    const [w] = await tx
      .select()
      .from(investorWallets)
      .where(eq(investorWallets.id, parsed.walletId))
      .limit(1);
    if (!w) throw new Error("Wallet not found");

    const newAvail = BigInt(w.availableBalanceUsdMinor) + delta;
    if (newAvail < 0n) {
      throw new Error("Adjustment would make available balance negative");
    }
    const newHold = BigInt(w.holdBalanceUsdMinor);
    const occurredAt = new Date();

    await tx
      .update(investorWallets)
      .set({
        availableBalanceUsdMinor: newAvail,
        lastActivityAt: occurredAt,
        updatedAt: new Date(),
      })
      .where(eq(investorWallets.id, w.id));

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
