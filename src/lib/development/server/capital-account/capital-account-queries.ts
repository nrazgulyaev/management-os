import "server-only";

import { and, desc, eq} from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import {
  investorWallets,
  capitalCommitments,
} from "@/lib/db/schema/investor-capital";
import { walletMovements } from "@/lib/db/schema/wallet-movements";

/**
 * Get the unified capital account view for one investor: aggregated
 * balances across every wallet/commitment they hold.
 */
export async function getInvestorCapitalAccount(investorId: string) {
  const db = requireDb();
  const wallets = await db
    .select({
      id: investorWallets.id,
      commitmentId: investorWallets.commitmentId,
      cashBalanceMinor: investorWallets.cashBalanceMinor,
      economicBalanceMinor: investorWallets.economicBalanceMinor,
      reinvestmentBalanceMinor: investorWallets.reinvestmentBalanceMinor,
      committedBalanceMinor: investorWallets.committedBalanceMinor,
      pendingDistributionMinor: investorWallets.pendingDistributionMinor,
      residualInventoryValueMinor: investorWallets.residualInventoryValueMinor,
      lastRecomputedAt: investorWallets.lastRecomputedAt,
      availableBalanceUsdMinor: investorWallets.availableBalanceUsdMinor,
      totalDrawnUsdMinor: investorWallets.totalDrawnUsdMinor,
      totalReturnedCapitalUsdMinor:
        investorWallets.totalReturnedCapitalUsdMinor,
      totalProfitDistributedUsdMinor:
        investorWallets.totalProfitDistributedUsdMinor,
      totalWithdrawnUsdMinor: investorWallets.totalWithdrawnUsdMinor,
    })
    .from(investorWallets)
    .innerJoin(
      capitalCommitments,
      eq(capitalCommitments.id, investorWallets.commitmentId),
    )
    .where(eq(capitalCommitments.investorId, investorId));

  const totals = wallets.reduce(
    (acc, w) => ({
      cash: acc.cash + Number(w.cashBalanceMinor),
      economic: acc.economic + Number(w.economicBalanceMinor),
      reinvestment: acc.reinvestment + Number(w.reinvestmentBalanceMinor),
      committed: acc.committed + Number(w.committedBalanceMinor),
      pendingDistribution:
        acc.pendingDistribution + Number(w.pendingDistributionMinor),
      residualInventory:
        acc.residualInventory + Number(w.residualInventoryValueMinor),
    }),
    {
      cash: 0,
      economic: 0,
      reinvestment: 0,
      committed: 0,
      pendingDistribution: 0,
      residualInventory: 0,
    },
  );

  return { wallets, totals };
}

export async function listWalletMovements(filters?: {
  investorId?: string;
  walletId?: string;
  limit?: number;
}) {
  const db = requireDb();
  const conditions = [] as Array<ReturnType<typeof eq>>;
  if (filters?.investorId) {
    conditions.push(eq(walletMovements.investorId, filters.investorId));
  }
  if (filters?.walletId) {
    conditions.push(eq(walletMovements.walletId, filters.walletId));
  }
  return db
    .select()
    .from(walletMovements)
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(desc(walletMovements.effectedAt))
    .limit(filters?.limit ?? 100);
}

export async function getWalletMovement(id: string) {
  const db = requireDb();
  const [row] = await db
    .select()
    .from(walletMovements)
    .where(eq(walletMovements.id, id))
    .limit(1);
  return row ?? null;
}
