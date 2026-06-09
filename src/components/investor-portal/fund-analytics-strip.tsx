import * as React from "react";
import { ScrollText, PhoneCall, Banknote, Sparkles } from "lucide-react";
import { KpiRowMixed, type KpiItem } from "@/components/award";
import { loadLpFundAnalytics } from "@/lib/development/server/investor/fund-analytics-queries";
import { loadInvestorCopilotOutputs } from "@/lib/development/server/ai/investor-copilot-queries";
import { CANONICAL_FUND_TERMS } from "@/features/investors/lp-gp-economics";

/**
 * INVESTOR PORTAL — fund-level analytics headline strip.
 *
 * The LP-facing depth an Attio/Carta-style investor portal leads with:
 *
 *   1. A headline KPI row — Net IRR (hero), MOIC, DPI, TVPI — each
 *      captioned against the fund target (8% preferred return) and the
 *      realised-vs-total context. Derived from the LP's EXACT dated
 *      cashflows (capital calls out, distributions in, residual NAV)
 *      via the pure XIRR engine (no migration, no new table).
 *
 *   2. An LPA-rules + investor AI-agent insights strip. The three
 *      investor agents (quarterly-narrator / call-reminder / wire-
 *      reconciler) plus the investor-copilot exist in code; this strip
 *      reuses `loadInvestorCopilotOutputs` to show whether they've
 *      produced runs, and otherwise renders a clear coming-soon STATE
 *      per agent (self-explaining — never a dead disabled button).
 *
 * Server component, investor-session-scoped (the loaders both resolve
 * the investor from the auth session). Stone-theme-safe tokens only.
 */

