import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import {
  CommitmentLifecycleControls,
  RequestDrawdownControl,
  DrawdownRowControls,
} from "./_controls";
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

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="card px-[18px] py-[14px]">
      <div className="label">{label}</div>
      <div className="font-mono text-[20px] text-ink mt-1.5 tabular-nums">
        {value}
      </div>
      {hint && <div className="text-[11px] text-ink-3 mt-1">{hint}</div>}
    </div>
  );
}

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
        <header className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os/commitments">
                Capital · commitments
              </Link>
              <span>/</span>
              <span>Detail</span>
            </div>
            <h1>Commitment detail</h1>
          </div>
        </header>
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL to view commitment details."
          action={<HandoffBadge tone="warn">DATABASE_URL not set</HandoffBadge>}
        />
      </DevelopmentShell>
    );
  }

  const commitment = await getCommitment(id);
  if (!commitment) notFound();

  const walletBundle = await getWalletByCommitment(commitment.id);

  return (
    <DevelopmentShell>
      <header className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os/commitments">Capital · commitments</Link>
            <span>/</span>
            <span>{commitment.commitmentCode}</span>
          </div>
          <h1>
            {commitment.projectName
              ? `${commitment.projectName} commitment`
              : "Multi-project commitment"}{" "}
            <em>· {commitment.commitmentCode}</em>
          </h1>
          <div className="page-header-meta">
            <span>{commitment.investorLegalName}</span>
            <span>·</span>
            <span>{CURRENCY_LABEL[commitment.committedCurrency]}</span>
            {commitment.signedAt && (
              <>
                <span>·</span>
                <span>signed {commitment.signedAt}</span>
              </>
            )}
          </div>
        </div>
        <div className="actions">
          <HandoffBadge
            tone={
              commitment.status === "active"
                ? "ok"
                : commitment.status === "fully_called"
                  ? "info"
                  : commitment.status === "closed"
                    ? "soft"
                    : "warn"
            }
          >
            {COMMITMENT_STATUS_LABEL[commitment.status]}
          </HandoffBadge>
          {commitment.isLandownerJv && (
            <HandoffBadge tone="gold">Landowner JV</HandoffBadge>
          )}
          <Link
            href="/development-os/commitments"
            className="btn btn-dark btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            All commitments
          </Link>
          <CommitmentLifecycleControls
            commitmentId={commitment.id}
            status={commitment.status}
            profitSharePercent={commitment.profitSharePercent}
            capitalReturnPriority={commitment.capitalReturnPriority}
            signedAt={commitment.signedAt}
            notes={commitment.notes}
          />
        </div>
      </header>

      {commitment.notes && (
        <p className="text-ink-secondary text-sm max-w-3xl leading-relaxed -mt-2">
          {commitment.notes}
        </p>
      )}

      <section>
        <div className="label mb-3">Negotiated commitment terms</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Committed"
            value={formatCurrencyMinor(
              BigInt(commitment.committedAmountMinor),
              commitment.committedCurrency,
            )}
            hint={`≈ ${formatUsdMinor(BigInt(commitment.committedAmountUsdMinor))} at FX ${commitment.fxRateAtCommitment}`}
          />
          <StatCard
            label="Profit share"
            value={`${Number(commitment.profitSharePercent).toFixed(2)}%`}
            hint={`Priority ${commitment.capitalReturnPriority}`}
          />
          <StatCard
            label="Drawn"
            value={formatUsdMinor(BigInt(commitment.drawnUsdMinor))}
            hint={`${commitment.drawnPercent.toFixed(1)}% of committed`}
          />
          <StatCard
            label="In wallet"
            value={formatUsdMinor(BigInt(commitment.walletAvailableUsdMinor))}
            hint="Available to withdraw"
          />
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="label">Capital calls · drawdowns</div>
          <RequestDrawdownControl
            commitmentId={commitment.id}
            status={commitment.status}
            defaultCurrency={commitment.committedCurrency}
          />
        </div>
        {commitment.drawdowns.length === 0 ? (
          <EmptyState
            title="No drawdowns yet"
            description="Request the first capital call to begin drawing committed capital. Use the “Request capital call” button above."
          />
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>#</th>
                    <th className="num">Amount</th>
                    <th className="num">USD</th>
                    <th>Requested</th>
                    <th>Due</th>
                    <th>Received</th>
                    <th>Trigger</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {commitment.drawdowns.map((d) => (
                    <tr key={d.id}>
                      <td className="font-mono text-xs">#{d.drawdownNumber}</td>
                      <td className="num">
                        {formatCurrencyMinor(BigInt(d.amountMinor), d.currency)}
                      </td>
                      <td className="num">
                        {formatUsdMinor(BigInt(d.amountUsdMinor))}
                      </td>
                      <td className="font-mono text-[11px]">
                        {new Date(d.requestedAt).toLocaleDateString()}
                      </td>
                      <td className="font-mono text-[11px]">{d.dueDate}</td>
                      <td className="font-mono text-[11px]">
                        {d.receivedAt
                          ? new Date(d.receivedAt).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="text-ink-3 text-xs">
                        {DRAWDOWN_TRIGGER_LABEL[d.triggerReason]}
                      </td>
                      <td>
                        <HandoffBadge
                          tone={
                            d.status === "received"
                              ? "ok"
                              : d.status === "overdue"
                                ? "danger"
                                : d.status === "cancelled"
                                  ? "soft"
                                  : "warn"
                          }
                        >
                          {DRAWDOWN_STATUS_LABEL[d.status]}
                        </HandoffBadge>
                      </td>
                      <td>
                        <DrawdownRowControls
                          commitmentId={commitment.id}
                          drawdownId={d.id}
                          status={d.status}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section>
        <div className="label mb-3">Recent wallet activity</div>
        {!walletBundle.wallet ? (
          <EmptyState
            title="Wallet not initialized"
            description="The wallet should be auto-created with the commitment. If missing, this is a data integrity issue — check the commitment-actions transactional path."
          />
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <StatCard
                label="Available"
                value={formatUsdMinor(
                  BigInt(walletBundle.wallet.availableBalanceUsdMinor),
                )}
              />
              <StatCard
                label="On hold"
                value={formatUsdMinor(
                  BigInt(walletBundle.wallet.holdBalanceUsdMinor),
                )}
              />
              <StatCard
                label="Lifetime drawn"
                value={formatUsdMinor(
                  BigInt(walletBundle.wallet.totalDrawnUsdMinor),
                )}
              />
              <StatCard
                label="Lifetime withdrawn"
                value={formatUsdMinor(
                  BigInt(walletBundle.wallet.totalWithdrawnUsdMinor),
                )}
              />
            </div>
            {walletBundle.recentTransactions.length === 0 ? (
              <div className="card px-6 py-8 text-center text-sm text-ink-3">
                No transactions yet — confirm a drawdown receipt to see the first
                wallet entry.
              </div>
            ) : (
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Type</th>
                        <th className="num">Amount (USD)</th>
                        <th className="num">After (avail)</th>
                        <th className="num">After (hold)</th>
                        <th>Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {walletBundle.recentTransactions.map((t) => (
                        <tr key={t.id}>
                          <td className="font-mono text-[11px]">
                            {new Date(t.occurredAt).toLocaleString()}
                          </td>
                          <td className="text-ink-3 text-xs">
                            {WALLET_TX_TYPE_LABEL[t.transactionType]}
                          </td>
                          <td
                            className={
                              BigInt(t.amountUsdMinor) < 0n
                                ? "num text-danger"
                                : "num text-ok"
                            }
                          >
                            {formatUsdMinor(BigInt(t.amountUsdMinor))}
                          </td>
                          <td className="num">
                            {formatUsdMinor(
                              BigInt(t.balanceAvailableAfterUsdMinor),
                            )}
                          </td>
                          <td className="num">
                            {formatUsdMinor(BigInt(t.balanceHoldAfterUsdMinor))}
                          </td>
                          <td className="text-ink-3 text-xs">
                            {t.description ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </DevelopmentShell>
  );
}
