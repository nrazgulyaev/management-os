import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getInvestorSession } from "@/lib/investor-portal/session";
import {
  getMyDistributionAllocation,
  getMyDistributions,
} from "@/lib/investor-portal/queries";
import { getPortalStrings } from "@/lib/investor-portal/translations";
import { PortalShell } from "@/components/investor-portal/portal-shell";
import { Badge } from "@/components/ui/badge";
import {
  PortalBreakdownRow,
  PortalCard,
  PortalDetailHeader,
  PortalKpi,
  PortalProgress,
  PortalSectionTitle,
} from "@/components/investor-portal/portal-primitives";
import {
  DISTRIBUTION_STATUS_LABEL,
  DISTRIBUTION_TYPE_LABEL,
  formatUsdMinor,
} from "@/lib/development/constants/investor-constants";

export const metadata: Metadata = {
  title: "Distribution · Arconique Investor Portal",
};
export const dynamic = "force-dynamic";

export default async function PortalDistributionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getInvestorSession();
  if (!session) redirect("/investor-portal/login");
  const strings = getPortalStrings(session.reportingLanguage);

  const list = await getMyDistributions();
  const distribution = list.find((d) => d.id === id);
  if (!distribution) notFound();
  const myAllocation = await getMyDistributionAllocation(id);

  const allocTotal = myAllocation
    ? BigInt(myAllocation.totalAmountUsdMinor)
    : 0n;
  const capitalReturn = myAllocation
    ? BigInt(myAllocation.capitalReturnAmountUsdMinor)
    : 0n;
  const profit = myAllocation ? BigInt(myAllocation.profitAmountUsdMinor) : 0n;
  const capitalReturnPct =
    allocTotal > 0n ? (Number(capitalReturn) / Number(allocTotal)) * 100 : 0;

  return (
    <PortalShell
      strings={strings}
      investorName={session.investorLegalName}
      investorCode={session.investorCode}
      pageTitle="Distribution"
    >
      <PortalDetailHeader
        backHref="/investor-portal/distributions"
        backLabel={strings.navDistributions}
        title={`${DISTRIBUTION_TYPE_LABEL[distribution.distributionType]} #${distribution.distributionNumber}`}
        sub={`${distribution.projectName ?? "Company-wide"} · effective ${distribution.effectiveDate}`}
        badge={
          <Badge
            tone={distribution.status === "completed" ? "success" : "warning"}
          >
            {DISTRIBUTION_STATUS_LABEL[distribution.status]}
          </Badge>
        }
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <PortalKpi
          label="Total distributed"
          value={formatUsdMinor(BigInt(distribution.totalAmountUsdMinor))}
          hint="across all investors"
        />
        <PortalKpi
          label="My allocation"
          value={myAllocation ? formatUsdMinor(allocTotal) : "—"}
          hint={
            myAllocation
              ? `${Number(myAllocation.profitSharePercentUsed).toFixed(2)}% share`
              : undefined
          }
          tone="amber"
        />
        <PortalKpi
          label="My capital return"
          value={myAllocation ? formatUsdMinor(capitalReturn) : "—"}
        />
        <PortalKpi
          label="My profit share"
          value={myAllocation ? formatUsdMinor(profit) : "—"}
        />
      </section>

      <div className="mt-5 grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
        <PortalCard>
          <PortalSectionTitle title="Allocation breakdown" />
          {myAllocation ? (
            <>
              <div className="mb-4">
                <div className="mb-2 flex items-center justify-between text-[12px]">
                  <span className="text-ink-3">
                    Capital return vs profit split
                  </span>
                  <span className="tnum text-ink-3">
                    {capitalReturnPct.toFixed(0)}% / {(100 - capitalReturnPct).toFixed(0)}%
                  </span>
                </div>
                <PortalProgress percent={capitalReturnPct} tone="steel" />
              </div>
              <PortalBreakdownRow
                label="Return of capital"
                value={formatUsdMinor(capitalReturn)}
              />
              <PortalBreakdownRow
                label="Profit split"
                value={formatUsdMinor(profit)}
              />
              <PortalBreakdownRow
                label="Profit share % used"
                value={`${Number(myAllocation.profitSharePercentUsed).toFixed(2)}%`}
              />
              <PortalBreakdownRow
                label="Outstanding capital at declare"
                value={formatUsdMinor(
                  BigInt(myAllocation.outstandingCapitalAtDeclareUsdMinor),
                )}
              />
              <PortalBreakdownRow
                label="Commitment"
                value={
                  <span className="font-mono text-xs">
                    {myAllocation.commitmentCode}
                  </span>
                }
              />
              <hr className="my-3.5 border-0 border-t border-line-soft" />
              <PortalBreakdownRow
                label="My total allocation"
                value={formatUsdMinor(allocTotal)}
                emphasis
              />
            </>
          ) : (
            <p className="text-sm text-ink-3">
              You did not receive an allocation in this distribution.
            </p>
          )}
        </PortalCard>

        <PortalCard>
          <PortalSectionTitle title="Status" />
          <PortalBreakdownRow
            label="Distribution"
            value={DISTRIBUTION_STATUS_LABEL[distribution.status]}
          />
          <PortalBreakdownRow
            label="Type"
            value={DISTRIBUTION_TYPE_LABEL[distribution.distributionType]}
          />
          <PortalBreakdownRow
            label="Effective date"
            value={distribution.effectiveDate}
          />
          {myAllocation?.executedAt ? (
            <PortalBreakdownRow
              label="Credited to wallet"
              value={new Date(myAllocation.executedAt).toLocaleDateString()}
            />
          ) : null}
          {myAllocation && myAllocation.status === "executed" ? (
            <p className="mt-4 rounded-[10px] border border-line-soft bg-bg-2 px-4 py-3 text-[12.5px] leading-relaxed text-ink-3">
              This allocation was credited to your wallet. You can{" "}
              <Link
                href={`/investor-portal/wallet/${myAllocation.commitmentId}`}
                className="font-semibold text-amber-deep hover:underline"
              >
                view your wallet ledger
              </Link>{" "}
              to see the resulting transaction.
            </p>
          ) : null}
        </PortalCard>
      </div>
    </PortalShell>
  );
}
