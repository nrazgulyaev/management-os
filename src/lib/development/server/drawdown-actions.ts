import "server-only";

import { eq, lte, and, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import {
  capitalCommitments,
  capitalDrawdowns,
  investorWallets,
  walletTransactions,
} from "@/lib/db/schema/investor-capital";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import {
  DRAWDOWN_PAYMENT_METHODS,
  DRAWDOWN_TRIGGER_REASONS,
  SUPPORTED_CURRENCIES,
} from "@/lib/development/constants/investor-constants";
import type {
  ConfirmDrawdownInput,
  RequestDrawdownInput,
} from "@/lib/development/types/investors";

const requestDrawdownSchema = z.object({
  commitmentId: z.string().uuid(),
  amountMinor: z.union([z.bigint(), z.string(), z.number()]),
  currency: z.enum(SUPPORTED_CURRENCIES),
  fxRateAtDrawdown: z.string().regex(/^\d+(\.\d+)?$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  triggerReason: z.enum(DRAWDOWN_TRIGGER_REASONS),
  triggerBalanceAtRequestUsdMinor: z
    .union([z.bigint(), z.string(), z.number()])
    .optional()
    .nullable(),
  notes: z.string().optional().nullable(),
});

const toBig = (v: bigint | string | number): bigint => {
  if (typeof v === "bigint") return v;
  return BigInt(typeof v === "number" ? Math.trunc(v) : v);
};

function computeUsdFromMinor(
  amountMinor: bigint,
  currency: string,
  fxRate: number,
): bigint {
  const isUsdt = currency === "USDT";
  const sourceMajors = isUsdt
    ? Number(amountMinor) / 1_000_000
    : Number(amountMinor) / 100;
  const usdMajors =
    currency === "USD" ? Number(amountMinor) / 100 : sourceMajors / fxRate;
  return BigInt(Math.round(usdMajors * 100));
}

/**
 * Records a capital call. The drawdown is created in `requested` state;
 * no balance changes happen until `confirmDrawdownReceipt` runs.
 *
 * `drawdown_number` auto-increments per commitment via a SELECT max(...)
 * + 1 inside the same transaction. Combined with the unique
 * (commitment_id, drawdown_number) constraint, this is safe under
 * concurrent calls because the second one will throw a duplicate-key
 * error and the caller can retry.
 */
export async function requestDrawdown(
  input: RequestDrawdownInput,
): Promise<{ id: string; drawdownNumber: number }> {
  await requireInternalUser();
  const organizationId = await requireOrgId();
  const parsed = requestDrawdownSchema.parse(input);
  const db = requireDb();

  const amountMinor = toBig(parsed.amountMinor);
  if (amountMinor <= 0n) throw new Error("amountMinor must be > 0");
  const fxRate = Number(parsed.fxRateAtDrawdown);
  if (!(fxRate > 0)) throw new Error("fxRateAtDrawdown must be > 0");
  const amountUsdMinor = computeUsdFromMinor(amountMinor, parsed.currency, fxRate);
  if (amountUsdMinor <= 0n) {
    throw new Error("Computed amount_usd_minor is non-positive");
  }

  return await db.transaction(async (tx) => {
    const [commitment] = await tx
      .select({
        id: capitalCommitments.id,
        status: capitalCommitments.status,
      })
      .from(capitalCommitments)
      .where(
        and(
          eq(capitalCommitments.id, parsed.commitmentId),
          eq(capitalCommitments.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!commitment) throw new Error("Commitment not found");
    if (commitment.status === "cancelled" || commitment.status === "closed") {
      throw new Error(
        `Cannot request drawdown on commitment with status='${commitment.status}'`,
      );
    }

    const [maxRow] = await tx
      .select({
        nextNumber: sql<number>`coalesce(max(drawdown_number), 0)::int + 1`,
      })
      .from(capitalDrawdowns)
      .where(eq(capitalDrawdowns.commitmentId, parsed.commitmentId));

    const drawdownNumber = Number(maxRow?.nextNumber ?? 1);

    const [row] = await tx
      .insert(capitalDrawdowns)
      .values({
        commitmentId: parsed.commitmentId,
        drawdownNumber,
        amountMinor,
        currency: parsed.currency,
        amountUsdMinor,
        fxRateAtDrawdown: parsed.fxRateAtDrawdown,
        dueDate: parsed.dueDate,
        triggerReason: parsed.triggerReason,
        triggerBalanceAtRequestUsdMinor:
          parsed.triggerBalanceAtRequestUsdMinor != null
            ? toBig(parsed.triggerBalanceAtRequestUsdMinor)
            : null,
        notes: parsed.notes ?? null,
      })
      .returning({
        id: capitalDrawdowns.id,
        drawdownNumber: capitalDrawdowns.drawdownNumber,
      });
    return { id: row.id, drawdownNumber: row.drawdownNumber };
  });
}

const confirmDrawdownSchema = z.object({
  drawdownId: z.string().uuid(),
  receivedAt: z.string().optional(),
  paymentMethod: z.enum(DRAWDOWN_PAYMENT_METHODS),
  paymentReference: z.string().optional().nullable(),
  receiptDocumentId: z.string().uuid().optional().nullable(),
});

/**
 * Confirms a drawdown is received. **Atomic**:
 *
 * 1. Transitions `capital_drawdowns.status` → 'received'
 * 2. Increments `investor_wallets.available_balance_usd_minor` and
 *    `total_drawn_usd_minor` by the drawdown's USD amount
 * 3. Writes a `wallet_transactions` row with the post-transaction
 *    balance state, type='drawdown_received', drawdown_id linked
 *
 * Bank-account / dev_transactions linkage is deferred to Stage 2.3.B
 * when the dev_finance ledger UI lands; the helper is forward-compatible
 * with that addition (the dev_transactions row would be a fourth leg
 * inside this same transaction).
 */
export async function confirmDrawdownReceipt(
  input: ConfirmDrawdownInput,
): Promise<{
  walletTransactionId: string;
  newAvailableBalanceUsdMinor: string;
}> {
  await requireInternalUser();
  const organizationId = await requireOrgId();
  const parsed = confirmDrawdownSchema.parse(input);
  const db = requireDb();
  const receivedAt = parsed.receivedAt ? new Date(parsed.receivedAt) : new Date();

  return await db.transaction(async (tx) => {
    // Resolve the drawdown's org via its commitment and reject cross-org
    // ids BEFORE crediting any wallet balance (the drawdown org column is
    // nullable, so anchor on the commitment which is authoritative).
    const [drawdown] = await tx
      .select({ drawdown: capitalDrawdowns })
      .from(capitalDrawdowns)
      .innerJoin(
        capitalCommitments,
        eq(capitalCommitments.id, capitalDrawdowns.commitmentId),
      )
      .where(
        and(
          eq(capitalDrawdowns.id, parsed.drawdownId),
          eq(capitalCommitments.organizationId, organizationId),
        ),
      )
      .limit(1)
      .then((rows) => rows.map((r) => r.drawdown));
    if (!drawdown) throw new Error("Drawdown not found");
    if (drawdown.status === "received") {
      throw new Error("Drawdown already marked received (idempotency violation)");
    }
    if (drawdown.status === "cancelled") {
      throw new Error("Cannot confirm a cancelled drawdown");
    }

    const [wallet] = await tx
      .select()
      .from(investorWallets)
      .where(eq(investorWallets.commitmentId, drawdown.commitmentId))
      .limit(1);
    if (!wallet) throw new Error("Wallet not found for commitment");

    const drawdownUsd = BigInt(drawdown.amountUsdMinor);
    const newAvailable =
      BigInt(wallet.availableBalanceUsdMinor) + drawdownUsd;
    const newHold = BigInt(wallet.holdBalanceUsdMinor);

    await tx
      .update(capitalDrawdowns)
      .set({
        status: "received",
        receivedAt,
        paymentMethod: parsed.paymentMethod,
        paymentReference: parsed.paymentReference ?? null,
        receiptDocumentId: parsed.receiptDocumentId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(capitalDrawdowns.id, parsed.drawdownId));

    await tx
      .update(investorWallets)
      .set({
        availableBalanceUsdMinor: newAvailable,
        totalDrawnUsdMinor: BigInt(wallet.totalDrawnUsdMinor) + drawdownUsd,
        lastActivityAt: receivedAt,
        updatedAt: new Date(),
      })
      .where(eq(investorWallets.id, wallet.id));

    const [walletTx] = await tx
      .insert(walletTransactions)
      .values({
        walletId: wallet.id,
        commitmentId: drawdown.commitmentId,
        transactionType: "drawdown_received",
        amountUsdMinor: drawdownUsd,
        amountOriginalMinor: BigInt(drawdown.amountMinor),
        originalCurrency: drawdown.currency,
        fxRateAtTransaction: drawdown.fxRateAtDrawdown,
        balanceAvailableAfterUsdMinor: newAvailable,
        balanceHoldAfterUsdMinor: newHold,
        drawdownId: drawdown.id,
        description: `Drawdown #${drawdown.drawdownNumber} received`,
        externalReference: parsed.paymentReference ?? null,
        occurredAt: receivedAt,
      })
      .returning({ id: walletTransactions.id });

    return {
      walletTransactionId: walletTx.id,
      newAvailableBalanceUsdMinor: newAvailable.toString(),
    };
  });
}

/**
 * Marks all `requested` drawdowns whose due_date is past as `overdue`.
 * Idempotent: rows already in `overdue` state are not re-touched.
 * Used by the `runOverdueDrawdownScan` cron job (Stage 2.3.B).
 */
export async function markOverdueDrawdowns(today: Date = new Date()): Promise<{
  marked: number;
}> {
  const db = requireDb();
  const todayStr = today.toISOString().slice(0, 10);
  const result = await db
    .update(capitalDrawdowns)
    .set({ status: "overdue", updatedAt: new Date() })
    .where(
      and(
        eq(capitalDrawdowns.status, "requested"),
        lte(capitalDrawdowns.dueDate, todayStr),
      ),
    )
    .returning({ id: capitalDrawdowns.id });
  return { marked: result.length };
}

export async function cancelDrawdown(
  id: string,
  reason: string,
): Promise<void> {
  if (!reason || reason.trim().length < 3) {
    throw new Error("cancelDrawdown: reason is required (min 3 chars)");
  }
  await requireInternalUser();
  const organizationId = await requireOrgId();
  const db = requireDb();

  await db.transaction(async (tx) => {
    // Resolve the drawdown's org via its commitment and reject cross-org ids.
    const [d] = await tx
      .select({ status: capitalDrawdowns.status })
      .from(capitalDrawdowns)
      .innerJoin(
        capitalCommitments,
        eq(capitalCommitments.id, capitalDrawdowns.commitmentId),
      )
      .where(
        and(
          eq(capitalDrawdowns.id, id),
          eq(capitalCommitments.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!d) throw new Error("Drawdown not found");
    if (d.status === "received") {
      throw new Error(
        "Cannot cancel a received drawdown — use a wallet adjustment instead",
      );
    }
    await tx
      .update(capitalDrawdowns)
      .set({
        status: "cancelled",
        notes: reason,
        updatedAt: new Date(),
      })
      .where(eq(capitalDrawdowns.id, id));
  });
}
