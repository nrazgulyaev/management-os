import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getInvestorSession } from "@/lib/investor-portal/session";
import { getMyCommitments } from "@/lib/investor-portal/queries";
import { getPortalStrings } from "@/lib/investor-portal/translations";
import { PortalShell } from "@/components/investor-portal/portal-shell";
import {
  COMMITMENT_STATUS_LABEL,
  formatCurrencyMinor,
  formatUsdMinor,
} from "@/lib/development/constants/investor-constants";

export const metadata: Metadata = {
  title: "My commitments · Arconique Investor Portal",
};
export const dynamic = "force-dynamic";

export default async function CommitmentsPage() {
  const session = await getInvestorSession();
  if (!session) redirect("/investor-portal/login");
  const strings = getPortalStrings(session.reportingLanguage);
  const commitments = await getMyCommitments();

  return (
    <PortalShell
      strings={strings}
      investorName={session.investorLegalName}
      investorCode={session.investorCode}
    >
      <div>
        <h1 className="font-display text-3xl text-stone-900">
          {strings.navCommitments}
        </h1>
        <p className="text-sm text-stone-600 mt-1">
          {commitments.length} commitment{commitments.length === 1 ? "" : "s"}{" "}
          across all projects
        </p>
      </div>

      {commitments.length === 0 ? (
        <div className="rounded-md border border-dashed border-stone-300 bg-white px-6 py-10 text-center">
          <p className="text-sm font-medium text-stone-700">
            {strings.dashNoCommitments}
          </p>
          <p className="text-xs text-stone-500 mt-2 max-w-md mx-auto leading-relaxed">
            Once Arconique attaches a capital commitment to your account, it
            will appear here with drawn-percent + wallet position + status.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-stone-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-[11px] uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-2 text-left">Code</th>
                <th className="px-4 py-2 text-left">{strings.project}</th>
                <th className="px-4 py-2 text-right">Committed</th>
                <th className="px-4 py-2 text-right">Drawn</th>
                <th className="px-4 py-2 text-right">In wallet</th>
                <th className="px-4 py-2 text-right">Profit %</th>
                <th className="px-4 py-2 text-left">{strings.status}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {commitments.map((c) => (
                <tr key={c.id} className="hover:bg-stone-50">
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link
                      href={`/investor-portal/commitments/${c.id}`}
                      className="hover:underline"
                    >
                      {c.commitmentCode}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {c.projectName ?? (
                      <span className="text-stone-500">Multi-project</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCurrencyMinor(
                      BigInt(c.committedAmountMinor),
                      c.committedCurrency,
                    )}
                    <div className="text-[10px] text-stone-500">
                      ≈ {formatUsdMinor(BigInt(c.committedAmountUsdMinor))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatUsdMinor(BigInt(c.drawnUsdMinor))}
                    <div className="text-[10px] text-stone-500">
                      {c.drawnPercent.toFixed(1)}%
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatUsdMinor(BigInt(c.walletAvailableUsdMinor))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {Number(c.profitSharePercent).toFixed(1)}%
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full ${
                        c.status === "active"
                          ? "bg-emerald-100 text-emerald-800"
                          : c.status === "closed"
                            ? "bg-stone-100 text-stone-700"
                            : c.status === "fully_called"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {COMMITMENT_STATUS_LABEL[c.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PortalShell>
  );
}
