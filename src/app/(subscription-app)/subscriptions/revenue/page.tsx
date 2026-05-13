/**
 * Stage 10.6.E.2.3 — Revenue dashboard.
 *
 * MRR / ARR / customer count by tier / trial → paid conversion / churn.
 * Reads from existing orgSubscriptions + subscriptionPlans +
 * subscriptionLifecycleEvents tables.
 */

import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { DashboardKpi } from "@/components/ui/primitives";
import { ListTableCard } from "@/components/ui/primitives";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { getRevenueSnapshot } from "@/lib/subscription-os/queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Revenue · SubscriptionOS" };
export const dynamic = "force-dynamic";

function fmtMoney(minor: bigint, currency: string): string {
  const n = Number(minor) / 100;
  return `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 0 })}`;
}

export default async function RevenueDashboardPage() {
  const snap = await safeQuery(
    "subscription-os.revenue",
    getRevenueSnapshot(),
    {
      mrrMinor: 0n,
      arrMinor: 0n,
      customerCount: 0,
      activeCount: 0,
      trialCount: 0,
      cancelledLast30dCount: 0,
      trialToPaidLast30dCount: 0,
      perTier: [],
      currency: "USD",
    },
    4000,
  );

  // Conversion rate: trial → paid as % of (active + trial). Indicative
  // only — proper cohort analysis ships in a follow-up.
  const conversionDenom = snap.activeCount + snap.trialCount;
  const conversionPct =
    conversionDenom > 0
      ? (snap.trialToPaidLast30dCount / conversionDenom) * 100
      : 0;

  // Churn rate: cancellations in last 30d as % of (active + cancelled).
  // Indicative only — same caveat.
  const churnDenom = snap.activeCount + snap.cancelledLast30dCount;
  const churnPct =
    churnDenom > 0
      ? (snap.cancelledLast30dCount / churnDenom) * 100
      : 0;

  return (
    <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-10 flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "SubscriptionOS", href: "/subscriptions" },
          { label: "Revenue" },
        ]}
        eyebrow="Platform metrics"
        title="Revenue"
        description="MRR, ARR, customer count by tier, trial → paid conversion, churn. Read-only snapshot from orgSubscriptions + lifecycle events."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <DashboardKpi
          variant="hero"
          tone="emerald-soft"
          label="MRR"
          value={fmtMoney(snap.mrrMinor, snap.currency)}
          status="neutral"
          hint="Sum of monthly price across active subs"
          className="sm:col-span-2 lg:col-span-2"
        />
        <DashboardKpi
          label="ARR"
          value={fmtMoney(snap.arrMinor, snap.currency)}
          status="neutral"
          hint="MRR × 12"
        />
        <DashboardKpi
          label="Active customers"
          value={String(snap.activeCount)}
          status="neutral"
          hint={`${snap.trialCount} trial · ${snap.customerCount} total`}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <DashboardKpi
          label="Trial → paid (30d)"
          value={String(snap.trialToPaidLast30dCount)}
          status={snap.trialToPaidLast30dCount > 0 ? "good" : "neutral"}
          hint={`~${conversionPct.toFixed(1)}% conversion`}
        />
        <DashboardKpi
          label="Cancellations (30d)"
          value={String(snap.cancelledLast30dCount)}
          status={
            snap.cancelledLast30dCount === 0
              ? "good"
              : snap.cancelledLast30dCount > 5
                ? "bad"
                : "warn"
          }
          hint={`~${churnPct.toFixed(1)}% churn`}
        />
        <DashboardKpi
          label="Plans configured"
          value={String(snap.perTier.length)}
          status="neutral"
          hint="In subscriptionPlans table"
        />
      </div>

      <ListTableCard
        eyebrow="Per-tier breakdown"
        title="Customers + MRR by plan"
        count={snap.perTier.length}
      >
        <Table>
          <THead>
            <TR>
              <TH>Plan</TH>
              <TH>Plan code</TH>
              <TH className="text-right">Active</TH>
              <TH className="text-right">Trial</TH>
              <TH className="text-right">Monthly price</TH>
              <TH className="text-right">MRR contribution</TH>
            </TR>
          </THead>
          <TBody>
            {snap.perTier.length === 0 ? (
              <TR>
                <TD colSpan={6} className="text-ink-tertiary text-center py-10">
                  No plans configured yet.
                </TD>
              </TR>
            ) : (
              snap.perTier.map((t) => (
                <TR key={t.planCode}>
                  <TD className="text-ink font-medium">{t.planDisplayName}</TD>
                  <TD className="font-mono text-xs text-ink-tertiary">
                    {t.planCode}
                  </TD>
                  <TDNum>{t.activeCount}</TDNum>
                  <TDNum>{t.trialCount}</TDNum>
                  <TDNum>{fmtMoney(t.monthlyPriceMinor, snap.currency)}</TDNum>
                  <TDNum>{fmtMoney(t.mrrContributionMinor, snap.currency)}</TDNum>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </ListTableCard>
    </div>
  );
}
