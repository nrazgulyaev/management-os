import { redirect } from "next/navigation";
import { SectionHeading, Card } from "@/components/dashboard/primitives";
import { getCurrentInvestorContext } from "@/features/investor-portal/investor-context";
import {
  getInvestorDashboard,
  getNavSeries,
  getInvestorDistributions,
  getInvestorQuarterNarrative,
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
  const [kpis, nav, dists, narrative] = await Promise.all([
    getInvestorDashboard(ctx.investorId).catch(() => null),
    getNavSeries(ctx.investorId).catch(() => []),
    getInvestorDistributions(ctx.investorId).catch(() => []),
    getInvestorQuarterNarrative(ctx.investorId).catch(() => null),
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
      <SectionHeading
        eyebrow="Investor portal · quarter brief"
        title="Quarter brief"
        subtitle={
          latestNav
            ? `Snapshot for the quarter ending ${latestNav.quarterEndDate}.`
            : "Quarter brief surfaces here once NAV snapshots are published."
        }
      />

      <Card style={{ padding: 20 }}>
        <div className="label">Headline</div>
        <h2 className="display" style={{ fontSize: 22, marginTop: 6, marginBottom: 14, fontWeight: 500 }}>
          Net asset value
        </h2>
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
      </Card>

      <section>
        <div className="label">Distributions</div>
        <h2 className="display" style={{ fontSize: 22, marginTop: 6, marginBottom: 14, fontWeight: 500 }}>
          YTD {fmtUsd(ytdDist)}
        </h2>
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
      </section>

      {narrative && narrative.notes.length > 0 && (
        <Card style={{ padding: 20 }}>
          <div className="label">Narrative</div>
          <h2
            className="display"
            style={{ fontSize: 22, marginTop: 6, marginBottom: 14, fontWeight: 500 }}
          >
            Quarter highlights
          </h2>
          <div className="text-sm text-ink-secondary leading-relaxed space-y-4">
            {narrative.notes.map((n, i) => (
              <div key={i}>
                {n.projectName && (
                  <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-tertiary mb-1">
                    {n.projectName}
                  </div>
                )}
                <p className="whitespace-pre-line">{n.note}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
