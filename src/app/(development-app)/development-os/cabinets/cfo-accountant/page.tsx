import type { Metadata } from "next";
import Link from "next/link";
import {
  DashboardKpi,
  NoItemsYet,
  SparklineChart,
  type KpiStatus,
} from "@/components/ui/primitives";
import {
  HatchedBarChart,
  HalfDonutGauge,
  HeroGreetingAI,
  type HatchedBarDatum,
} from "@/components/award";
import { synthSparklineSeries } from "@/lib/sparkline-series";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { DevelopmentShell } from "@/components/development/development-shell";
import {
  loadCfoCabinet,
  type CfoCabinetSnapshot,
} from "@/lib/development/server/cabinets/cfo-cabinet-queries";
import { safeQuery } from "@/lib/development/safe-query";
import {
  formatMinorAsCurrency,
  trendDeltaPct,
} from "@/lib/development/server/executive/widgets-helpers";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { redirect } from "next/navigation";
import { gateCabinetForCurrentOrg } from "@/lib/billing/cabinet-gating";
import {
  ArrowUpRight,
  ClipboardPaste,
  FilePlus2,
  Sparkles,
} from "lucide-react";

/**
 * Stage 10.5.A.1.2 — CFO/Accountant cabinet · Sprint 4 refresh.
 *
 * Stage 10.5.A shipped PageHeaderHero + 4 DashboardKpi tiles + a
 * 3-column body. Sprint 1 wired live sparklines into the hero KPIs.
 * Sprint 4 replaces the top two blocks with the new <HeroGreetingAI>
 * pattern (Reference 1 silhouette), adds a "Today's pulse" row
 * (HatchedBarChart of daily transaction counts + HalfDonutGauge for
 * review-queue burn), and surfaces quick-entry + import CTAs at the
 * top.
 *
 * Trend semantics for the existing snapshot KPIs (unchanged):
 *   - Cash on hand: ↑ is good (status reflects threshold against
 *     payables_overdue).
 *   - Receivables: ↑ is amber (more outstanding); status follows the
 *     ratio against cash on hand.
 *   - Payables overdue: ↑ is bad.
 *   - Unclassified transactions (anomaly proxy): >0 is amber, >5 is
 *     bad. Carry-over: real anomaly detection lands in 10.5.B.
 */

function todayLabel(now: Date): string {
  const day = now.getDate();
  const weekday = now.toLocaleDateString("en-US", { weekday: "short" });
  const month = now.toLocaleDateString("en-US", { month: "long" });
  return `${day} · ${weekday}, ${month}`;
}

/**
 * Sprint 4 — bucket recent transactions into daily counts for the
 * past 7 calendar days. Used by HatchedBarChart on the cabinet apex.
 * Days with at least one transaction render as solid; days with zero
 * render as hatched (track-only).
 */
function dailyCountsLast7Days(
  recent: { transactionDate: string }[],
  today: Date,
): HatchedBarDatum[] {
  const counts = new Map<string, number>();
  for (const t of recent) {
    counts.set(t.transactionDate, (counts.get(t.transactionDate) ?? 0) + 1);
  }
  const out: HatchedBarDatum[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const n = counts.get(iso) ?? 0;
    const label = d.toLocaleDateString("en-US", { weekday: "narrow" });
    out.push({
      label,
      value: Math.max(n, 1), // give zero-days a small placeholder height
      status: n > 0 ? "active" : "inactive",
      caption: n > 0 ? String(n) : undefined,
    });
  }
  return out;
}

export const metadata: Metadata = { title: "CFO / Accountant · Cabinet" };
export const dynamic = "force-dynamic";

function deltaFor(
  current: number,
  previous: CfoCabinetSnapshot | null,
  field: keyof CfoCabinetSnapshot,
): { value: number; label?: string } | undefined {
  if (!previous) return undefined;
  const prevVal = previous[field];
  if (typeof prevVal !== "number") return undefined;
  const v = trendDeltaPct(current, prevVal);
  if (!Number.isFinite(v)) return undefined;
  return { value: v, label: "vs prior period" };
}

