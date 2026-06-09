import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getInvestorSession } from "@/lib/investor-portal/session";
import { getMyCommitments } from "@/lib/investor-portal/queries";
import { getPortalStrings } from "@/lib/investor-portal/translations";
import { PortalShell } from "@/components/investor-portal/portal-shell";
import { Badge } from "@/components/ui/badge";
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
      pageTitle={strings.navCommitments}
    >
      <div className="mb-[22px]">
        <div className="label">Commitments</div>
        <h2 className="display mt-1.5 text-[29px] font-medium tracking-[-0.02em] text-ink">
          {strings.navCommitments}
        </h2>
        <p className="mt-1 text-[13.5px] text-ink-3">
          {commitments.length} commitment{commitments.length === 1 ? "" : "s"}{" "}
          across all projects
        </p>
      </div>

      {commitments.length === 0 ? (
        <div className="rounded-[18px] border border-dashed border-line bg-panel px-6 py-10 text-center">
          <p className="text-sm font-medium text-ink-secondary">
            {strings.dashNoCommitments}
          </p>
          <p className="text-xs text-ink-tertiary mt-2 max-w-md mx-auto leading-relaxed">
            Once Arconique attaches a capital commitment to your account, it
            will appear here with drawn-percent + wallet position + status.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[18px] border border-line bg-panel shadow-soft-card">
          <table className="w-full">
            <thead>
              <tr className="border-b border-line font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
                <th className="px-4 pb-2.5 pt-3.5 text-left font-medium">Code</th>
                <th className="px-4 pb-2.5 pt-3.5 text-left font-medium">{strings.project}</th>
                <th className="px-4 pb-2.5 pt-3.5 text-right font-medium">Committed</th>
                <th className="px-4 pb-2.5 pt-3.5 text-right font-medium">Drawn</th>
                <th className="px-4 pb-2.5 pt-3.5 text-right font-medium">In wallet</th>
                <th className="px-4 pb-2.5 pt-3.5 text-right font-medium">Profit %</th>
                <th className="px-4 pb-2.5 pt-3.5 text-left font-medium">{strings.status}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft text-[13.5px] text-ink-2">
              {commitments.map((c) => (
                <tr key={c.id} className="hover:bg-bg-3">
                  <td className="px-4 py-3.5 font-mono text-xs text-ink">
                    <Link
                      href={`/investor-portal/commitments/${c.id}`}
                      className="hover:underline"
                    >
                      {c.commitmentCode}
                    </Link>
                  </td>
                  <td className="px-4 py-3.5">
                    {c.projectName ?? (
                      <span className="text-ink-tertiary">Multi-project</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono tabular-nums">
                    {formatCurrencyMinor(
                      BigInt(c.committedAmountMinor),
                      c.committedCurrency,
                    )}
                    <div className="text-[10px] text-ink-tertiary">
                      ≈ {formatUsdMinor(BigInt(c.committedAmountUsdMinor))}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono tabular-nums">
                    {formatUsdMinor(BigInt(c.drawnUsdMinor))}
                    <div className="text-[10px] text-ink-tertiary">
                      {c.drawnPercent.toFixed(1)}%
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono tabular-nums">
                    {formatUsdMinor(BigInt(c.walletAvailableUsdMinor))}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono tabular-nums">
                    {Number(c.profitSharePercent).toFixed(1)}%
                  </td>
                  <td className="px-4 py-3.5">
                    <Badge
                      tone={
                        c.status === "active"
                          ? "success"
                          : c.status === "closed"
                            ? "neutral"
                            : c.status === "fully_called"
                              ? "info"
                              : "warning"
                      }
                    >
                      {COMMITMENT_STATUS_LABEL[c.status]}
                    </Badge>
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
