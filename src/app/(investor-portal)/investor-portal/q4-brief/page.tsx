import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { getCurrentInvestorContext } from "@/features/investor-portal/investor-context";
import {
  getInvestorDashboard,
  getNavSeries,
  getInvestorDistributions,
} from "@/features/investor-portal/investor-portal-queries";

export const metadata = { title: "Quarter brief" };
export const dynamic = "force-dynamic";

function fmtUsd(minor: bigint): string {
  const v = Number(minor) / 100;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${Math.round(v)}`;
}

export default async function QuarterBriefPage() {
  const ctx = await getCurrentInvestorContext();
  if (!ctx) redirect("/dashboard/investors");
  const [kpis, nav, dists] = await Promise.all([
    getInvestorDashboard(ctx.investorId).catch(() => null),
    getNavSeries(ctx.investorId).catch(() => []),
    getInvestorDistributions(ctx.investorId).catch(() => []),
  ]);
  const latestNav = nav[nav.length - 1];
  const prevNav = nav.length >= 2 ? nav[nav.length - 2] : null;
  const growthPct =
    prevNav && Number(prevNav.totalNavUsdMinor) > 0
      ? ((Number(latestNav?.totalNavUsdMinor ?? 0n) - Number(prevNav.totalNavUsdMinor)) /
          Number(prevNav.totalNavUsdMinor)) *
        100
      : 0;
  const ytdDist = dists.reduce((s, d) => s + d.shareUsdMinor, 0n);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Investor portal", href: "/investor-portal" },
          { label: "Quarter brief" },
        ]}
        title="Quarter brief"
        description={
          latestNav
            ? `Snapshot for the quarter ending ${latestNav.quarterEndDate}.`
            : "Quarter brief surfaces here once NAV snapshots are published."
        }
      />

      <Section eyebrow="Headline" title="Net asset value" variant="panel">
        {latestNav ? (
          <div className="flex flex-col gap-3">
            <div className="text-display text-[36px] font-medium text-ink tabular-nums font-mono">
              {fmtUsd(latestNav.totalNavUsdMinor)}
            </div>
            <div className="text-sm text-ink-secondary">
              Your share of NAV across {kpis?.projectsCount ?? 0} projects, weighted by
              commitment.
              {prevNav && (
                <>
                  {" "}
                  {growthPct >= 0 ? "Up" : "Down"}{" "}
                  <span className="font-mono">{Math.abs(growthPct).toFixed(1)}%</span>{" "}
                  quarter-over-quarter.
                </>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink-tertiary italic">No NAV snapshots yet.</p>
        )}
      </Section>

      <Section eyebrow="Distributions" title={`YTD ${fmtUsd(ytdDist)}`}>
        {dists.length === 0 ? (
          <p className="text-sm text-ink-tertiary italic">No distributions yet.</p>
        ) : (
          <ul className="divide-y divide-line-soft rounded-md border border-line-soft bg-surface">
            {dists.map((d) => (
              <li key={d.distributionId} className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink font-medium">{d.projectName ?? "—"}</div>
                  <div className="text-[11px] text-ink-tertiary">
                    {d.distributionType.replace(/_/g, " ")} · {d.effectiveDate}
                  </div>
                </div>
                <div className="text-sm font-mono tabular-nums text-terra">
                  {fmtUsd(d.shareUsdMinor)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section eyebrow="Narrative" title="Quarter highlights" variant="panel">
        <div className="text-sm text-ink-secondary leading-relaxed space-y-3">
          <p>
            This brief is a placeholder narrative. The full quarterly authoring
            workflow — operator writes per-quarter highlights and publishes to
            investors — is coming soon. For now, your portal computes headline
            numbers directly from the capital ledger and NAV snapshots above.
          </p>
          <p>
            Construction milestone narrative, AI-generated portfolio commentary, and
            comparative benchmarks will be added in upcoming releases.
          </p>
        </div>
      </Section>
    </div>
  );
}
