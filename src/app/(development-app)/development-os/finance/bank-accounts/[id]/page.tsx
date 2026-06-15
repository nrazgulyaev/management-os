import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { Kpi, Card, HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getBankAccount } from "@/lib/development/server/bank-accounts";
import { getTransactions } from "@/lib/development/server/transactions";
import {
  formatCurrencyMinor,
  formatUsdMinor,
} from "@/lib/development/constants/investor-constants";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Bank account · Development OS" };
export const dynamic = "force-dynamic";

export default async function BankAccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os">Development OS</Link> /{" "}
              <Link href="/development-os/finance/bank-accounts">
                Bank accounts
              </Link>{" "}
              / <span>Detail</span>
            </div>
            <h1>Bank account</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }

  const account = await getBankAccount(id);
  if (!account) notFound();

  const txs = await safeQuery(
    "getTransactions",
    getTransactions({ bankAccountId: id }, { limit: 50 }),
    [],
    4000,
  );

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/finance/bank-accounts">
              Bank accounts
            </Link>{" "}
            / <span>{account.accountCode}</span>
          </div>
          <h1>{account.accountName}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {account.bankName
              ? `${account.bankName} · ${account.currency}`
              : account.currency}
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/finance/bank-accounts"
            className="btn btn-secondary"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            All accounts
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Snapshot</div>
        <Card padding="default">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi
              label="Balance"
              value={formatCurrencyMinor(
                BigInt(account.currentBalanceMinor),
                account.currency,
              )}
              sub={`≈ ${formatUsdMinor(BigInt(account.currentBalanceUsdMinor))}`}
            />
            <Kpi
              label="Threshold"
              value={
                account.minimumBalanceThresholdMinor
                  ? formatCurrencyMinor(
                      BigInt(account.minimumBalanceThresholdMinor),
                      account.currency,
                    )
                  : "—"
              }
              sub={account.belowThreshold ? "Below threshold" : "Above threshold"}
            />
            <Kpi
              label="Last FX"
              value={account.lastFxRate ?? "—"}
              sub={
                account.lastBalanceAt
                  ? new Date(account.lastBalanceAt).toLocaleDateString()
                  : "—"
              }
            />
            <Kpi
              label="Type"
              value={account.accountType}
              sub={account.isCompanyAccount ? "Company-wide" : "Project-specific"}
            />
          </div>
          <div className="mt-3 text-xs text-ink-tertiary">
            Inline edit + manual reconciliation actions are available via the{" "}
            <code>updateBankAccountThreshold</code> and <code>recordBankBalance</code>{" "}
            server actions; UI drawer for these is forthcoming in 2.4.
          </div>
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Transactions</div>
        {txs.length === 0 ? (
          <EmptyState
            title="No transactions yet"
            description="Transactions for this account appear here. Use the recordTransaction action to add the first one."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Date</TH>
                <TH>Direction</TH>
                <TH>Description</TH>
                <TH>Amount</TH>
                <TH>USD</TH>
                <TH>Reconciled</TH>
              </TR>
            </THead>
            <TBody>
              {txs.map((t) => (
                <TR key={t.id}>
                  <TD className="font-mono text-[11px]">
                    <Link
                      href={`/development-os/finance/transactions/${t.id}`}
                      className="hover:underline"
                    >
                      {t.transactionCode}
                    </Link>
                  </TD>
                  <TD className="text-xs">{t.transactionDate}</TD>
                  <TD>
                    <HandoffBadge
                      tone={
                        t.direction === "inflow"
                          ? "ok"
                          : t.direction === "outflow"
                            ? "danger"
                            : "soft"
                      }
                    >
                      {t.direction}
                    </HandoffBadge>
                  </TD>
                  <TD className="text-xs">{t.description}</TD>
                  <TDNum>
                    {formatCurrencyMinor(BigInt(t.amountMinor), t.currency)}
                  </TDNum>
                  <TDNum>{formatUsdMinor(BigInt(t.amountUsdMinor))}</TDNum>
                  <TD>
                    {t.reconciledAt ? (
                      <HandoffBadge tone="ok">Yes</HandoffBadge>
                    ) : (
                      <HandoffBadge tone="warn">No</HandoffBadge>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </DevelopmentShell>
  );
}
