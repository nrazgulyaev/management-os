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
      <div className="flex flex-col gap-5">
        {/* Page header — mono eyebrow + Space Grotesk display title */}
        <header>
          <Link
            href={`/investor-portal/commitments/${commitment.id}`}
            className="mb-3 inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-tertiary transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-3 w-3" /> {commitment.commitmentCode}
          </Link>
          <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-4">
            Wallet
          </div>
          <h1 className="mt-1.5 font-display text-[29px] font-medium leading-none tracking-[-0.02em] text-ink">
            {strings.navWallet}
          </h1>
          <p className="mt-1.5 text-[13.5px] text-ink-3">
            {commitment.projectName ?? "Multi-project commitment"} ·{" "}
            {commitment.commitmentCode}
          </p>
        </header>

        {/* Top band: amber available-to-withdraw KPI + action rail left,
            payout method right. */}
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_2fr]">
          <div className="flex flex-col gap-3.5">
            {/* Amber hero KPI — available to withdraw */}
            <div className="bg-gradient-amber-hero rounded-[14px] p-5 text-white shadow-soft-card">
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/80">
                Available to withdraw
              </div>
              <div className="mt-2 font-display text-[32px] font-medium leading-none tabular-nums tracking-[-0.02em]">
                {formatUsdMinor(cash)}
              </div>
              <div className="mt-2 text-xs text-white/80">
                Spendable cash — withdraw or reinvest
              </div>
            </div>

            {/* Carbon CTA + ghost reinvest — the live request flows. */}
            <Button asChild variant="primary" disabled={!hasCash}>
              <Link
                href={hasCash ? "/investor-portal/wallet/withdraw" : "#"}
                aria-disabled={!hasCash}
                className="w-full"
              >
                <ArrowDownToLine className="h-4 w-4" strokeWidth={1.75} />
                {strings.requestWithdrawal}
              </Link>
            </Button>
            <Button asChild variant="secondary" disabled={!hasCash}>
              <Link
                href={hasCash ? "/investor-portal/wallet/reinvest" : "#"}
                aria-disabled={!hasCash}
                className="w-full"
              >
                <Repeat className="h-4 w-4" strokeWidth={1.75} />
                {strings.requestReinvest}
              </Link>
            </Button>
            <p className="text-xs leading-relaxed text-ink-tertiary">
              {hasCash
                ? "Every request is reviewed and executed by the Arconique team — manually, no money moves on submit."
                : "Withdraw and reinvest unlock once a distribution settles to cash."}
            </p>

            {/* Payout method card */}
            <div className="rounded-[14px] border border-line bg-panel p-5 shadow-soft-card">
              <div className="mb-2.5 flex items-baseline justify-between">
                <h3 className="font-display text-[17px] font-medium tracking-[-0.01em] text-ink">
                  Balances
                </h3>
              </div>
              <dl className="flex flex-col gap-2.5">
                <WalletRow
                  label="On hold"
                  value={formatUsdMinor(BigInt(w.holdBalanceUsdMinor))}
                />
                <WalletRow
                  label="Pending distribution"
                  value={formatUsdMinor(BigInt(w.pendingDistributionMinor))}
                />
                <WalletRow
                  label="Lifetime drawn"
                  value={formatUsdMinor(BigInt(w.totalDrawnUsdMinor))}
                />
                <WalletRow
                  label="Lifetime withdrawn"
                  value={formatUsdMinor(BigInt(w.totalWithdrawnUsdMinor))}
                />
                <WalletRow
                  label="Lifetime reinvested"
                  value={formatUsdMinor(BigInt(w.totalReinvestedUsdMinor))}
                />
                <WalletRow
                  label="Capital returned"
                  value={formatUsdMinor(BigInt(w.totalReturnedCapitalUsdMinor))}
                />
                <WalletRow
                  label="Profit distributed"
                  value={formatUsdMinor(
                    BigInt(w.totalProfitDistributedUsdMinor),
                  )}
                />
              </dl>
            </div>
          </div>

          {/* Movements ledger — table.data styling */}
          <div className="overflow-hidden rounded-[18px] border border-line bg-panel shadow-soft-card">
            <div className="flex items-baseline justify-between px-[22px] pb-2 pt-[22px]">
              <h3 className="font-display text-[17px] font-medium tracking-[-0.01em] text-ink">
                Movements
              </h3>
            </div>
            {walletBundle.recentTransactions.length === 0 ? (
              <p className="px-[22px] pb-[22px] pt-4 text-sm text-ink-secondary">
                No transactions yet. The first entry will appear once a drawdown
                is confirmed or a distribution is executed.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="border-b border-line px-4 pb-2.5 pt-2 text-left font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink-3">
                        When
                      </th>
                      <th className="border-b border-line px-4 pb-2.5 pt-2 text-left font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink-3">
                        {strings.type}
                      </th>
                      <th className="border-b border-line px-4 pb-2.5 pt-2 text-right font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink-3">
                        {strings.amount}
                      </th>
                      <th className="border-b border-line px-4 pb-2.5 pt-2 text-right font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink-3">
                        After
                      </th>
                      <th className="border-b border-line px-4 pb-2.5 pt-2 text-left font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink-3">
                        Note
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {walletBundle.recentTransactions.map((t) => {
                      const amt = BigInt(t.amountUsdMinor);
                      return (
                        <tr
                          key={t.id}
                          className="border-b border-line-soft transition-colors last:border-b-0 hover:bg-bg-3"
                        >
                          <td className="px-4 py-3.5 text-[13px] font-semibold text-ink">
                            {new Date(t.occurredAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3.5 text-[13.5px] text-ink-2">
                            {WALLET_TX_TYPE_LABEL[t.transactionType]}
                          </td>
                          <td
                            className={`px-4 py-3.5 text-right font-mono text-[13px] font-semibold tabular-nums ${amt < 0n ? "text-ink-2" : "text-ok"}`}
                          >
                            {amt > 0n
                              ? `+ ${formatUsdMinor(amt)}`
                              : amt < 0n
                                ? `− ${formatUsdMinor(-amt)}`
                                : formatUsdMinor(amt)}
                          </td>
                          <td className="px-4 py-3.5 text-right font-mono text-[13px] tabular-nums text-ink-3">
                            {formatUsdMinor(
                              BigInt(t.balanceAvailableAfterUsdMinor),
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-xs text-ink-secondary">
                            {t.description ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Requests against this wallet. */}
        {walletRequests.length > 0 && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-4">
                Requests against this wallet
              </h2>
              <Link
                href="/investor-portal/requests"
                className="inline-flex items-center gap-1 text-xs font-semibold text-amber-deep transition-colors hover:text-amber"
              >
                All requests
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
            <ul className="flex flex-col gap-2">
              {walletRequests.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-4 rounded-[14px] border border-line bg-panel p-4 shadow-soft-card"
                >
                  <div>
                    <div className="text-[13.5px] font-medium text-ink">
                      <span className="font-mono text-ink-3">
                        {r.requestCode}
                      </span>{" "}
                      ·{" "}
                      {PORTAL_REQUEST_TYPE_LABEL[
                        r.requestType as keyof typeof PORTAL_REQUEST_TYPE_LABEL
                      ] ?? r.requestType.replace(/_/g, " ")}
                    </div>
                    <div className="mt-0.5 font-mono text-xs tabular-nums text-ink-tertiary">
                      {formatUsdMinor(BigInt(r.requestedAmountMinor))}{" "}
                      {r.currency} ·{" "}
                      {new Date(r.submittedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <RequestStatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </PortalShell>
  );
}

/** Single label/value row inside the wallet balances card. */
function WalletRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[13px] text-ink-3">{label}</dt>
      <dd className="font-mono text-[13px] font-medium tabular-nums text-ink-2">
        {value}
      </dd>
    </div>
  );
}
