import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { SectionHeading, Card } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { PortalBadge } from "@/components/investor-portal/portal-primitives";
import { getCurrentInvestorContext } from "@/features/investor-portal/investor-context";
import { mapPoolAll } from "@/lib/db/map-pool";
import {
  getInvestorDashboard,
  getCapitalLedger,
  getYourInterest,
  getNavSeries,
  getInvestorDistributions,
  getConstructionProgress,
} from "@/features/investor-portal/investor-portal-queries";

export const metadata = { title: "Investor portal" };
export const dynamic = "force-dynamic";

function fmtUsd(minor: bigint): string {
  const v = Number(minor) / 100;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${Math.round(v)}`;
}

const EVENT_TONE: Record<string, "success" | "info" | "gold"> = {
  commitment: "info",
  drawdown: "gold",
  distribution: "success",
};

export default async function InvestorPortalHomePage() {
  const ctx = await getCurrentInvestorContext();
  if (!ctx) redirect("/dashboard/investors");

  const [kpis, ledger, interest, nav, dists, construction] = await mapPoolAll([
    () => getInvestorDashboard(ctx.investorId).catch(() => null),
    () => getCapitalLedger(ctx.investorId, 10).catch(() => []),
    () => getYourInterest(ctx.investorId).catch(() => []),
    () => getNavSeries(ctx.investorId).catch(() => []),
    () => getInvestorDistributions(ctx.investorId).catch(() => []),
    () => getConstructionProgress(ctx.investorId).catch(() => []),
  ] as const, 4);

  const ytdDist = dists.reduce((s, d) => s + d.shareUsdMinor, 0n);
  const navMax = Math.max(0, ...nav.map((p) => Number(p.totalNavUsdMinor)));
  const navLast = nav[nav.length - 1]?.totalNavUsdMinor ?? 0n;
  const navPrev = nav.length >= 2 ? nav[nav.length - 2].totalNavUsdMinor : navLast;
  const navGrowthPct =
    Number(navPrev) > 0 ? ((Number(navLast) - Number(navPrev)) / Number(navPrev)) * 100 : 0;
  const insight =
    nav.length >= 2 && Number(navLast) > Number(navPrev)
      ? `Latest quarter NAV grew ${navGrowthPct.toFixed(1)}% across your portfolio.`
      : nav.length >= 2
        ? `Latest quarter NAV was flat-to-down across your portfolio.`
        : `Your portfolio is established. NAV snapshots begin populating next quarter.`;

  return (
    <div className="flex flex-col gap-10">
      <SectionHeading
        eyebrow={`${kpis?.projectsCount ?? 0} projects · ${kpis?.averageProfitSharePct.toFixed(1) ?? "—"}% avg profit share`}
        title={`Welcome back, ${ctx.investorName.split(" ")[0]}.`}
        subtitle={insight}
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/investor-portal/q4-brief">
              Read full Q-brief
              <ArrowUpRight className="w-4 h-4" strokeWidth={1.75} />
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          label="Total committed"
          value={kpis && kpis.totalCommittedUsdMinor > 0n ? fmtUsd(kpis.totalCommittedUsdMinor) : "—"}
          sub={`${kpis?.projectsCount ?? 0} projects`}
        />
        <Kpi
          label="Total drawn"
          value={kpis && kpis.totalDrawnUsdMinor > 0n ? fmtUsd(kpis.totalDrawnUsdMinor) : "—"}
          sub="capital deployed"
        />
        <Kpi
          label="Total distributed"
          value={kpis && kpis.totalDistributedUsdMinor > 0n ? fmtUsd(kpis.totalDistributedUsdMinor) : "—"}
          sub="lifetime"
        />
        <Kpi
          label="Current NAV share"
          value={kpis && kpis.currentNavExposureUsdMinor > 0n ? fmtUsd(kpis.currentNavExposureUsdMinor) : "—"}
          sub="latest quarter"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6">
        <Card style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            <div>
              <div className="label">Capital ledger</div>
              <h2 className="display" style={{ fontSize: 22, marginTop: 6, marginBottom: 0, fontWeight: 500 }}>
                Recent activity
              </h2>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/investor-portal/capital">Full ledger →</Link>
            </Button>
          </div>
          {ledger.length === 0 ? (
            <p className="text-sm text-ink-tertiary italic">No capital events recorded yet.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {ledger.map((e) => (
                <li key={`${e.eventType}-${e.id}`} className="py-3 flex items-center gap-4">
                  <PortalBadge tone={EVENT_TONE[e.eventType]}>{e.eventType}</PortalBadge>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-ink truncate">{e.narrative}</div>
                    <div className="text-[11px] text-ink-tertiary">
                      {e.projectName ?? "—"} · {e.date}
                    </div>
                  </div>
                  <div
                    className="text-sm font-mono tabular-nums whitespace-nowrap"
                    style={{ color: e.eventType === "distribution" ? "var(--ok)" : "var(--ink)" }}
                  >
                    {fmtUsd(e.amountUsdMinor)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <div className="rounded-md border border-line-soft bg-surface p-5">
            <div className="text-[10px] uppercase tracking-widest text-ink-tertiary mb-2">
              NAV · last 6 quarters
            </div>
            {nav.length === 0 ? (
              <p className="text-xs text-ink-tertiary italic">No NAV snapshots yet.</p>
            ) : (
              <>
                <div className="text-display text-[22px] font-medium text-ink tabular-nums font-mono mb-2">
                  {fmtUsd(navLast)}
                </div>
                <div className="flex items-end gap-1 h-24">
                  {nav.map((p, i) => {
                    const h = navMax > 0 ? (Number(p.totalNavUsdMinor) / navMax) * 80 : 0;
                    return (
                      <div key={p.quarterEndDate} className="flex-1 flex flex-col items-center gap-1.5">
                        <div className="w-full flex items-end h-full justify-center">
                          <div
                            style={{
                              width: "100%",
                              height: `${Math.max(h, 2)}px`,
                              background: i === nav.length - 1 ? "var(--terra)" : "var(--forest)",
                              borderRadius: "2px 2px 0 0",
                            }}
                          />
                        </div>
                        <span className="text-[9px] text-ink-tertiary font-mono">{p.quarterLabel}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div className="rounded-md border border-line-soft bg-surface p-5">
            <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">
              Distributions YTD
            </div>
            <div className="text-display text-[22px] font-medium text-terra tabular-nums font-mono mt-2">
              {ytdDist > 0n ? fmtUsd(ytdDist) : "—"}
            </div>
            <div className="text-[11px] text-ink-tertiary mt-1">
              {dists.length} {dists.length === 1 ? "distribution" : "distributions"}
            </div>
            <Link
              href="/investor-portal/distributions"
              className="text-[11px] text-ink-secondary hover:text-terra mt-3 inline-block"
            >
              View distributions →
            </Link>
          </div>
        </div>
      </div>

      <section>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <div>
            <div className="label">Your interest</div>
            <h2 className="display" style={{ fontSize: 22, marginTop: 6, marginBottom: 0, fontWeight: 500 }}>
              Per-project breakdown
            </h2>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/investor-portal/construction">Construction →</Link>
          </Button>
        </div>
        {interest.length === 0 ? (
          <p className="text-sm text-ink-tertiary italic">No project commitments.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {interest.map((p) => (
              <div key={p.projectId} className="rounded-lg border border-line-soft bg-surface p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <PortalBadge tone="outline">{p.fundClass}</PortalBadge>
                  <span className="text-[10px] text-ink-tertiary tabular-nums">
                    {p.profitSharePct}% profit share
                  </span>
                </div>
                <div>
                  <h3 className="text-display text-[18px] leading-tight font-medium text-ink">{p.projectName}</h3>
                  <p className="text-xs text-ink-tertiary mt-0.5">{p.ownershipPct.toFixed(1)}% ownership</p>
                </div>
                <div className="grid grid-cols-3 gap-3 pt-3 border-t border-line-soft text-xs">
                  <Cell label="Committed" value={fmtUsd(p.committedUsdMinor)} />
                  <Cell label="Drawn" value={fmtUsd(p.drawnUsdMinor)} />
                  <Cell
                    label="NAV share"
                    value={p.currentNavShareUsdMinor > 0n ? fmtUsd(p.currentNavShareUsdMinor) : "—"}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <div>
            <div className="label">Construction</div>
            <h2 className="display" style={{ fontSize: 22, marginTop: 6, marginBottom: 0, fontWeight: 500 }}>
              Progress · your projects
            </h2>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/investor-portal/construction">Full view →</Link>
          </Button>
        </div>
        {construction.length === 0 ? (
          <p className="text-sm text-ink-tertiary italic">No construction activity yet.</p>
        ) : (
          <div className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
            {construction.map((c) => (
              <div key={c.projectId} className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink font-medium">{c.projectName}</div>
                  <div className="text-[11px] text-ink-tertiary mt-0.5">
                    {c.workPackagesCount} work packages · {c.siteReportsCount} reports ·{" "}
                    {c.qaInspectionsCount} QA issues
                  </div>
                </div>
                <div className="text-[11px] font-mono text-ink-tertiary text-right">
                  {c.latestReportDate ?? "—"}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-md border border-line-soft bg-surface p-4">
      <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">{label}</div>
      <div className="text-display text-[22px] leading-tight font-medium text-ink mt-2 font-mono tabular-nums">
        {value}
      </div>
      <div className="text-[11px] text-ink-tertiary mt-1">{sub}</div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-ink-tertiary">{label}</div>
      <div className="font-mono tabular-nums text-ink mt-0.5">{value}</div>
    </div>
  );
}
