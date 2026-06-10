import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getInvestorSession } from "@/lib/investor-portal/session";
import { getMyCommitments } from "@/lib/investor-portal/queries";
import { getPortalStrings } from "@/lib/investor-portal/translations";
import { PortalShell } from "@/components/investor-portal/portal-shell";
import { Badge } from "@/components/ui/badge";
import {
  PortalEmpty,
  PortalPageHeader,
  PortalTableCard,
  PortalTh,
} from "@/components/investor-portal/portal-primitives";
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
      <PortalPageHeader
        eyebrow="Commitments"
        title={strings.navCommitments}
        sub={`${commitments.length} commitment${commitments.length === 1 ? "" : "s"} across all projects`}
      />

      {commitments.length === 0 ? (
        <PortalEmpty
          title={strings.dashNoCommitments}
          body="Once Arconique attaches a capital commitment to your account, it will appear here with drawn-percent + wallet position + status."
        />
      ) : (
        <PortalTableCard>
          <thead>
            <tr>
              <PortalTh>Code</PortalTh>
              <PortalTh>{strings.project}</PortalTh>
              <PortalTh align="right">Committed</PortalTh>
              <PortalTh align="right">Drawn</PortalTh>
              <PortalTh align="right">In wallet</PortalTh>
              <PortalTh align="right">Profit %</PortalTh>
              <PortalTh>{strings.status}</PortalTh>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft text-[13.5px] text-ink-2">
            {commitments.map((c) => (
              <tr key={c.id} className="transition-colors hover:bg-bg-3">
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
                    <span className="text-ink-3">Multi-project</span>
                  )}
                </td>
                <td className="px-4 py-3.5 text-right font-mono tabular-nums">
                  {formatCurrencyMinor(
                    BigInt(c.committedAmountMinor),
                    c.committedCurrency,
                  )}
                  <div className="text-[10px] text-ink-4">
                    ≈ {formatUsdMinor(BigInt(c.committedAmountUsdMinor))}
                  </div>
                </td>
                <td className="px-4 py-3.5 text-right font-mono tabular-nums">
                  {formatUsdMinor(BigInt(c.drawnUsdMinor))}
                  <div className="text-[10px] text-ink-4">
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
        </PortalTableCard>
      )}
    </PortalShell>
  );
}
