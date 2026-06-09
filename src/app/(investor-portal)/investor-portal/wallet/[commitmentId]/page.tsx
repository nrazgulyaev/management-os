import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowDownToLine, Repeat, ArrowUpRight } from "lucide-react";
import { getInvestorSession } from "@/lib/investor-portal/session";
import {
  getMyCommitment,
  getMyWallet,
  getMyWalletRequests,
} from "@/lib/investor-portal/queries";
import { getPortalStrings } from "@/lib/investor-portal/translations";
import { PortalShell } from "@/components/investor-portal/portal-shell";
import { Button } from "@/components/ui/button";
import { RequestStatusBadge } from "@/components/investor-portal/request-lifecycle";
import {
  WALLET_TX_TYPE_LABEL,
  formatUsdMinor,
} from "@/lib/development/constants/investor-constants";
import { PORTAL_REQUEST_TYPE_LABEL } from "@/lib/development/constants/investor-request-constants";

export const metadata: Metadata = {
  title: "Wallet · Arconique Investor Portal",
};
export const dynamic = "force-dynamic";

export default async function PortalWalletPage({
  params,
}: {
  params: Promise<{ commitmentId: string }>;
}) {
  const { commitmentId } = await params;
  const session = await getInvestorSession();
  if (!session) redirect("/investor-portal/login");
  const strings = getPortalStrings(session.reportingLanguage);

  const [commitment, walletBundle, walletRequests] = await Promise.all([
    getMyCommitment(commitmentId),
    getMyWallet(commitmentId),
    getMyWalletRequests(commitmentId),
  ]);
  if (!commitment || !walletBundle.wallet) notFound();
  const w = walletBundle.wallet;

  const cash = BigInt(w.cashBalanceMinor);
  const hasCash = cash > 0n;

  return (
    <PortalShell
      strings={strings}
      investorName={session.investorLegalName}
      investorCode={session.investorCode}
      pageTitle="Wallet"
    >
      <div>
        <Link
          href={`/investor-portal/commitments/${commitment.id}`}
          className="inline-flex items-center gap-1 text-xs text-ink-tertiary hover:text-ink mb-3"
        >
          <ArrowLeft className="w-3 h-3" /> {commitment.commitmentCode}
        </Link>
        <h1 className="font-display text-2xl text-ink">{strings.navWallet}</h1>
        <p className="text-sm text-ink-secondary mt-1">
          {commitment.projectName ?? "Multi-project commitment"} ·{" "}
          {commitment.commitmentCode}
        </p>
      </div>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label="Spendable cash"
          value={formatUsdMinor(cash)}
          hint="Available to withdraw or reinvest"
        />
        <Stat
          label="On hold"
          value={formatUsdMinor(BigInt(w.holdBalanceUsdMinor))}
        />
        <Stat
          label="Pending distribution"
          value={formatUsdMinor(BigInt(w.pendingDistributionMinor))}
        />
        <Stat
          label="Lifetime drawn"
          value={formatUsdMinor(BigInt(w.totalDrawnUsdMinor))}
        />
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label="Lifetime withdrawn"
          value={formatUsdMinor(BigInt(w.totalWithdrawnUsdMinor))}
        />
        <Stat
          label="Lifetime reinvested"
          value={formatUsdMinor(BigInt(w.totalReinvestedUsdMinor))}
        />
        <Stat
          label="Capital returned"
          value={formatUsdMinor(BigInt(w.totalReturnedCapitalUsdMinor))}
        />
        <Stat
          label="Profit distributed"
          value={formatUsdMinor(BigInt(w.totalProfitDistributedUsdMinor))}
        />
      </section>

      {/* Action rail — the live withdraw / reinvest flows. */}
      <section className="rounded-lg border border-line-soft bg-muted p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-ink font-medium">Move your cash</h3>
            <p className="text-sm text-ink-secondary mt-1 max-w-md">
              {hasCash
                ? "Withdraw to your bank or reinvest into another Arconique project. Every request is reviewed and executed by the Arconique team — manually, no money moves on submit."
                : "You have no spendable cash on this wallet right now. Withdraw and reinvest unlock once a distribution settles to cash."}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button asChild variant="primary" size="sm" disabled={!hasCash}>
              <Link
                href={
                  hasCash ? "/investor-portal/wallet/withdraw" : "#"
                }
                aria-disabled={!hasCash}
              >
                <ArrowDownToLine className="w-4 h-4" strokeWidth={1.75} />
                {strings.requestWithdrawal}
              </Link>
            </Button>
            <Button asChild variant="secondary" size="sm" disabled={!hasCash}>
              <Link
                href={hasCash ? "/investor-portal/wallet/reinvest" : "#"}
                aria-disabled={!hasCash}
              >
                <Repeat className="w-4 h-4" strokeWidth={1.75} />
                {strings.requestReinvest}
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Requests against this wallet. */}
      {walletRequests.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm uppercase tracking-wide text-ink-tertiary">
              Requests against this wallet
            </h2>
            <Link
              href="/investor-portal/requests"
              className="inline-flex items-center gap-1 text-xs text-ink-secondary hover:text-ink"
            >
              All requests
              <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
          <ul className="space-y-2">
            {walletRequests.map((r) => (
              <li
                key={r.id}
                className="rounded-md border border-line-soft bg-surface p-4 flex items-center justify-between gap-4"
              >
                <div>
                  <div className="text-sm font-medium text-ink">
                    <span className="font-mono text-ink-secondary">
                      {r.requestCode}
                    </span>{" "}
                    ·{" "}
                    {PORTAL_REQUEST_TYPE_LABEL[
                      r.requestType as keyof typeof PORTAL_REQUEST_TYPE_LABEL
                    ] ?? r.requestType.replace(/_/g, " ")}
                  </div>
                  <div className="text-xs text-ink-tertiary mt-0.5 tabular-nums">
                    {formatUsdMinor(BigInt(r.requestedAmountMinor))} {r.currency}{" "}
                    · {new Date(r.submittedAt).toLocaleDateString()}
                  </div>
                </div>
                <RequestStatusBadge status={r.status} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-sm uppercase tracking-wide text-ink-tertiary mb-3">
          Transaction ledger
        </h2>
        {walletBundle.recentTransactions.length === 0 ? (
          <div className="rounded-md border border-line-soft bg-surface p-6 text-sm text-ink-secondary">
            No transactions yet. The first entry will appear once a drawdown is
            confirmed or a distribution is executed.
          </div>
        ) : (
          <div className="rounded-lg border border-line-soft bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-[11px] uppercase tracking-wide text-ink-tertiary">
                <tr>
                  <th className="px-4 py-2 text-left">When</th>
                  <th className="px-4 py-2 text-left">{strings.type}</th>
                  <th className="px-4 py-2 text-right">{strings.amount}</th>
                  <th className="px-4 py-2 text-right">After (avail)</th>
                  <th className="px-4 py-2 text-left">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {walletBundle.recentTransactions.map((t) => {
                  const amt = BigInt(t.amountUsdMinor);
                  return (
                    <tr key={t.id}>
                      <td className="px-4 py-3 text-xs">
                        {new Date(t.occurredAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {WALLET_TX_TYPE_LABEL[t.transactionType]}
                      </td>
                      <td
                        className={`px-4 py-3 text-right tabular-nums ${amt < 0n ? "text-danger" : "text-success"}`}
                      >
                        {formatUsdMinor(amt)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatUsdMinor(
                          BigInt(t.balanceAvailableAfterUsdMinor),
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-secondary">
                        {t.description ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PortalShell>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-line-soft bg-surface p-4">
      <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
        {label}
      </div>
      <div className="text-xl font-medium tabular-nums text-ink mt-1">
        {value}
      </div>
      {hint && <div className="text-[11px] text-ink-tertiary mt-1">{hint}</div>}
    </div>
  );
}
