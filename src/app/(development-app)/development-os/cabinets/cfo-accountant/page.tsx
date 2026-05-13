import type { Metadata } from "next";
import Link from "next/link";
import {
  CabinetGreetingBlock,
  DashboardKpi,
  NoItemsYet,
  PageHeaderHero,
  SparklineChart,
  type KpiStatus,
} from "@/components/ui/primitives";
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

/**
 * Stage 10.5.A.1.2 — CFO/Accountant cabinet (replatformed).
 *
 * Was: PageHeader + 3 sections of MetricCard grids (Stage 6 baseline).
 * Now: PageHeaderHero greeting + 4 status-coded DashboardKpi tiles
 * with trend deltas vs the previous snapshot + a 3-column body
 * (cashflow forecast, pending workload, AI insights) + a side
 * "Recent transactions" feed.
 *
 * Trend semantics:
 *   - Cash on hand: ↑ is good (status reflects threshold against
 *     payables_overdue).
 *   - Receivables: ↑ is amber (more outstanding); status follows the
 *     ratio against cash on hand.
 *   - Payables overdue: ↑ is bad.
 *   - Unclassified transactions (anomaly proxy): >0 is amber, >5 is
 *     bad. Carry-over: real anomaly detection lands in 10.5.B.
 */

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
    latestQsCostAnalystOutputCode: null,
    pendingTaxClassificationsCount: 0,
    invoicesAwaitingPaymentCount: 0,
  });

  const s = data.latestSnapshot;
  const prev = data.previousSnapshot;
  const c = s?.baseCurrency ?? "IDR";

  return (
    <DevelopmentShell>
      <div className="flex flex-col gap-10">
        <CabinetGreetingBlock
          firstName={firstName}
          eyebrow="CFO / Accountant · Cabinet"
          subline={
            s
              ? `${formatMinorAsCurrency(s.cashOnHandMinor, c)} on hand · ${data.invoicesAwaitingPaymentCount} invoice${data.invoicesAwaitingPaymentCount === 1 ? "" : "s"} awaiting payment`
              : "Daily snapshot pending — run the executive metrics cron to populate."
          }
          badge={
            s && s.unclassifiedTransactionsCount > 0 ? (
              <Badge tone="warning">
                {s.unclassifiedTransactionsCount} unclassified
              </Badge>
            ) : null
          }
        />

        <PageHeaderHero
          eyebrow="Today"
          title="Financial overview"
          description="Cash position, payables, and where attention is needed today."
        />

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

                <Section eyebrow="AI" title="Insights">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <AiInsightCard
                      label="Latest tax assistant"
                      code={data.latestTaxAssistantOutputCode}
                      hrefBase="/development-os/ai-agents/tax-assistant/outputs"
                    />
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
