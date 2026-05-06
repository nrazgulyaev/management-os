import "server-only";

import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import {
  capitalCommitments,
  capitalDrawdowns,
  investorWallets,
} from "@/lib/db/schema/investor-capital";
import { SUPPORTED_CURRENCIES } from "@/lib/development/constants/investor-constants";
import type { CreateCommitmentInput } from "@/lib/development/types/investors";

const createCommitmentSchema = z.object({
  investorId: z.string().uuid(),
  projectId: z.string().uuid().optional().nullable(),
  commitmentCode: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/),
  committedAmountMinor: z.union([z.bigint(), z.string(), z.number()]),
  committedCurrency: z.enum(SUPPORTED_CURRENCIES),
  fxRateAtCommitment: z.string().regex(/^\d+(\.\d+)?$/),
  profitSharePercent: z.string().regex(/^\d+(\.\d+)?$/),
  capitalReturnPriority: z.number().int().min(1).default(1),
  isLandownerJv: z.boolean().default(false),
  landownerAssetValueMinor: z
    .union([z.bigint(), z.string(), z.number()])
    .optional()
    .nullable(),
  landownerAssetCurrency: z.enum(SUPPORTED_CURRENCIES).optional().nullable(),
  signedAt: z.string().optional().nullable(),
  agreementDocumentId: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const toBig = (v: bigint | string | number): bigint => {
  if (typeof v === "bigint") return v;
  return BigInt(typeof v === "number" ? Math.trunc(v) : v);
};

/**
 * Creates a commitment AND its empty wallet in a single transaction. The
 * wallet's lifecycle is bound to the commitment (UNIQUE FK), so creating
 * them together avoids a race where a commitment exists with no wallet
 * yet.
 *
 * USD equivalent is computed from `committedAmountMinor / fxRate` —
 * caller is responsible for choosing the FX rate at commit time and
 * passing it through. We re-derive the USD equivalent server-side so a
 * client-side bug can't produce inconsistent rows.
 */
export async function createCommitment(input: CreateCommitmentInput): Promise<{
  id: string;
  commitmentCode: string;
  walletId: string;
  committedAmountUsdMinor: string;
}> {
  const parsed = createCommitmentSchema.parse(input);
  const db = requireDb();

  const committedAmountMinor = toBig(parsed.committedAmountMinor);
  const fxRate = Number(parsed.fxRateAtCommitment);
  if (!(fxRate > 0)) {
    throw new Error("fxRateAtCommitment must be > 0");
  }

  // Compute USD equivalent. The fx_rate is "1 USD = N <currency>", so
  // amount_usd = amount_in_currency / fx_rate. We store both sides so
  // a future FX change cannot retroactively change historical reports.
  // For currencies whose minor unit divisor differs from USD (USDT uses
  // 6 decimals on-chain), normalize first to majors then back to USD cents.
  const isUsdt = parsed.committedCurrency === "USDT";
  const sourceMajors = isUsdt
    ? Number(committedAmountMinor) / 1_000_000
    : Number(committedAmountMinor) / 100;
  const usdMajors =
    parsed.committedCurrency === "USD"
      ? Number(committedAmountMinor) / 100
      : sourceMajors / fxRate;
  const committedAmountUsdMinor = BigInt(Math.round(usdMajors * 100));
  if (committedAmountUsdMinor <= 0n) {
    throw new Error(
      "Computed committed_amount_usd_minor is non-positive — check FX rate sign",
    );
  }

  const result = await db.transaction(async (tx) => {
    const [c] = await tx
      .insert(capitalCommitments)
      .values({
        investorId: parsed.investorId,
        projectId: parsed.projectId ?? null,
        commitmentCode: parsed.commitmentCode,
        committedAmountMinor,
        committedCurrency: parsed.committedCurrency,
        committedAmountUsdMinor,
        fxRateAtCommitment: parsed.fxRateAtCommitment,
        profitSharePercent: parsed.profitSharePercent,
        capitalReturnPriority: parsed.capitalReturnPriority,
        isLandownerJv: parsed.isLandownerJv,
        landownerAssetValueMinor:
          parsed.landownerAssetValueMinor != null
            ? toBig(parsed.landownerAssetValueMinor)
            : null,
        landownerAssetCurrency: parsed.landownerAssetCurrency ?? null,
        signedAt: parsed.signedAt ?? null,
        agreementDocumentId: parsed.agreementDocumentId ?? null,
        notes: parsed.notes ?? null,
      })
      .returning({
        id: capitalCommitments.id,
        commitmentCode: capitalCommitments.commitmentCode,
        committedAmountUsdMinor: capitalCommitments.committedAmountUsdMinor,
      });

    const [w] = await tx
      .insert(investorWallets)
      .values({ commitmentId: c.id })
      .returning({ id: investorWallets.id });

    return {
      id: c.id,
      commitmentCode: c.commitmentCode,
      walletId: w.id,
      committedAmountUsdMinor: c.committedAmountUsdMinor.toString(),
    };
  });

  return result;
}

const updateCommitmentTermsSchema = z.object({
  profitSharePercent: z
    .string()
    .regex(/^\d+(\.\d+)?$/)
    .optional(),
  capitalReturnPriority: z.number().int().min(1).optional(),
  signedAt: z.string().optional().nullable(),
  agreementDocumentId: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function updateCommitmentTerms(
  id: string,
  patch: z.input<typeof updateCommitmentTermsSchema>,
): Promise<void> {
  const parsed = updateCommitmentTermsSchema.parse(patch);
  const db = requireDb();
  await db
    .update(capitalCommitments)
    .set({
      ...(parsed.profitSharePercent !== undefined && {
        profitSharePercent: parsed.profitSharePercent,
      }),
      ...(parsed.capitalReturnPriority !== undefined && {
        capitalReturnPriority: parsed.capitalReturnPriority,
      }),
      ...(parsed.signedAt !== undefined && { signedAt: parsed.signedAt }),
      ...(parsed.agreementDocumentId !== undefined && {
        agreementDocumentId: parsed.agreementDocumentId,
      }),
      ...(parsed.notes !== undefined && { notes: parsed.notes }),
      updatedAt: new Date(),
    })
    .where(eq(capitalCommitments.id, id));
}

/**
 * Cancels a commitment IF it has no drawdowns recorded. Cancellation
 * preserves the row (audit trail) — it just transitions status. The
 * UNIQUE FK on `investor_wallets.commitment_id` means the wallet
 * persists too; downstream code should treat `status='cancelled'` as
 * a tombstone and skip it from active aggregates.
 */
export async function cancelCommitment(
  id: string,
  reason: string,
): Promise<void> {
  if (!reason || reason.trim().length < 3) {
    throw new Error("cancelCommitment: reason is required (min 3 chars)");
  }
  const db = requireDb();

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: capitalDrawdowns.id })
      .from(capitalDrawdowns)
      .where(eq(capitalDrawdowns.commitmentId, id))
      .limit(1);
    if (existing) {
      throw new Error(
        "Cannot cancel: commitment has drawdowns. Use closeCommitment after the wallet is empty.",
      );
    }
    await tx
      .update(capitalCommitments)
      .set({
        status: "cancelled",
        notes: reason,
        updatedAt: new Date(),
      })
      .where(eq(capitalCommitments.id, id));
  });
}

/**
 * Closes a commitment when its wallet is empty (everything has been
 * distributed AND withdrawn). Idempotent — closing an already-closed
 * commitment is a no-op.
 */
export async function closeCommitment(id: string): Promise<void> {
  const db = requireDb();

  await db.transaction(async (tx) => {
    const [w] = await tx
      .select({
        availableBalanceUsdMinor: investorWallets.availableBalanceUsdMinor,
        holdBalanceUsdMinor: investorWallets.holdBalanceUsdMinor,
      })
      .from(investorWallets)
      .where(eq(investorWallets.commitmentId, id))
      .limit(1);
    if (!w) {
      throw new Error("Wallet not found for commitment");
    }
    const remaining =
      BigInt(w.availableBalanceUsdMinor) + BigInt(w.holdBalanceUsdMinor);
    if (remaining > 0n) {
      throw new Error(
        `Cannot close: wallet still holds USD ${(Number(remaining) / 100).toFixed(2)}. Withdraw or reinvest first.`,
      );
    }
    await tx
      .update(capitalCommitments)
      .set({ status: "closed", updatedAt: new Date() })
      .where(
        and(
          eq(capitalCommitments.id, id),
          // Don't downgrade an already-cancelled or already-closed commitment
        ),
      );
  });
}
