import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getInvestorSession } from "@/lib/investor-portal/session";
import {
  getInvestorDashboard,
  getMyCommitments,
} from "@/lib/investor-portal/queries";
import { getPortalStrings } from "@/lib/investor-portal/translations";
import { PortalShell } from "@/components/investor-portal/portal-shell";
import {
  COMMITMENT_STATUS_LABEL,
  formatUsdMinor,
} from "@/lib/development/constants/investor-constants";

export const metadata: Metadata = {
  title: "Dashboard · Arconique Investor Portal",
};
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getInvestorSession();
  if (!session) redirect("/investor-portal/login");

  const strings = getPortalStrings(session.reportingLanguage);
  const [data, commitments] = await Promise.all([
    getInvestorDashboard(),
    getMyCommitments(),
  ]);

  return (
    <PortalShell
      strings={strings}
      investorName={session.investorLegalName}
      investorCode={session.investorCode}
    >
      <div>
        <h1 className="font-display text-3xl text-stone-900">
          {strings.welcomeBack(data.legalName)}
        </h1>
        <p className="text-sm text-stone-600 mt-1">
          {data.activeCommitmentCount}/{data.commitmentCount} active commitments
          · reporting in {data.primaryCurrency}
        </p>
      </div>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label={strings.dashTotalCommitted}
          value={formatUsdMinor(BigInt(data.totalCommittedUsdMinor))}
        />
        <MetricCard
          label={strings.dashTotalDrawn}
          value={formatUsdMinor(BigInt(data.totalDrawnUsdMinor))}
        />
        <MetricCard
          label={strings.dashTotalDistributed}
          value={formatUsdMinor(BigInt(data.totalDistributedUsdMinor))}
        />
        <MetricCard
          label={strings.dashInWallet}
          value={formatUsdMinor(BigInt(data.totalWalletAvailableUsdMinor))}
          hint={
            BigInt(data.totalWalletHoldUsdMinor) > 0n
              ? `+ ${formatUsdMinor(BigInt(data.totalWalletHoldUsdMinor))} on hold`
              : undefined
          }
        />
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-wide text-stone-500 mb-3">
          {strings.dashActiveCommitments}
        </h2>
        {commitments.length === 0 ? (
          <div className="rounded-md border border-dashed border-stone-300 bg-white px-6 py-10 text-center">
            <p className="text-sm font-medium text-stone-700">
              {strings.dashNoCommitments}
            </p>
            <p className="text-xs text-stone-500 mt-2 max-w-md mx-auto leading-relaxed">
              When Arconique creates a commitment under your account, it will
              appear here with capital-call progress + distribution history.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {commitments.map((c) => (
              <Link
                key={c.id}
                href={`/investor-portal/commitments/${c.id}`}
                className="block rounded-lg border border-stone-200 bg-white p-4 hover:border-stone-400 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-xs text-stone-500">
                    {c.commitmentCode}
                  </span>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full ${
                      c.status === "active"
                        ? "bg-emerald-100 text-emerald-800"
                        : c.status === "fully_called"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-stone-100 text-stone-700"
                    }`}
                  >
                    {COMMITMENT_STATUS_LABEL[c.status]}
                  </span>
                </div>
                <div className="font-medium text-stone-900">
                  {c.projectName ?? "Multi-project"}
                </div>
                <div className="text-xs text-stone-500 mt-1">
                  {formatUsdMinor(BigInt(c.committedAmountUsdMinor))} committed
                  · {c.drawnPercent.toFixed(1)}% drawn
                </div>
                <div className="mt-3 h-1 bg-stone-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-stone-700"
                    style={{
                      width: `${Math.min(100, c.drawnPercent)}%`,
                    }}
                  />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </PortalShell>
  );
}

function MetricCard({
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
      <div className="text-2xl font-medium tabular-nums text-stone-900 mt-1">
        {value}
      </div>
      {hint && <div className="text-[11px] text-stone-500 mt-1">{hint}</div>}
    </div>
  );
}
