import "server-only";

import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  investorWallets,
  walletTransactions,
} from "@/lib/db/schema/investor-capital";
import {
  WALLET_CASH_IN_TYPES,
  WALLET_CASH_OUT_TYPES,
  type WalletTransactionType,
} from "@/lib/development/constants/investor-constants";
import type {
  IRRResult,
  WalletSummary,
  WalletTransactionListItem,
} from "@/lib/development/types/investors";

const toStr = (v: unknown): string =>
  v === null || v === undefined ? "0" : String(v);

export async function getWalletByCommitment(
  commitmentId: string,
): Promise<{
  wallet: WalletSummary | null;
  recentTransactions: WalletTransactionListItem[];
}> {
  const db = getDb();
  if (!db) return { wallet: null, recentTransactions: [] };

  const [w] = await db
    .select()
    .from(investorWallets)
    .where(eq(investorWallets.commitmentId, commitmentId))
    .limit(1);
  if (!w) return { wallet: null, recentTransactions: [] };

  const tx = await db
    .select()
    .from(walletTransactions)
    .where(eq(walletTransactions.walletId, w.id))
    .orderBy(desc(walletTransactions.occurredAt))
    .limit(20);

  return {
    wallet: {
      id: w.id,
      commitmentId: w.commitmentId,
      availableBalanceUsdMinor: toStr(w.availableBalanceUsdMinor),
      holdBalanceUsdMinor: toStr(w.holdBalanceUsdMinor),
      reinvestPendingUsdMinor: toStr(w.reinvestPendingUsdMinor),
      totalDrawnUsdMinor: toStr(w.totalDrawnUsdMinor),
      totalReturnedCapitalUsdMinor: toStr(w.totalReturnedCapitalUsdMinor),
      totalProfitDistributedUsdMinor: toStr(w.totalProfitDistributedUsdMinor),
      totalWithdrawnUsdMinor: toStr(w.totalWithdrawnUsdMinor),
      totalReinvestedUsdMinor: toStr(w.totalReinvestedUsdMinor),
      lastActivityAt: new Date(w.lastActivityAt).toISOString(),
      cashBalanceMinor: toStr(w.cashBalanceMinor),
      reinvestmentBalanceMinor: toStr(w.reinvestmentBalanceMinor),
      pendingDistributionMinor: toStr(w.pendingDistributionMinor),
    },
    recentTransactions: tx.map(toWalletTxItem),
  };
}

export async function getWalletTransactions(
  walletId: string,
  pagination: { limit?: number; offset?: number } = {},
): Promise<WalletTransactionListItem[]> {
  const db = getDb();
  if (!db) return [];
  const limit = pagination.limit ?? 100;
  const offset = pagination.offset ?? 0;
  const rows = await db
    .select()
    .from(walletTransactions)
    .where(eq(walletTransactions.walletId, walletId))
    .orderBy(desc(walletTransactions.occurredAt))
    .limit(limit)
    .offset(offset);
  return rows.map(toWalletTxItem);
}

function toWalletTxItem(
  t: typeof walletTransactions.$inferSelect,
): WalletTransactionListItem {
  return {
    id: t.id,
    walletId: t.walletId,
    commitmentId: t.commitmentId,
    transactionType: t.transactionType as WalletTransactionType,
    amountUsdMinor: toStr(t.amountUsdMinor),
    balanceAvailableAfterUsdMinor: toStr(t.balanceAvailableAfterUsdMinor),
    balanceHoldAfterUsdMinor: toStr(t.balanceHoldAfterUsdMinor),
    drawdownId: t.drawdownId ?? null,
    distributionId: t.distributionId ?? null,
    description: t.description ?? null,
    externalReference: t.externalReference ?? null,
    occurredAt: new Date(t.occurredAt).toISOString(),
  };
}

// -----------------------------------------------------------------------------
// IRR — Newton-Raphson over cashflow series from wallet_transactions
// -----------------------------------------------------------------------------

interface CashFlow {
  date: Date;
  amountUsdMinor: bigint;
  type: "in" | "out" | "terminal";
}

