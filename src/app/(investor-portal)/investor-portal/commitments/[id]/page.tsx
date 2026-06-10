import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getInvestorSession } from "@/lib/investor-portal/session";
import {
  getMyCommitment,
  getMyDrawdowns,
  getMyIRR,
  getMyWallet,
} from "@/lib/investor-portal/queries";
import { getPortalStrings } from "@/lib/investor-portal/translations";
import { PortalShell } from "@/components/investor-portal/portal-shell";
import { Badge } from "@/components/ui/badge";
import {
  PortalCard,
  PortalDetailHeader,
  PortalKpi,
  PortalSectionTitle,
  PortalTableCard,
  PortalTh,
} from "@/components/investor-portal/portal-primitives";
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
      pageTitle={strings.navCommitments}
    >
      <PortalDetailHeader
        backHref="/investor-portal/commitments"
        backLabel={strings.navCommitments}
        title={commitment.projectName ?? "Multi-project commitment"}
        sub={
          <span className="font-mono text-ink-3">
            {commitment.commitmentCode}
          </span>
        }
        badge={
          <Badge
            tone={
              commitment.status === "active"
                ? "success"
                : commitment.status === "closed"
                  ? "neutral"
                  : commitment.status === "fully_called"
                    ? "info"
                    : "warning"
            }
          >
            {commitment.status.replace(/_/g, " ")}
          </Badge>
        }
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <PortalKpi
          label="Committed"
          value={formatCurrencyMinor(
            BigInt(commitment.committedAmountMinor),
            commitment.committedCurrency,
          )}
          hint={`≈ ${formatUsdMinor(BigInt(commitment.committedAmountUsdMinor))}`}
        />
        <PortalKpi
          label="Profit share"
          value={`${Number(commitment.profitSharePercent).toFixed(2)}%`}
          hint={`Priority ${commitment.capitalReturnPriority}`}
        />
        <PortalKpi
          label="Drawn"
          value={formatUsdMinor(BigInt(commitment.drawnUsdMinor))}
          hint={`${commitment.drawnPercent.toFixed(1)}% of committed`}
        />
        <PortalKpi
          label="In wallet"
          value={formatUsdMinor(BigInt(commitment.walletAvailableUsdMinor))}
          hint={
            irr.irrAnnualized !== null
              ? `IRR ${(irr.irrAnnualized * 100).toFixed(1)}%`
              : "IRR pending"
          }
        />
      </section>

      <section className="mt-5">
        {drawdowns.length === 0 ? (
          <PortalCard>
            <PortalSectionTitle title="Drawdowns" className="mb-0" />
            <p className="mt-3 text-sm text-ink-3">No drawdowns recorded yet.</p>
          </PortalCard>
        ) : (
          <PortalTableCard title="Drawdowns">
            <thead>
              <tr>
                <PortalTh>#</PortalTh>
                <PortalTh align="right">{strings.amount}</PortalTh>
                <PortalTh align="right">USD</PortalTh>
                <PortalTh>Due</PortalTh>
                <PortalTh>Received</PortalTh>
                <PortalTh>{strings.status}</PortalTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft text-[13.5px] text-ink-2">
              {drawdowns.map((d) => (
                <tr key={d.id} className="transition-colors hover:bg-bg-3">
                  <td className="px-4 py-3.5 font-mono text-xs font-semibold text-ink">
                    #{d.drawdownNumber}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono tabular-nums">
                    {formatCurrencyMinor(BigInt(d.amountMinor), d.currency)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono tabular-nums">
                    {formatUsdMinor(BigInt(d.amountUsdMinor))}
                  </td>
                  <td className="px-4 py-3.5">{d.dueDate}</td>
                  <td className="px-4 py-3.5">
                    {d.receivedAt
                      ? new Date(d.receivedAt).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-4 py-3.5">
                    <Badge
                      tone={
                        d.status === "received"
                          ? "success"
                          : d.status === "overdue"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {DRAWDOWN_STATUS_LABEL[d.status]}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </PortalTableCard>
        )}
      </section>

      <section className="mt-5">
        {!walletBundle.wallet ||
        walletBundle.recentTransactions.length === 0 ? (
          <PortalCard>
            <PortalSectionTitle
              title="Wallet activity"
              className="mb-0"
              action={
                <Link
                  href={`/investor-portal/wallet/${commitment.id}`}
                  className="text-[12.5px] font-semibold text-amber-deep"
                >
                  View full ledger →
                </Link>
              }
            />
            <p className="mt-3 text-sm text-ink-3">
              No wallet activity yet — funds will appear once your first
              drawdown is confirmed.
            </p>
          </PortalCard>
        ) : (
          <PortalTableCard
            title="Wallet activity"
            action={
              <Link
                href={`/investor-portal/wallet/${commitment.id}`}
                className="text-[12.5px] font-semibold text-amber-deep"
              >
                View full ledger →
              </Link>
            }
          >
            <thead>
              <tr>
                <PortalTh>When</PortalTh>
                <PortalTh>{strings.type}</PortalTh>
                <PortalTh align="right">{strings.amount} (USD)</PortalTh>
                <PortalTh align="right">After</PortalTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft text-[13.5px] text-ink-2">
              {walletBundle.recentTransactions.map((t) => {
                const amt = BigInt(t.amountUsdMinor);
                return (
                  <tr key={t.id} className="transition-colors hover:bg-bg-3">
                    <td className="px-4 py-3.5 text-xs">
                      {new Date(t.occurredAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3.5">
                      {WALLET_TX_TYPE_LABEL[t.transactionType]}
                    </td>
                    <td
                      className={`px-4 py-3.5 text-right font-mono font-semibold tabular-nums ${amt < 0n ? "text-ink-2" : "text-ok"}`}
                    >
                      {amt > 0n
                        ? `+ ${formatUsdMinor(amt)}`
                        : amt < 0n
                          ? `− ${formatUsdMinor(-amt)}`
                          : formatUsdMinor(amt)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono tabular-nums text-ink-3">
                      {formatUsdMinor(
                        BigInt(t.balanceAvailableAfterUsdMinor),
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </PortalTableCard>
        )}
      </section>
    </PortalShell>
  );
}
