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
    >
      <div>
        <h1 className="font-display text-3xl text-ink">
          {strings.navCommitments}
        </h1>
        <p className="text-sm text-ink-secondary mt-1">
          {commitments.length} commitment{commitments.length === 1 ? "" : "s"}{" "}
          across all projects
        </p>
      </div>

      {commitments.length === 0 ? (
        <div className="rounded-md border border-dashed border-line-soft bg-surface px-6 py-10 text-center">
          <p className="text-sm font-medium text-ink-secondary">
            {strings.dashNoCommitments}
          </p>
          <p className="text-xs text-ink-tertiary mt-2 max-w-md mx-auto leading-relaxed">
            Once Arconique attaches a capital commitment to your account, it
            will appear here with drawn-percent + wallet position + status.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-line-soft bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted text-[11px] uppercase tracking-wide text-ink-tertiary">
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
            <tbody className="divide-y divide-line-soft">
              {commitments.map((c) => (
                <tr key={c.id} className="hover:bg-muted">
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
                      <span className="text-ink-tertiary">Multi-project</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCurrencyMinor(
                      BigInt(c.committedAmountMinor),
                      c.committedCurrency,
                    )}
                    <div className="text-[10px] text-ink-tertiary">
                      ≈ {formatUsdMinor(BigInt(c.committedAmountUsdMinor))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatUsdMinor(BigInt(c.drawnUsdMinor))}
                    <div className="text-[10px] text-ink-tertiary">
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