/**
 * Time-weighted IRR for a single commitment. See architecture doc
 * §"IRR computation" for the methodology.
 *
 * Returns `irrAnnualized = null` if there are fewer than two cash
 * flows (we cannot solve a degenerate series), otherwise the
 * annualized rate as a decimal (0.124 = 12.4%).
 */
export async function computeIRR(commitmentId: string): Promise<IRRResult> {
  const db = getDb();
  if (!db) return { irrAnnualized: null, cashflows: [] };

  const [wallet] = await db
    .select({
      id: investorWallets.id,
      availableBalanceUsdMinor: investorWallets.availableBalanceUsdMinor,
      holdBalanceUsdMinor: investorWallets.holdBalanceUsdMinor,
    })
    .from(investorWallets)
    .where(eq(investorWallets.commitmentId, commitmentId))
    .limit(1);
  if (!wallet) return { irrAnnualized: null, cashflows: [] };

  const tx = await db
    .select({
      transactionType: walletTransactions.transactionType,
      amountUsdMinor: walletTransactions.amountUsdMinor,
      occurredAt: walletTransactions.occurredAt,
    })
    .from(walletTransactions)
    .where(eq(walletTransactions.walletId, wallet.id))
    .orderBy(walletTransactions.occurredAt);

  const flows: CashFlow[] = [];
  for (const t of tx) {
    const ttype = t.transactionType as WalletTransactionType;
    if (WALLET_CASH_IN_TYPES.has(ttype)) {
      // Money INTO the deal, OUT of the investor's pocket → negative
      flows.push({
        date: t.occurredAt,
        amountUsdMinor: -BigInt(t.amountUsdMinor),
        type: "in",
      });
    } else if (WALLET_CASH_OUT_TYPES.has(ttype)) {
      // Cash OUT to investor → positive
      flows.push({
        date: t.occurredAt,
        amountUsdMinor: BigInt(Math.abs(Number(t.amountUsdMinor))),
        type: "out",
      });
    }
  }

  // Append synthetic terminal cashflow = current undistributed balance.
  // This represents the investor's "as-if-withdrawn-now" position so the
  // running IRR remains meaningful pre-exit.
  const remaining =
    BigInt(wallet.availableBalanceUsdMinor) +
    BigInt(wallet.holdBalanceUsdMinor);
  if (remaining > 0n) {
    flows.push({
      date: new Date(),
      amountUsdMinor: remaining,
      type: "terminal",
    });
  }

  const cashflows = flows.map((f) => ({
    date: f.date.toISOString(),
    amountUsdMinor: f.amountUsdMinor.toString(),
    type: f.type,
  }));

  if (flows.length < 2) {
    return { irrAnnualized: null, cashflows };
  }

  const irr = newtonRaphsonIRR(flows);
  return { irrAnnualized: irr, cashflows };
}

/**
 * Pure Newton-Raphson solver for IRR. Returns null if the iteration
 * fails to converge.
 *
 * Works in days-from-first-flow / 365.0 to get an annualized rate.
 * NPV(r) = Σ cashflow_i / (1 + r)^t_i where t_i is years from start.
 */
function newtonRaphsonIRR(flows: CashFlow[]): number | null {
  if (flows.length < 2) return null;
  const t0 = flows[0].date.getTime();
  const series = flows.map((f) => ({
    years: (f.date.getTime() - t0) / (365 * 24 * 60 * 60 * 1000),
    amount: Number(f.amountUsdMinor) / 100, // to USD majors for numeric stability
  }));

  let r = 0.1; // 10% initial guess
  for (let iter = 0; iter < 200; iter++) {
    let npv = 0;
    let dnpv = 0;
    for (const { years, amount } of series) {
      const denom = Math.pow(1 + r, years);
      npv += amount / denom;
      dnpv -= (amount * years) / (denom * (1 + r));
    }
    if (Math.abs(npv) < 1e-6) return r;
    if (Math.abs(dnpv) < 1e-12) return null;
    const next = r - npv / dnpv;
    if (!Number.isFinite(next)) return null;
    if (next <= -0.99) {
      r = -0.99;
      continue;
    }
    if (Math.abs(next - r) < 1e-9) return next;
    r = next;
  }
  return null;
}
