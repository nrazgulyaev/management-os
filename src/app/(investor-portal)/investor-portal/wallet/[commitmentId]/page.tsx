import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getInvestorSession } from "@/lib/investor-portal/session";
import {
  getMyCommitment,
  getMyWallet,
} from "@/lib/investor-portal/queries";
import { getPortalStrings } from "@/lib/investor-portal/translations";
import { PortalShell } from "@/components/investor-portal/portal-shell";
import { Button } from "@/components/ui/button";
import {
  WALLET_TX_TYPE_LABEL,
  formatUsdMinor,
} from "@/lib/development/constants/investor-constants";

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

  const [commitment, walletBundle] = await Promise.all([
    getMyCommitment(commitmentId),
    getMyWallet(commitmentId),
  ]);
  if (!commitment || !walletBundle.wallet) notFound();
  const w = walletBundle.wallet;

  return (
    <PortalShell
      strings={strings}
      investorName={session.investorLegalName}
      investorCode={session.investorCode}
    >
      <div>
        <Link
          href={`/investor-portal/commitments/${commitment.id}`}
          className="inline-flex items-center gap-1 text-xs text-ink-tertiary hover:text-ink mb-3"
        >
          <ArrowLeft className="w-3 h-3" /> {commitment.commitmentCode}
        </Link>
        <h1 className="font-display text-2xl text-ink">
          {strings.navWallet}
        </h1>
        <p className="text-sm text-ink-secondary mt-1">
          {commitment.projectName ?? "Multi-project commitment"} ·{" "}
          {commitment.commitmentCode}
        </p>
      </div>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Available" value={formatUsdMinor(BigInt(w.availableBalanceUsdMinor))} />
        <Stat label="On hold" value={formatUsdMinor(BigInt(w.holdBalanceUsdMinor))} />
        <Stat
          label="Lifetime drawn"
          value={formatUsdMinor(BigInt(w.totalDrawnUsdMinor))}
        />
        <Stat
          label="Lifetime withdrawn"
          value={formatUsdMinor(BigInt(w.totalWithdrawnUsdMinor))}
        />
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-wide text-ink-tertiary mb-3">
          Transaction ledger
        </h2>
        {walletBundle.recentTransactions.length === 0 ? (
          <div className="rounded-md border border-line-soft bg-surface p-6 text-sm text-ink-secondary">
            No transactions yet. The first entry will appear once a drawdown
            is confirmed or a distribution is executed.
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

      <section className="rounded-md border border-line-soft bg-muted p-4 text-sm">
        <h3 className="text-ink font-medium mb-2">Want to withdraw or reinvest?</h3>
        <p className="text-ink-secondary mb-3">{strings.notYetEnabled}</p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" disabled>
            {strings.requestWithdrawal}
          </Button>
          <Button variant="secondary" size="sm" disabled>
            {strings.requestReinvest}
          </Button>
        </div>
      </section>
    </PortalShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line-soft bg-surface p-4">
      <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
        {label}
      </div>
      <div className="text-xl font-medium tabular-nums text-ink mt-1">
        {value}
      </div>
    </div>
  );
}
