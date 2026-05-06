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
import { getCommitment } from "@/lib/development/server/commitments";
import {
  getWalletByCommitment,
} from "@/lib/development/server/wallets";
import {
  COMMITMENT_STATUS_LABEL,
  CURRENCY_LABEL,
  DRAWDOWN_STATUS_LABEL,
  DRAWDOWN_TRIGGER_LABEL,
  WALLET_TX_TYPE_LABEL,
  formatCurrencyMinor,
  formatUsdMinor,
} from "@/lib/development/constants/investor-constants";

export const metadata: Metadata = {
  title: "Commitment detail · Development OS",
};
export const dynamic = "force-dynamic";

export default async function CommitmentDetailPage({
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
            {
              label: "Commitments",
              href: "/development-os/commitments",
            },
            { label: "Detail" },
          ]}
          title="Commitment detail"
        />
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL to view commitment details."
          action={<Badge tone="warning">DATABASE_URL not set</Badge>}
        />
      </DevelopmentShell>
    );
  }

  const commitment = await getCommitment(id);
  if (!commitment) notFound();

  const walletBundle = await getWalletByCommitment(commitment.id);

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Commitments", href: "/development-os/commitments" },
          { label: commitment.commitmentCode },
        ]}
        eyebrow={`${commitment.commitmentCode} · ${commitment.investorLegalName}`}
        title={
          commitment.projectName
            ? `${commitment.projectName} commitment`
            : `Multi-project commitment`
        }
        description={commitment.notes ?? undefined}
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/commitments">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              All commitments
            </Link>
          </Button>
        }
      />

      <Section eyebrow="Terms" title="Negotiated commitment terms">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard
            label="Committed"
            value={formatCurrencyMinor(
              BigInt(commitment.committedAmountMinor),
              commitment.committedCurrency,
            )}
            hint={`≈ ${formatUsdMinor(BigInt(commitment.committedAmountUsdMinor))} at FX ${commitment.fxRateAtCommitment}`}
          />
          <MetricCard
            label="Profit share"
            value={`${Number(commitment.profitSharePercent).toFixed(2)}%`}
            hint={`Priority ${commitment.capitalReturnPriority}`}
          />
          <MetricCard
            label="Drawn"
            value={formatUsdMinor(BigInt(commitment.drawnUsdMinor))}
            hint={`${commitment.drawnPercent.toFixed(1)}% of committed`}
          />
          <MetricCard
            label="In wallet"
            value={formatUsdMinor(BigInt(commitment.walletAvailableUsdMinor))}
            hint="Available to withdraw"
          />
        </div>
        <div className="mt-3 flex items-center gap-3 text-xs text-ink-secondary">
          <Badge
            tone={
              commitment.status === "active"
                ? "success"
                : commitment.status === "fully_called"
                  ? "info"
                  : commitment.status === "closed"
                    ? "neutral"
                    : "warning"
            }
          >
            {COMMITMENT_STATUS_LABEL[commitment.status]}
          </Badge>
          {commitment.isLandownerJv && (
            <Badge tone="gold">Landowner JV</Badge>
          )}
          <span>Currency: {CURRENCY_LABEL[commitment.committedCurrency]}</span>
          {commitment.signedAt && <span>Signed: {commitment.signedAt}</span>}
        </div>
      </Section>

      <Section eyebrow="Drawdowns" title="Capital calls">
        {commitment.drawdowns.length === 0 ? (
          <EmptyState
            title="No drawdowns yet"
            description="Use requestDrawdown via the API to create the first capital call."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>#</TH>
                <TH>Amount</TH>
                <TH>USD</TH>
                <TH>Requested</TH>
                <TH>Due</TH>
                <TH>Received</TH>
                <TH>Trigger</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {commitment.drawdowns.map((d) => (
                <TR key={d.id}>
                  <TD className="font-mono text-xs">#{d.drawdownNumber}</TD>
                  <TDNum>
                    {formatCurrencyMinor(BigInt(d.amountMinor), d.currency)}
                  </TDNum>
                  <TDNum>{formatUsdMinor(BigInt(d.amountUsdMinor))}</TDNum>
                  <TD className="text-xs">
                    {new Date(d.requestedAt).toLocaleDateString()}
                  </TD>
                  <TD className="text-xs">{d.dueDate}</TD>
                  <TD className="text-xs">
                    {d.receivedAt
                      ? new Date(d.receivedAt).toLocaleDateString()
                      : "—"}
                  </TD>
                  <TD className="text-xs">
                    {DRAWDOWN_TRIGGER_LABEL[d.triggerReason]}
                  </TD>
                  <TD>
                    <Badge
                      tone={
                        d.status === "received"
                          ? "success"
                          : d.status === "overdue"
                            ? "danger"
                            : d.status === "cancelled"
                              ? "neutral"
                              : "warning"
                      }
                    >
                      {DRAWDOWN_STATUS_LABEL[d.status]}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>

      <Section eyebrow="Wallet" title="Recent wallet activity">
        {!walletBundle.wallet ? (
          <EmptyState
            title="Wallet not initialized"
            description="The wallet should be auto-created with the commitment. If missing, this is a data integrity issue — check the commitment-actions transactional path."
          />
        ) : walletBundle.recentTransactions.length === 0 ? (
          <div className="rounded-md border border-line-soft p-6 text-sm text-ink-secondary">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <MetricCard
                label="Available"
                value={formatUsdMinor(
                  BigInt(walletBundle.wallet.availableBalanceUsdMinor),
                )}
              />
              <MetricCard
                label="On hold"
                value={formatUsdMinor(
                  BigInt(walletBundle.wallet.holdBalanceUsdMinor),
                )}
              />
              <MetricCard
                label="Lifetime drawn"
                value={formatUsdMinor(
                  BigInt(walletBundle.wallet.totalDrawnUsdMinor),
                )}
              />
              <MetricCard
                label="Lifetime withdrawn"
                value={formatUsdMinor(
                  BigInt(walletBundle.wallet.totalWithdrawnUsdMinor),
                )}
              />
            </div>
            No transactions yet — confirm a drawdown receipt to see the first
            wallet entry.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <MetricCard
                label="Available"
                value={formatUsdMinor(
                  BigInt(walletBundle.wallet.availableBalanceUsdMinor),
                )}
              />
              <MetricCard
                label="On hold"
                value={formatUsdMinor(
                  BigInt(walletBundle.wallet.holdBalanceUsdMinor),
                )}
              />
              <MetricCard
                label="Lifetime drawn"
                value={formatUsdMinor(
                  BigInt(walletBundle.wallet.totalDrawnUsdMinor),
                )}
              />
              <MetricCard
                label="Lifetime withdrawn"
                value={formatUsdMinor(
                  BigInt(walletBundle.wallet.totalWithdrawnUsdMinor),
                )}
              />
            </div>
            <Table>
              <THead>
                <TR>
                  <TH>When</TH>
                  <TH>Type</TH>
                  <TH>Amount (USD)</TH>
                  <TH>After (avail)</TH>
                  <TH>After (hold)</TH>
                  <TH>Note</TH>
                </TR>
              </THead>
              <TBody>
                {walletBundle.recentTransactions.map((t) => (
                  <TR key={t.id}>
                    <TD className="text-xs">
                      {new Date(t.occurredAt).toLocaleString()}
                    </TD>
                    <TD className="text-xs">
                      {WALLET_TX_TYPE_LABEL[t.transactionType]}
                    </TD>
                    <TDNum
                      className={
                        BigInt(t.amountUsdMinor) < 0n
                          ? "text-danger"
                          : "text-success"
                      }
                    >
                      {formatUsdMinor(BigInt(t.amountUsdMinor))}
                    </TDNum>
                    <TDNum>
                      {formatUsdMinor(BigInt(t.balanceAvailableAfterUsdMinor))}
                    </TDNum>
                    <TDNum>
                      {formatUsdMinor(BigInt(t.balanceHoldAfterUsdMinor))}
                    </TDNum>
                    <TD className="text-xs text-ink-secondary">
                      {t.description ?? "—"}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </>
        )}
      </Section>
    </DevelopmentShell>
  );
}