function formatPct(fraction: number | null, opts?: { signed?: boolean }): string {
  if (fraction === null || !Number.isFinite(fraction)) return "—";
  const pct = fraction * 100;
  const sign = opts?.signed && pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function formatMultiple(x: number): string {
  if (!Number.isFinite(x)) return "—";
  return `${x.toFixed(2)}×`;
}

function compactUsdMinor(cents: bigint): string {
  const n = Number(cents) / 100;
  return `$${n.toLocaleString("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  })}`;
}

interface AgentDescriptor {
  key: string;
  label: string;
  blurb: string;
  icon: React.ReactNode;
  /** Agent-output codes (or prefixes) that count as "this agent ran". */
  match: (outputCode: string) => boolean;
}

const INVESTOR_AGENTS: AgentDescriptor[] = [
  {
    key: "quarterly-narrator",
    label: "Quarterly narrator",
    blurb: "Drafts your LP quarterly letter from site, sales and finance signals.",
    icon: <ScrollText className="w-4 h-4" strokeWidth={1.75} />,
    match: (c) => c.toLowerCase().includes("quarter") || c.toLowerCase().includes("narrat"),
  },
  {
    key: "call-reminder",
    label: "Call reminder",
    blurb: "Flags upcoming capital calls and wire deadlines before they're due.",
    icon: <PhoneCall className="w-4 h-4" strokeWidth={1.75} />,
    match: (c) => c.toLowerCase().includes("call") || c.toLowerCase().includes("remind"),
  },
  {
    key: "wire-reconciler",
    label: "Wire reconciler",
    blurb: "Matches inbound wires to drawdowns and surfaces unreconciled cash.",
    icon: <Banknote className="w-4 h-4" strokeWidth={1.75} />,
    match: (c) => c.toLowerCase().includes("wire") || c.toLowerCase().includes("reconcil"),
  },
];

export interface FundAnalyticsStripProps {
  /** Reporting currency code for captions (e.g. "USD"). */
  currency?: string;
}

export async function FundAnalyticsStrip({
  currency = "USD",
}: FundAnalyticsStripProps) {
  const [result, copilotOutputs] = await Promise.all([
    loadLpFundAnalytics().catch(() => null),
    loadInvestorCopilotOutputs({ limit: 12 }).catch(() => []),
  ]);

  const a = result?.analytics ?? null;

  // ---- Headline KPI row -------------------------------------------------
  let kpis: KpiItem[] = [];
  if (a && !a.isEmpty) {
    const target = CANONICAL_FUND_TERMS.prefReturnPct; // 8% pref hurdle
    kpis = [
      {
        label: "Net IRR",
        value: formatPct(a.netIrr),
        delta:
          a.vsTarget === null
            ? `Target ${target}% pref`
            : `${formatPct(a.vsTarget, { signed: true })} vs ${target}% target`,
        badge: a.vsTarget !== null && a.vsTarget >= 0 ? "On track" : undefined,
      },
      {
        label: "MOIC / TVPI",
        value: formatMultiple(a.tvpi),
        delta: `${compactUsdMinor(a.distributedMinor + a.residualNavMinor)} of value`,
        badge: a.residualNavMinor > 0n ? "incl. residual" : undefined,
      },
      {
        label: "DPI",
        value: formatMultiple(a.dpi),
        delta: `${compactUsdMinor(a.distributedMinor)} distributed`,
      },
      {
        label: "Paid-in capital",
        value: compactUsdMinor(a.contributedMinor),
        delta: `${result?.callCount ?? 0} call${(result?.callCount ?? 0) === 1 ? "" : "s"} · ${currency}`,
      },
    ];
  }

  // ---- Agent insight states --------------------------------------------
  const agentStates = INVESTOR_AGENTS.map((agent) => {
    const runs = copilotOutputs.filter((o) => agent.match(o.outputCode || ""));
    const latest = runs[0] ?? null;
    return { agent, hasRun: runs.length > 0, latest };
  });

  return (
    <section className="flex flex-col gap-5" data-stage10="fund-analytics-strip">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-ink-tertiary">
            Fund analytics
          </div>
          <h2 className="text-display text-[22px] md:text-[26px] leading-tight font-medium text-ink">
            Your position, by the numbers
          </h2>
        </div>
        {result?.computedAt && a && !a.isEmpty && (
          <span className="text-[11px] text-ink-tertiary tabular-nums">
            XIRR on {a.flowCount} dated cashflows
          </span>
        )}
      </header>

      {a && !a.isEmpty ? (
        <KpiRowMixed kpis={kpis} heroTone="ink-deep" />
      ) : (
        <div className="rounded-3xl border border-dashed border-line-soft bg-surface px-6 py-10 text-center">
          <p className="text-sm font-medium text-ink-secondary">
            No paid-in capital yet.
          </p>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-ink-tertiary">
            Once your first capital call settles, this headline shows your
            Net IRR, MOIC, DPI and TVPI — computed live from your dated
            calls and distributions.
          </p>
        </div>
      )}

      {/* LPA-rules + investor AI-agent insights strip */}
      <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 md:px-6 py-4 border-b border-line-soft">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-canvas border border-line-soft">
              <Sparkles className="w-4 h-4 text-ink-secondary" strokeWidth={1.75} />
            </span>
            <div className="flex flex-col">
              <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-ink-tertiary">
                Fund terms · AI agents
              </span>
              <h3 className="text-display text-[18px] md:text-[20px] leading-tight font-medium text-ink">
                LPA rules &amp; insights
              </h3>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center rounded-full border border-line-soft bg-muted px-2 py-0.5 text-[10px] font-medium tabular-nums text-ink-secondary">
              {CANONICAL_FUND_TERMS.mgmtFeePct}% mgmt
            </span>
            <span className="inline-flex items-center rounded-full border border-line-soft bg-muted px-2 py-0.5 text-[10px] font-medium tabular-nums text-ink-secondary">
              {CANONICAL_FUND_TERMS.prefReturnPct}% pref
            </span>
            <span className="inline-flex items-center rounded-full border border-line-soft bg-muted px-2 py-0.5 text-[10px] font-medium tabular-nums text-ink-secondary">
              {CANONICAL_FUND_TERMS.carrySplitPct}% carry
            </span>
          </div>
        </header>

        <ul className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-line-soft">
          {agentStates.map(({ agent, hasRun, latest }) => (
            <li key={agent.key} className="px-5 md:px-6 py-5 flex flex-col gap-2">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-canvas border border-line-soft text-ink-secondary">
                  {agent.icon}
                </span>
                <span className="text-sm font-medium text-ink">{agent.label}</span>
                <span
                  className={`ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                    hasRun
                      ? "bg-success-weak text-success"
                      : "border border-line-soft bg-muted text-ink-tertiary"
                  }`}
                >
                  {hasRun ? "Active" : "Coming soon"}
                </span>
              </div>
              {hasRun && latest ? (
                <>
                  <p className="text-sm font-medium text-ink leading-snug">
                    {latest.title}
                  </p>
                  {latest.summary && (
                    <p className="text-xs leading-relaxed text-ink-secondary line-clamp-3 whitespace-pre-line">
                      {latest.summary}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs leading-relaxed text-ink-tertiary">
                  {agent.blurb} It will post here automatically once it
                  begins producing runs for your account.
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
