import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getInvestorSession } from "@/lib/investor-portal/session";
import {
  getMyCommitment,
  getMyDrawdowns,
  getMyIRR,
  getMyWallet,
} from "@/lib/investor-portal/queries";
import { getPortalStrings } from "@/lib/investor-portal/translations";
import { PortalShell } from "@/components/investor-portal/portal-shell";
import {
  DRAWDOWN_STATUS_LABEL,
  WALLET_TX_TYPE_LABEL,
  formatCurrencyMinor,
  formatUsdMinor,
} from "@/lib/development/constants/investor-constants";

export const metadata: Metadata = {
  title: "Commitment · Arconique Investor Portal",
};
export const dynamic = "force-dynamic";

export default async function CommitmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getInvestorSession();
  if (!session) redirect("/investor-portal/login");
  const strings = getPortalStrings(session.reportingLanguage);

  const commitment = await getMyCommitment(id);
  if (!commitment) notFound();

  const [drawdowns, walletBundle, irr] = await Promise.all([
    getMyDrawdowns(id),
    getMyWallet(id),
    getMyIRR(id),
  ]);

  return (
    <PortalShell
      strings={strings}
      investorName={session.investorLegalName}
      investorCode={session.investorCode}
    >
      <div>
        <Link
          href="/investor-portal/commitments"
          className="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-stone-900 mb-3"
        >
          <ArrowLeft className="w-3 h-3" /> {strings.navCommitments}
        </Link>
        <h1 className="font-display text-2xl text-stone-900">
          {commitment.projectName ?? "Multi-project commitment"}
        </h1>
        <p className="text-sm text-stone-600 mt-1 font-mono">
          {commitment.commitmentCode}
        </p>
      </div>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label="Committed"
          value={formatCurrencyMinor(
            BigInt(commitment.committedAmountMinor),
            commitment.committedCurrency,
          )}
          hint={`≈ ${formatUsdMinor(BigInt(commitment.committedAmountUsdMinor))}`}
        />
        <Stat
          label="Profit share"
          value={`${Number(commitment.profitSharePercent).toFixed(2)}%`}
          hint={`Priority ${commitment.capitalReturnPriority}`}
        />
        <Stat
          label="Drawn"
          value={formatUsdMinor(BigInt(commitment.drawnUsdMinor))}
          hint={`${commitment.drawnPercent.toFixed(1)}% of committed`}
        />
        <Stat
          label="In wallet"
          value={formatUsdMinor(BigInt(commitment.walletAvailableUsdMinor))}
          hint={
            irr.irrAnnualized !== null
              ? `IRR ${(irr.irrAnnualized * 100).toFixed(1)}%`
              : "IRR pending"
          }
        />
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-wide text-stone-500 mb-3">
          Drawdowns
        </h2>
        {drawdowns.length === 0 ? (
          <div className="rounded-md border border-stone-200 bg-white p-6 text-sm text-stone-600">
            No drawdowns recorded yet.
          </div>
        ) : (
          <div className="rounded-lg border border-stone-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-[11px] uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-2 text-left">#</th>
                  <th className="px-4 py-2 text-right">{strings.amount}</th>
                  <th className="px-4 py-2 text-right">USD</th>
                  <th className="px-4 py-2 text-left">Due</th>
                  <th className="px-4 py-2 text-left">Received</th>
                  <th className="px-4 py-2 text-left">{strings.status}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {drawdowns.map((d) => (
                  <tr key={d.id}>
                    <td className="px-4 py-3 font-mono text-xs">
                      #{d.drawdownNumber}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCurrencyMinor(BigInt(d.amountMinor), d.currency)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatUsdMinor(BigInt(d.amountUsdMinor))}
                    </td>
                    <td className="px-4 py-3 text-xs">{d.dueDate}</td>
                    <td className="px-4 py-3 text-xs">
                      {d.receivedAt
                        ? new Date(d.receivedAt).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full ${
                          d.status === "received"
                            ? "bg-emerald-100 text-emerald-800"
                            : d.status === "overdue"
                              ? "bg-red-100 text-red-800"
                              : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {DRAWDOWN_STATUS_LABEL[d.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm uppercase tracking-wide text-stone-500">
            Wallet activity
          </h2>
          <Link
            href={`/investor-portal/wallet/${commitment.id}`}
            className="text-xs text-stone-700 hover:text-stone-900"
          >
            View full ledger →
          </Link>
        </div>
        {!walletBundle.wallet ||
        walletBundle.recentTransactions.length === 0 ? (
          <div className="rounded-md border border-stone-200 bg-white p-6 text-sm text-stone-600">
            No wallet activity yet — funds will appear once your first
            drawdown is confirmed.
          </div>
        ) : (
          <div className="rounded-lg border border-stone-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-[11px] uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-2 text-left">When</th>
                  <th className="px-4 py-2 text-left">{strings.type}</th>
                  <th className="px-4 py-2 text-right">{strings.amount} (USD)</th>
                  <th className="px-4 py-2 text-right">After</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
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
                        className={`px-4 py-3 text-right tabular-nums ${amt < 0n ? "text-red-700" : "text-emerald-700"}`}
                      >
                        {formatUsdMinor(amt)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatUsdMinor(
                          BigInt(t.balanceAvailableAfterUsdMinor),
                        )}
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
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="text-[11px] uppercase tracking-wide text-stone-500">
        {label}
      </div>
      <div className="text-xl font-medium tabular-nums text-stone-900 mt-1">
        {value}
      </div>
      {hint && <div className="text-[11px] text-stone-500 mt-1">{hint}</div>}
    </div>
  );
}
