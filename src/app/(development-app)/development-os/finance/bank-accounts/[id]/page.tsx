import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
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
        <PageHeader
          breadcrumbs={[
            { label: "Development OS", href: "/development-os" },
            { label: "Bank accounts", href: "/development-os/finance/bank-accounts" },
            { label: "Detail" },
          ]}
          title="Bank account"
        />
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
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Bank accounts", href: "/development-os/finance/bank-accounts" },
          { label: account.accountCode },
        ]}
        eyebrow={`${account.accountCode} · ${account.accountType}`}
        title={account.accountName}
        description={
          account.bankName ? `${account.bankName} · ${account.currency}` : account.currency
        }
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/finance/bank-accounts">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              All accounts
            </Link>
          </Button>
        }
      />

      <Section eyebrow="Snapshot" title="Current state">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard
            label="Balance"
            value={formatCurrencyMinor(
              BigInt(account.currentBalanceMinor),
              account.currency,
            )}
            hint={`≈ ${formatUsdMinor(BigInt(account.currentBalanceUsdMinor))}`}
          />
          <MetricCard
            label="Threshold"
            value={
              account.minimumBalanceThresholdMinor
                ? formatCurrencyMinor(
                    BigInt(account.minimumBalanceThresholdMinor),
                    account.currency,
                  )
                : "—"
            }
            hint={account.belowThreshold ? "Below threshold" : "Above threshold"}
          />
          <MetricCard
            label="Last FX"
            value={account.lastFxRate ?? "—"}
            hint={
              account.lastBalanceAt
                ? new Date(account.lastBalanceAt).toLocaleDateString()
                : "—"
            }
          />
          <MetricCard
            label="Type"
            value={account.accountType}
            hint={account.isCompanyAccount ? "Company-wide" : "Project-specific"}
          />
        </div>
        <div className="mt-3 text-xs text-ink-tertiary">
          Inline edit + manual reconciliation actions are available via the{" "}
          <code>updateBankAccountThreshold</code> and <code>recordBankBalance</code>{" "}
          server actions; UI drawer for these is forthcoming in 2.4.
        </div>
      </Section>

      <Section eyebrow="Transactions" title="Recent ledger">
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
                    <Badge
                      tone={
                        t.direction === "inflow"
                          ? "success"
                          : t.direction === "outflow"
                            ? "danger"
                            : "neutral"
                      }
                    >
                      {t.direction}
                    </Badge>
                  </TD>
                  <TD className="text-xs">{t.description}</TD>
                  <TDNum>
                    {formatCurrencyMinor(BigInt(t.amountMinor), t.currency)}
                  </TDNum>
                  <TDNum>{formatUsdMinor(BigInt(t.amountUsdMinor))}</TDNum>
                  <TD>
                    {t.reconciledAt ? (
                      <Badge tone="success">Yes</Badge>
                    ) : (
                      <Badge tone="warning">No</Badge>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>
    </DevelopmentShell>
  );
}
