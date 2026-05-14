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
  DistributionWaterfall,
  InvestorHeroGreetingAI,
  type WaterfallStage,
} from "@/components/award";
import { Section } from "@/components/ui/section";

/**
 * Mega-Sprint / Phase 12 — Investor Portal Dashboard on the Sprint-4
 * gold standard, investor-grade variant. Swaps the bespoke
 * MetricCard grid for the new <InvestorHeroGreetingAI> +
 * <DistributionWaterfall> primitives. The PortalShell stays — the
 * investor-portal lives in its own shell distinct from
 * DevelopmentShell, by design.
 *
 * Bilingual copy threads through the existing
 * `getPortalStrings(reportingLanguage)` system. The
 * investor-copilot agent is not yet shipped; the hero AI input
 * renders a "Coming soon" badge per the operator decision lock
 * ("no new agents this sprint").
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
  const [data, commitments] = await Promise.all([
    getInvestorDashboard(),
    getMyCommitments(),
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

  return (
    <PortalShell
      strings={strings}
      investorName={session.investorLegalName}
      investorCode={session.investorCode}
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
        />

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

        <Section
          eyebrow="Portfolio"
          title={strings.dashActiveCommitments}
          description="Each card opens the commitment detail with capital-call history + distribution ledger."
        >
          {commitments.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center">
              <p className="text-sm font-medium text-stone-700">
                {strings.dashNoCommitments}
              </p>
              <p className="text-xs text-stone-500 mt-2 max-w-md mx-auto leading-relaxed">
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
                  className="block rounded-2xl border border-line-soft bg-surface p-5 shadow-soft-card hover:shadow-elevated-card hover:border-line-strong transition-all"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-tertiary">
                      {c.commitmentCode}
                    </span>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full ${
                        c.status === "active"
                          ? "bg-success-weak text-success"
                          : c.status === "fully_called"
                            ? "bg-info-weak text-info"
                            : "bg-muted text-ink-secondary"
                      }`}
                    >
                      {COMMITMENT_STATUS_LABEL[c.status]}
                    </span>
                  </div>
                  <div className="font-medium text-ink text-base">
                    {c.projectName ?? "Multi-project"}
                  </div>
                  <div className="text-xs text-ink-tertiary mt-1 tabular-nums">
                    {formatUsdMinor(BigInt(c.committedAmountUsdMinor))}{" "}
                    committed · {c.drawnPercent.toFixed(1)}% drawn
                  </div>
                  <div className="mt-3 h-1 bg-canvas rounded-full overflow-hidden">
                    <div
                      className="h-full bg-ink"
                      style={{
                        width: `${Math.min(100, c.drawnPercent)}%`,
                      }}
                    />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Section>
      </div>
    </PortalShell>
  );
}
