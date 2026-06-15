import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { devBankAccounts } from "@/lib/db/schema/dev-finance";
import type { SupportedCurrency } from "@/lib/development/constants/investor-constants";
import { requireOrgId } from "@/features/auth/require-org";

const toStr = (v: unknown): string =>
  v === null || v === undefined ? "0" : String(v);

export interface BankAccountListItem {
  id: string;
  accountCode: string;
  accountName: string;
  accountType: "bank" | "crypto_exchange" | "crypto_wallet" | "cash";
  currency: SupportedCurrency;
  bankName: string | null;
  walletAddress: string | null;
  minimumBalanceThresholdMinor: string | null;
  currentBalanceMinor: string;
  currentBalanceUsdMinor: string;
  lastFxRate: string | null;
  lastBalanceAt: string | null;
  primaryProjectId: string | null;
  isCompanyAccount: boolean;
  isActive: boolean;
  belowThreshold: boolean;
}

function toItem(
  r: typeof devBankAccounts.$inferSelect,
): BankAccountListItem {
  const threshold = r.minimumBalanceThresholdMinor
    ? BigInt(r.minimumBalanceThresholdMinor)
    : null;
  const balance = BigInt(r.currentBalanceMinor);
  return {
    id: r.id,
    accountCode: r.accountCode,
    accountName: r.accountName,
    accountType: r.accountType as BankAccountListItem["accountType"],
    currency: r.currency as SupportedCurrency,
    bankName: r.bankName ?? null,
    walletAddress: r.walletAddress ?? null,
    minimumBalanceThresholdMinor: threshold ? threshold.toString() : null,
    currentBalanceMinor: balance.toString(),
    currentBalanceUsdMinor: toStr(r.currentBalanceUsdMinor),
    lastFxRate: r.lastFxRate ? String(r.lastFxRate) : null,
    lastBalanceAt: r.lastBalanceAt
      ? new Date(r.lastBalanceAt).toISOString()
      : null,
    primaryProjectId: r.primaryProjectId ?? null,
    isCompanyAccount: r.isCompanyAccount,
    isActive: r.isActive,
    belowThreshold: threshold !== null && balance < threshold,
  };
}

export async function getBankAccounts(): Promise<BankAccountListItem[]> {
  const db = getDb();
  if (!db) return [];
  const orgId = await requireOrgId();
  const rows = await db
    .select()
    .from(devBankAccounts)
    .where(
      and(
        eq(devBankAccounts.isActive, true),
        eq(devBankAccounts.organizationId, orgId),
      ),
    )
    .orderBy(devBankAccounts.accountCode);
  return rows.map(toItem);
}

export async function getBankAccount(
  id: string,
): Promise<BankAccountListItem | null> {
  const db = getDb();
  if (!db) return null;
  const orgId = await requireOrgId();
  const [r] = await db
    .select()
    .from(devBankAccounts)
    .where(
      and(
        eq(devBankAccounts.id, id),
        eq(devBankAccounts.organizationId, orgId),
      ),
    )
    .limit(1);
  return r ? toItem(r) : null;
}

/**
 * Returns the sum of `current_balance_usd_minor` across every active
 * bank account (not just `is_company_account`). The Self-Sustaining
 * Threshold detector and the company-balance-driven drawdown trigger
 * both use this number.
 */
export async function getCompanyTotalUSDBalance(): Promise<bigint> {
  const db = getDb();
  if (!db) return 0n;
  const orgId = await requireOrgId();
  const [r] = await db.execute(sql`
    SELECT coalesce(sum(current_balance_usd_minor), 0)::bigint AS total
    FROM dev_bank_accounts
    WHERE is_active = true AND is_company_account = true
      AND organization_id = ${orgId}
  `);
  return BigInt(((r ?? {}) as { total?: string }).total ?? 0);
}

export async function getProjectBalance(projectId: string): Promise<bigint> {
  const db = getDb();
  if (!db) return 0n;
  const [r] = await db.execute(sql`
    SELECT coalesce(sum(current_balance_usd_minor), 0)::bigint AS total
    FROM dev_bank_accounts
    WHERE is_active = true AND primary_project_id = ${projectId}
  `);
  return BigInt(((r ?? {}) as { total?: string }).total ?? 0);
}

export async function getAccountsBelowThreshold(): Promise<
  BankAccountListItem[]
> {
  const accounts = await getBankAccounts();
  return accounts.filter((a) => a.belowThreshold);
}
