import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getInvestorSession } from "@/lib/investor-portal/session";
import { getMyDistributions } from "@/lib/investor-portal/queries";
import { getPortalStrings } from "@/lib/investor-portal/translations";
import { PortalShell } from "@/components/investor-portal/portal-shell";
import { Badge } from "@/components/ui/badge";
import {
  PortalCard,
  PortalEmpty,
  PortalKpi,
  PortalPageHeader,
  PortalSectionTitle,
  PortalTableCard,
  PortalTh,
} from "@/components/investor-portal/portal-primitives";
import {
  DistributionWaterfall,
  type WaterfallStage,
} from "@/components/award";
import {
  DISTRIBUTION_STATUS_LABEL,
  DISTRIBUTION_TYPE_LABEL,
  formatUsdMinor,
} from "@/lib/development/constants/investor-constants";

export const metadata: Metadata = {
  title: "Distributions · Arconique Investor Portal",
};
export const dynamic = "force-dynamic";

export default async function PortalDistributionsPage() {
  const session = await getInvestorSession();
  if (!session) redirect("/investor-portal/login");
  const strings = getPortalStrings(session.reportingLanguage);
  const list = await getMyDistributions();

  // Real type-aggregated totals — drives the KPI strip + the waterfall.
  const totalMinor = list.reduce(
    (s, d) => s + BigInt(d.totalAmountUsdMinor),
    0n,
  );
  const capitalReturnMinor = list
    .filter((d) => d.distributionType === "capital_return")
    .reduce((s, d) => s + BigInt(d.totalAmountUsdMinor), 0n);
  const profitMinor = list
    .filter((d) => d.distributionType === "profit_distribution")
    .reduce((s, d) => s + BigInt(d.totalAmountUsdMinor), 0n);
  const mixedMinor = list
    .filter((d) => d.distributionType === "mixed")
    .reduce((s, d) => s + BigInt(d.totalAmountUsdMinor), 0n);

  const pct = (part: bigint) =>
    totalMinor > 0n ? `${Math.round((Number(part) / Number(totalMinor)) * 100)}%` : "—";

  const stages: WaterfallStage[] = [
    {
      label: "Distributed",
      amount: Number(totalMinor) / 100,
      tone: "ink",
      hint: `${list.length} distribution${list.length === 1 ? "" : "s"}`,
    },
    {
      label: "Capital return",
      amount: Number(capitalReturnMinor) / 100,
      tone: "emerald",
      hint: pct(capitalReturnMinor),
    },
    {
      label: "Profit",
      amount: Number(profitMinor) / 100,
      tone: "gold",
      hint: pct(profitMinor),
    },
  ];

  return (
    <PortalShell
      strings={strings}
      investorName={session.investorLegalName}
      investorCode={session.investorCode}
      pageTitle={strings.navDistributions}
    >
      <PortalPageHeader
        eyebrow="Distributions"
        title={strings.navDistributions}
        sub={`${list.length} distribution${list.length === 1 ? "" : "s"} where you received an allocation`}
      />

      {list.length === 0 ? (
        <PortalEmpty
          title="No distributions yet"
          body="When Arconique declares a distribution for a project you have a commitment in, it will appear here with the capital-return / profit split."
        />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <PortalKpi
              label="Distributed · total"
              value={formatUsdMinor(totalMinor)}
              hint="since inception"
            />
            <PortalKpi
              label="Capital return"
              value={formatUsdMinor(capitalReturnMinor)}
              hint={pct(capitalReturnMinor)}
            />
            <PortalKpi
              label="Profit distribution"
              value={formatUsdMinor(profitMinor)}
              hint={pct(profitMinor)}
            />
            <PortalKpi
              label="Mixed"
              value={formatUsdMinor(mixedMinor)}
              hint={pct(mixedMinor)}
            />
          </section>

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
            <PortalCard>
              <PortalSectionTitle
                title="Distribution split"
                action={
                  <Badge tone="neutral">
                    {list.length} declared
                  </Badge>
                }
              />
              <DistributionWaterfall
                stages={stages}
                variant="surface"
                currency="USD"
                height={200}
              />
            </PortalCard>

            <PortalTableCard title="History">
              <thead>
                <tr>
                  <PortalTh>#</PortalTh>
                  <PortalTh>{strings.project}</PortalTh>
                  <PortalTh>{strings.type}</PortalTh>
                  <PortalTh align="right">Amount</PortalTh>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft text-[13.5px] text-ink-2">
                {list.map((d) => (
                  <tr
                    key={d.id}
                    className="transition-colors hover:bg-bg-3"
                  >
                    <td className="px-4 py-3.5 font-mono text-xs font-semibold text-ink">
                      <Link
                        href={`/investor-portal/distributions/${d.id}`}
                        className="hover:underline"
                      >
                        #{d.distributionNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3.5">
                      {d.projectName ?? (
                        <span className="text-ink-4">Company-wide</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs">
                      {DISTRIBUTION_TYPE_LABEL[d.distributionType]}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-semibold tabular-nums text-ok">
                      {formatUsdMinor(BigInt(d.totalAmountUsdMinor))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </PortalTableCard>
          </div>

          <PortalCard className="mt-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <PortalSectionTitle title="Latest distribution" className="mb-1" />
              <p className="text-[13px] leading-relaxed text-ink-3">
                {list[0].projectName ?? "Company-wide"} ·{" "}
                {DISTRIBUTION_TYPE_LABEL[list[0].distributionType]} · effective{" "}
                {list[0].effectiveDate}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                tone={
                  list[0].status === "completed" ? "success" : "warning"
                }
              >
                {DISTRIBUTION_STATUS_LABEL[list[0].status]}
              </Badge>
              <span className="tnum font-display text-[24px] font-medium text-ink">
                {formatUsdMinor(BigInt(list[0].totalAmountUsdMinor))}
              </span>
            </div>
          </PortalCard>
        </>
      )}
    </PortalShell>
  );
}