function cashStatus(snap: CfoCabinetSnapshot): KpiStatus {
  if (snap.cashOnHandMinor <= snap.payablesOverdueMinor) return "bad";
  if (snap.cashOnHandMinor < snap.payablesNext30Minor) return "warn";
  return "good";
}

function payablesStatus(snap: CfoCabinetSnapshot): KpiStatus {
  if (snap.payablesOverdueMinor === 0) return "good";
  if (snap.payablesOverdueMinor < snap.cashOnHandMinor * 0.1) return "warn";
  return "bad";
}

function anomalyStatus(n: number): KpiStatus {
  if (n === 0) return "good";
  if (n <= 5) return "warn";
  return "bad";
}

export default async function CfoCabinetPage() {
  const __gateRedirect = await gateCabinetForCurrentOrg("cfo-accountant");
  if (__gateRedirect) redirect(__gateRedirect);

  const me = await getCurrentAppUser();
  const firstName = me?.fullName?.trim().split(/\s+/)[0] ?? null;

  const data = await safeQuery("cfoCabinet", loadCfoCabinet(), {
    latestSnapshot: null,
    previousSnapshot: null,
    recentTransactions: [],
    latestTaxAssistantOutputCode: null,
    recentTaxAssistantOutputs: [],
    latestQsCostAnalystOutputCode: null,
    pendingTaxClassificationsCount: 0,
    invoicesAwaitingPaymentCount: 0,
  });

  const s = data.latestSnapshot;
  const prev = data.previousSnapshot;
  const c = s?.baseCurrency ?? "IDR";
  const now = new Date();
  const dailyTxnCounts = dailyCountsLast7Days(
    data.recentTransactions,
    now,
  );
  const reviewQueueTotal =
    (s?.unclassifiedTransactionsCount ?? 0) +
    data.pendingTaxClassificationsCount +
    data.invoicesAwaitingPaymentCount;
  // The HalfDonutGauge surfaces "review queue burn" — the share of
  // pending items that have been worked through. We don't have a
  // historical "starting queue" stat yet, so we proxy it: solved =
  // total recent transactions - reviewQueueTotal (positive only).
  const txnsThisMonth = data.recentTransactions.length;
  const queueRatio =
    txnsThisMonth > 0
      ? Math.max(
          0,
          Math.min(1, (txnsThisMonth - reviewQueueTotal) / txnsThisMonth),
        )
      : 0;

  return (
    <DevelopmentShell>
      <div className="flex flex-col gap-8 md:gap-10">
        {/* Sprint 4 — HeroGreetingAI replaces the Stage 10.5.A
            CabinetGreetingBlock + PageHeaderHero stack. */}
        <HeroGreetingAI
          firstName={firstName}
          role="CFO / Accountant · Cabinet"
          dateLabel={todayLabel(now)}
          aiPromptPlaceholder="Ask anything — categorise, summarise, reconcile."
          showMyTasksHref="/development-os/finance/transactions/quick-entry"
        />

        {/* Sprint 4 — quick-action strip. Surfaces the new bookkeeper
            entry surfaces (quick-entry + import) + the AI assistant
            page directly under the hero so daily users don't dig. */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          {[
            {
              href: "/development-os/finance/transactions/quick-entry",
              icon: FilePlus2,
              label: "Sheets-style quick entry",
              caption: "Inline grid · Tab/Enter to fly through rows",
            },
            {
              href: "/development-os/finance/transactions/import",
              icon: ClipboardPaste,
              label: "Import transactions",
              caption: "Paste · CSV · XLSX",
            },
            {
              href: "/development-os/ai-agents/tax-assistant",
              icon: Sparkles,
              label: "AI Tax Assistant",
              caption: data.latestTaxAssistantOutputCode
                ? `Latest run: ${data.latestTaxAssistantOutputCode}`
                : "Categorise + classify in seconds",
            },
          ].map(({ href, icon: Icon, label, caption }) => (
            <Link
              key={href}
              href={href}
              className="rounded-3xl border border-line-soft bg-surface shadow-soft-card px-5 py-4 flex items-center gap-4 hover:bg-muted/40 transition-colors"
            >
              <span className="shrink-0 w-10 h-10 rounded-full bg-gradient-emerald-soft border border-line-soft inline-flex items-center justify-center">
                <Icon
                  className="w-4 h-4 text-ink"
                  strokeWidth={1.75}
                />
              </span>
              <span className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-medium text-ink truncate">
                  {label}
                </span>
                <span className="text-xs text-ink-tertiary truncate">
                  {caption}
                </span>
              </span>
              <ArrowUpRight
                className="w-4 h-4 text-ink-tertiary shrink-0"
                strokeWidth={1.75}
              />
            </Link>
          ))}
        </div>

        {!s ? (
          <NoItemsYet
            entityLabel="snapshots"
            description="The daily executive metrics cron will populate this. Run it manually from /development-os/jobs to seed."
          />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <DashboardKpi
                variant="hero"
                tone="ink-deep"
                label="Cash on hand"
                value={formatMinorAsCurrency(s.cashOnHandMinor, c)}
                status={cashStatus(s)}
                delta={deltaFor(s.cashOnHandMinor, prev, "cashOnHandMinor")}
                drillHref="/development-os/banking"
                hint={`vs ${formatMinorAsCurrency(s.payablesNext30Minor, c)} due 30d`}
                className="sm:col-span-2 lg:col-span-2"
                sparkline={
                  <SparklineChart
                    tone="emerald"
                    height={40}
                    data={synthSparklineSeries(
                      s.cashOnHandMinor,
                      deltaFor(s.cashOnHandMinor, prev, "cashOnHandMinor")
                        ?.value ?? 0,
                    )}
                  />
                }
              />
              <DashboardKpi
                label="Receivables"
                value={formatMinorAsCurrency(s.receivablesMinor, c)}
                status={
                  s.receivablesMinor === 0
                    ? "neutral"
                    : s.receivablesMinor > s.cashOnHandMinor
                      ? "warn"
                      : "good"
                }
                delta={deltaFor(s.receivablesMinor, prev, "receivablesMinor")}
                drillHref="/development-os/finance/invoices"
                sparkline={
                  <SparklineChart
                    tone="gold"
                    data={synthSparklineSeries(
                      s.receivablesMinor,
                      deltaFor(s.receivablesMinor, prev, "receivablesMinor")
                        ?.value ?? 0,
                    )}
                  />
                }
              />
              <DashboardKpi
                label="Payables overdue"
                value={formatMinorAsCurrency(s.payablesOverdueMinor, c)}
                status={payablesStatus(s)}
                delta={deltaFor(
                  s.payablesOverdueMinor,
                  prev,
                  "payablesOverdueMinor",
                )}
                drillHref="/development-os/finance/payables"
                sparkline={
                  <SparklineChart
                    tone="terracotta"
                    data={synthSparklineSeries(
                      s.payablesOverdueMinor,
                      deltaFor(
                        s.payablesOverdueMinor,
                        prev,
                        "payablesOverdueMinor",
                      )?.value ?? 0,
                    )}
                  />
                }
              />
              <DashboardKpi
                label="Anomalies (unclassified)"
                value={String(s.unclassifiedTransactionsCount)}
                status={anomalyStatus(s.unclassifiedTransactionsCount)}
                delta={deltaFor(
                  s.unclassifiedTransactionsCount,
                  prev,
                  "unclassifiedTransactionsCount",
                )}
                drillHref="/development-os/banking?status=unclassified"
                hint="Transactions awaiting classification"
                sparkline={
                  <SparklineChart
                    tone="sage"
                    data={synthSparklineSeries(
                      s.unclassifiedTransactionsCount,
                      deltaFor(
                        s.unclassifiedTransactionsCount,
                        prev,
                        "unclassifiedTransactionsCount",
                      )?.value ?? 0,
                    )}
                  />
                }
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 flex flex-col gap-6">
                <Section eyebrow="Cashflow" title="30 / 60 / 90 day forecast">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <DashboardKpi
                      label="In 30 days"
                      value={formatMinorAsCurrency(s.cashAt30Minor, c)}
                      status={s.cashAt30Minor < 0 ? "bad" : "neutral"}
                      delta={deltaFor(s.cashAt30Minor, prev, "cashAt30Minor")}
                      sparkline={
                        <SparklineChart
                          tone="emerald"
                          data={synthSparklineSeries(
                            s.cashAt30Minor,
                            deltaFor(s.cashAt30Minor, prev, "cashAt30Minor")
                              ?.value ?? 0,
                          )}
                        />
                      }
                    />
                    <DashboardKpi
                      label="In 60 days"
                      value={formatMinorAsCurrency(s.cashAt60Minor, c)}
                      status={s.cashAt60Minor < 0 ? "bad" : "neutral"}
                      delta={deltaFor(s.cashAt60Minor, prev, "cashAt60Minor")}
                      sparkline={
                        <SparklineChart
                          tone="emerald"
                          data={synthSparklineSeries(
                            s.cashAt60Minor,
                            deltaFor(s.cashAt60Minor, prev, "cashAt60Minor")
                              ?.value ?? 0,
                          )}
                        />
                      }
                    />
                    <DashboardKpi
                      label="In 90 days"
                      value={formatMinorAsCurrency(s.cashAt90Minor, c)}
                      status={s.cashAt90Minor < 0 ? "bad" : "neutral"}
                      delta={deltaFor(s.cashAt90Minor, prev, "cashAt90Minor")}
                      sparkline={
                        <SparklineChart
                          tone="emerald"
                          data={synthSparklineSeries(
                            s.cashAt90Minor,
                            deltaFor(s.cashAt90Minor, prev, "cashAt90Minor")
                              ?.value ?? 0,
                          )}
                        />
                      }
                    />
                  </div>
                </Section>

                <Section eyebrow="Workload" title="Bookkeeper inbox">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <DashboardKpi
                      label="Unclassified"
                      value={String(s.unclassifiedTransactionsCount)}
                      status={anomalyStatus(s.unclassifiedTransactionsCount)}
                      drillHref="/development-os/banking?status=unclassified"
                    />
                    <DashboardKpi
                      label="Pending tax classifications"
                      value={String(data.pendingTaxClassificationsCount)}
                      status={
                        data.pendingTaxClassificationsCount === 0
                          ? "good"
                          : "warn"
                      }
                      drillHref="/development-os/ai-agents/tax-assistant"
                    />
                    <DashboardKpi
                      label="Invoices awaiting payment"
                      value={String(data.invoicesAwaitingPaymentCount)}
                      status={
                        data.invoicesAwaitingPaymentCount === 0
                          ? "good"
                          : "neutral"
                      }
                      drillHref="/development-os/finance/invoices"
                    />
                  </div>
                </Section>

                <Section
                  eyebrow="AI"
                  title="Tax Assistant — recent runs"
                  description="Last three tax-classification suggestions. Click any one to review the agent's full output + apply or reject."
                  action={
                    <Link
                      href="/development-os/ai-agents/tax-assistant"
                      className="text-xs text-ink-tertiary hover:underline"
                    >
                      Open assistant →
                    </Link>
                  }
                >
                  {data.recentTaxAssistantOutputs.length === 0 ? (
                    <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 text-sm text-ink-tertiary">
                      No tax-assistant runs yet. Trigger the assistant
                      from a transaction or the cron will populate
                      this on next pass.
                    </div>
                  ) : (
                    <ul className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {data.recentTaxAssistantOutputs.map((out) => (
                        <li
                          key={out.outputCode}
                          className="rounded-3xl border border-line-soft bg-gradient-ink-deep text-ink-inverse shadow-soft-card p-5 flex flex-col gap-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-mono uppercase tracking-[0.16em] opacity-70">
                              {out.outputCode}
                            </span>
                            <Badge
                              tone={
                                out.status === "approved"
                                  ? "success"
                                  : out.status === "rejected"
                                    ? "danger"
                                    : "warning"
                              }
                            >
                              {out.status.replace(/_/g, " ")}
                            </Badge>
                          </div>
                          <h4 className="text-sm font-medium leading-tight">
                            {out.title}
                          </h4>
                          <p className="text-xs opacity-80 leading-relaxed line-clamp-3">
                            {out.summary}
                          </p>
                          <Link
                            href={`/development-os/ai-agents/tax-assistant/outputs/${out.outputCode}`}
                            className="mt-auto inline-flex items-center gap-1.5 self-start rounded-full bg-ink-inverse/15 hover:bg-ink-inverse/25 px-3 h-7 text-[11px] font-medium transition-colors"
                          >
                            Review
                            <ArrowUpRight
                              className="w-3 h-3"
                              strokeWidth={1.75}
                            />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <AiInsightCard
                      label="Latest QS cost analyst"
                      code={data.latestQsCostAnalystOutputCode}
                      hrefBase="/development-os/ai-agents/qs-cost-analyst/outputs"
                    />
                  </div>
                </Section>
              </div>

              <aside className="flex flex-col gap-4">
                <Section eyebrow="Activity" title="Recent transactions">
                  {data.recentTransactions.length === 0 ? (
                    <div className="rounded-md border border-line-soft bg-surface p-5 text-sm text-ink-secondary">
                      No transactions yet.
                    </div>
                  ) : (
                    <ul className="rounded-3xl border border-line-soft bg-surface divide-y divide-line-soft shadow-soft-card overflow-hidden">
                      {data.recentTransactions.map((t) => (
                        <li
                          key={t.id}
                          className="px-4 py-3 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-ink truncate">
                              {t.description}
                            </div>
                            <div className="text-xs text-ink-tertiary truncate">
                              {t.counterpartyName ?? "—"} ·{" "}
                              {t.transactionDate}
                            </div>
                          </div>
                          <div className="flex flex-col items-end shrink-0">
                            <span
                              className={
                                t.direction === "outflow"
                                  ? "text-sm font-mono tabular-nums text-danger"
                                  : "text-sm font-mono tabular-nums text-success"
                              }
                            >
                              {t.direction === "outflow" ? "−" : "+"}
                              {formatMinorAsCurrency(t.amountMinor, t.currency)}
                            </span>
                            <Badge
                              tone={
                                t.direction === "outflow"
                                  ? "warning"
                                  : t.direction === "inflow"
                                    ? "success"
                                    : "neutral"
                              }
                            >
                              {t.direction.replace("_", " ")}
                            </Badge>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-2 flex justify-end">
                    <Link
                      href="/development-os/banking"
                      className="text-xs text-ink-tertiary hover:underline"
                    >
                      Open banking →
                    </Link>
                  </div>
                </Section>
              </aside>
            </div>

            {/* Sprint 4 — Today's pulse: 7-day txn count + queue burn */}
            <Section
              eyebrow="Today's pulse"
              title="Bookkeeping cadence"
              description="Days with bookkeeping activity over the last 7 calendar days, and how much of this month's review queue you've cleared."
            >
              <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 md:gap-5">
                <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 md:p-6 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
                      Last 7 days
                    </span>
                    <span className="text-xs text-ink-tertiary tabular-nums">
                      {data.recentTransactions.length} recent transactions
                    </span>
                  </div>
                  <HatchedBarChart
                    data={dailyTxnCounts}
                    tone="emerald"
                    height={200}
                  />
                </div>
                <HalfDonutGauge
                  variant="gold"
                  value={Math.round(queueRatio * 100)}
                  max={100}
                  label={
                    <>
                      <p className="text-display text-[28px] md:text-[36px] leading-none font-medium text-ink tabular-nums">
                        {Math.round(queueRatio * 100)}%
                      </p>
                      <p className="text-xs text-ink-tertiary mt-1">
                        Review queue cleared
                      </p>
                    </>
                  }
                  legend={[
                    { label: `${reviewQueueTotal} pending` },
                    { label: `${txnsThisMonth} this period`, color: "var(--line-strong)" },
                  ]}
                />
              </div>
            </Section>
          </>
        )}
      </div>
    </DevelopmentShell>
  );
}

function AiInsightCard({
  label,
  code,
  hrefBase,
}: {
  label: string;
  code: string | null;
  hrefBase: string;
}) {
  return (
    <div className="rounded-2xl border border-line-soft bg-surface p-5 shadow-soft-card">
      <div className="text-label">{label}</div>
      {code ? (
        <Link
          href={`${hrefBase}/${code}`}
          className="text-sm text-info hover:underline"
        >
          {code} →
        </Link>
      ) : (
        <span className="text-sm text-ink-tertiary">No output yet</span>
      )}
    </div>
  );
}
