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
import {
  AreaChartCard,
  DistributionWaterfall,
  InvestorHeroGreetingAI,
  type WaterfallStage,
} from "@/components/award";
import {
  loadForecastCashflow,
  type ForecastQuarterRow,
} from "@/lib/development/server/investor/forecast-cashflow-queries";
import { loadInvestorGpPosition } from "@/lib/investor-portal/gp-economics-queries";
import { buildLpGpEconomics } from "@/features/investors/lp-gp-economics";
import { InvestorCopilotPanel } from "@/components/investor-portal/investor-copilot-panel";
import { FundAnalyticsStrip } from "@/components/investor-portal/fund-analytics-strip";

/**
 * Mega-Sprint / Phase 12 — Investor Portal Dashboard on the Sprint-4
 * gold standard, investor-grade variant. Swaps the bespoke
 * MetricCard grid for the new <InvestorHeroGreetingAI> +
 * <DistributionWaterfall> primitives. The PortalShell stays — the
 * investor-portal lives in its own shell distinct from
 * DevelopmentShell, by design.
 *
 * Bilingual copy threads through the existing
 * `getPortalStrings(reportingLanguage)` system.
 *
 * feat/w1de-lp-dashboard-gp-waterfall-copilot adds two surfaces:
 *   1. A GP-economics <DistributionWaterfall> running the canonical
 *      European waterfall (return-of-capital → preferred return →
 *      catch-up → carry split) against this investor's real position.
 *   2. An <InvestorCopilotPanel> rendering the latest investor_copilot
 *      agent_outputs (empty-state until runs exist) — replacing the
 *      dead "Coming soon" hero badge with a real AI surface that the
 *      hero ask arrow now anchors to.
 */

export const metadata: Metadata = {
  title: "Dashboard · Arconique Investor Portal",
};
export const dynamic = "force-dynamic";

const INVESTOR_LOCALE: Record<string, string> = {
  en: "en-US",
  es: "es-ES",
  id: "id-ID",
  ru: "ru-RU",
  zh: "zh-CN",
};

function formatDateForInvestor(d: Date, language: string): string {
  const locale = INVESTOR_LOCALE[language] ?? "en-US";
  return d.toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function DashboardPage() {
  const session = await getInvestorSession();
  if (!session) redirect("/investor-portal/login");

  const strings = getPortalStrings(session.reportingLanguage);
  const [data, commitments, forecast, gpPosition] = await Promise.all([
    getInvestorDashboard(),
    getMyCommitments(),
    loadForecastCashflow(session.investorId, 4).catch(
      () => [] as ForecastQuarterRow[],
    ),
    loadInvestorGpPosition().catch(() => null),
  ]);

  const committed = Number(BigInt(data.totalCommittedUsdMinor)) / 100;
  const drawn = Number(BigInt(data.totalDrawnUsdMinor)) / 100;
  const distributed = Number(BigInt(data.totalDistributedUsdMinor)) / 100;
  const walletAvailable =
    Number(BigInt(data.totalWalletAvailableUsdMinor)) / 100;
  const walletHold = Number(BigInt(data.totalWalletHoldUsdMinor)) / 100;

  const stages: WaterfallStage[] = [
    {
      label: strings.dashTotalCommitted,
      amount: committed,
      tone: "ink",
      hint:
        data.commitmentCount > 0
          ? `${data.activeCommitmentCount}/${data.commitmentCount} active`
          : undefined,
    },
    {
      label: strings.dashTotalDrawn,
      amount: drawn,
      tone: "emerald",
      hint:
        committed > 0
          ? `${Math.round((drawn / committed) * 100)}% of commitment`
          : undefined,
    },
    {
      label: strings.dashTotalDistributed,
      amount: distributed,
      tone: "gold",
      hint:
        drawn > 0
          ? `${Math.round((distributed / drawn) * 100)}% of drawn`
          : undefined,
    },
    {
      label: strings.dashInWallet,
      amount: walletAvailable,
      tone: "sage",
      hint:
        walletHold > 0
          ? `+ ${formatUsdMinor(BigInt(data.totalWalletHoldUsdMinor))} on hold`
          : undefined,
    },
  ];

  // GP-economics distribution waterfall — runs the canonical European
  // waterfall (return-of-capital → preferred return → catch-up → carry)
  // against THIS investor's real position (drawn = contributed,
  // distributed = proceeds). Major-unit amounts; the chart formats them.
  const economics = gpPosition
    ? buildLpGpEconomics({
        contributedUsdMinor: gpPosition.contributedUsdMinor,
        distributedUsdMinor: gpPosition.distributedUsdMinor,
        profitSharePercent: gpPosition.profitSharePercent,
      })
    : null;
  const economicsTerms = economics?.termsUsed;

  return (
    <PortalShell
      strings={strings}
      investorName={session.investorLegalName}
      investorCode={session.investorCode}
      pageTitle={strings.navDashboard}
    >
      <div className="flex flex-col gap-8 md:gap-10">
        <InvestorHeroGreetingAI
          investorName={data.legalName}
          investorCode={session.investorCode}
          dateLabel={formatDateForInvestor(
            new Date(),
            session.reportingLanguage,
          )}
          greetingOverride={strings.welcomeBack(data.legalName)}
          subline={`${data.activeCommitmentCount}/${data.commitmentCount} active commitments · reporting in ${data.primaryCurrency}`}
          aiPromptPlaceholder="What changed in my position this quarter?"
          askHref="#investor-copilot"
        />

        <FundAnalyticsStrip currency={data.primaryCurrency} />

        <DistributionWaterfall
          stages={stages}
          variant="ink-deep"
          heading={
            <span className="text-display text-[18px] md:text-[20px] leading-tight font-medium text-ink-inverse">
              Capital flow
            </span>
          }
          currency={data.primaryCurrency}
        />

        {economics && !economics.isEmpty ? (
          <DistributionWaterfall
            stages={economics.stages}
            variant="surface"
            heading="Distribution waterfall"
            accessory={
              economicsTerms ? (
                <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-ink-tertiary">
                  {economicsTerms.prefReturnPct}% pref ·{" "}
                  {economicsTerms.carrySplitPct}% carry
                </span>
              ) : undefined
            }
            currency={data.primaryCurrency}
          />
        ) : (
          <section className="rounded-3xl border border-line-soft bg-surface shadow-soft-card overflow-hidden">
            <header className="flex items-center justify-between gap-3 px-5 md:px-6 py-4 border-b border-line-soft">
              <h3 className="text-display text-[18px] md:text-[20px] leading-tight font-medium text-ink">
                Distribution waterfall
              </h3>
              {economicsTerms && (
                <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-ink-tertiary">
                  {economicsTerms.prefReturnPct}% pref ·{" "}
                  {economicsTerms.carrySplitPct}% carry
                </span>
              )}
            </header>
            <p className="px-6 py-10 text-sm text-center text-ink-tertiary">
              No distributions to split yet. Once proceeds are distributed,
              this shows how they flow through return-of-capital, preferred
              return, GP catch-up and the carry split for your position.
            </p>
          </section>
        )}

        <div id="investor-copilot" className="scroll-mt-6">
          <InvestorCopilotPanel investorId={session.investorId} />
        </div>

        <AreaChartCard
          title="Forecast cashflow"
          period={`${forecast[0]?.quarter ?? ""}–${forecast[forecast.length - 1]?.quarter ?? ""}`}
          tone="ink"
          data={forecast.map((q) => ({
            date: q.quarter,
            value: q.cumulativeBalanceUsdMinor / 100,
          }))}
          formatSpec="number"
          valuePrefix={`${data.primaryCurrency} `}
          pinnedTooltip={
            forecast.length > 0
              ? {
                  value: `${data.primaryCurrency} ${(
                    forecast[forecast.length - 1].cumulativeBalanceUsdMinor /
                    100
                  ).toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
                  label: `Projected ${forecast[forecast.length - 1].quarter}`,
                }
              : undefined
          }
        />

        <section>
          <div className="label">Portfolio</div>
          <h2 className="display mb-1 mt-1.5 text-[22px] font-medium">
            {strings.dashActiveCommitments}
          </h2>
          <p className="mb-3.5 text-[13px] text-ink-3">
            Each card opens the commitment detail with capital-call history + distribution ledger.
          </p>
          {commitments.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-line-soft bg-surface px-6 py-10 text-center">
              <p className="text-sm font-medium text-ink-secondary">
                {strings.dashNoCommitments}
              </p>
              <p className="text-xs text-ink-tertiary mt-2 max-w-md mx-auto leading-relaxed">
                When Arconique creates a commitment under your account,
                it will appear here with capital-call progress +
                distribution history.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {commitments.map((c) => (
                <Link
                  key={c.id}
                  href={`/investor-portal/commitments/${c.id}`}
                  className="block rounded-[14px] border border-line bg-panel p-5 shadow-soft-card transition-all hover:border-line-strong hover:shadow-elevated-card"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-tertiary">
                      {c.commitmentCode}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] ${
                        c.status === "active"
                          ? "bg-amber/[0.13] text-amber-deep"
                          : c.status === "fully_called"
                            ? "bg-steel/[0.12] text-steel"
                            : "bg-muted text-ink-secondary"
                      }`}
                    >
                      {COMMITMENT_STATUS_LABEL[c.status]}
                    </span>
                  </div>
                  <div className="font-display text-base font-medium tracking-[-0.01em] text-ink">
                    {c.projectName ?? "Multi-project"}
                  </div>
                  <div className="text-xs text-ink-tertiary mt-1 tabular-nums">
                    {formatUsdMinor(BigInt(c.committedAmountUsdMinor))}{" "}
                    committed · {c.drawnPercent.toFixed(1)}% drawn
                  </div>
                  <div className="mt-3 h-[7px] overflow-hidden rounded-[4px] bg-line-soft">
                    <div
                      className="h-full rounded-[4px] bg-amber"
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
      </div>
    </PortalShell>
  );
}
