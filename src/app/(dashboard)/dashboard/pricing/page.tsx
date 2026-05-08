import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { MetricCard } from "@/components/ui/metric-card";
import { getPricingHubMetrics } from "@/features/dynamic-pricing/services";
import { safeList } from "@/features/system/db-health";
import { QueryWarningCard } from "@/components/system/query-warning-card";
import { trace } from "@/lib/observability/perf";

export const metadata = { title: "Dynamic pricing" };
export const dynamic = "force-dynamic";

const PAGE = "/dashboard/pricing";

export default async function PricingHub() {
  // 8.E.2 — trace the metrics call. 8.C audit observed >60s hangs and
  // safeList masks the failure mode; the perf log surfaces the actual
  // wall time in Vercel runtime logs so the slow path is identifiable.
  const metricsResult = await safeList("pricing.hub_metrics", async () => [
    await trace(PAGE, "getPricingHubMetrics", () => getPricingHubMetrics()),
  ]);
  const m =
    metricsResult.value[0] ??
    ({
      activeRuleSets: 0,
      pausedRuleSets: 0,
      publicQuotes24h: 0,
      stopSellNights: 0,
      simulatedPushes: 0,
      villasMissingRuleSet: 0,
    } as Awaited<ReturnType<typeof getPricingHubMetrics>>);
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[{ label: "Dynamic pricing" }]}
        title="Dynamic pricing"
        description="Rule-based nightly pricing layered above the legacy rate plans. Rule sets compose: villa > project > global, with priority breaking ties."
      />
      <QueryWarningCard result={metricsResult} tableName="pricing_rule_sets" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <MetricCard label="Active rule sets" value={String(m.activeRuleSets)} />
        <MetricCard label="Paused rule sets" value={String(m.pausedRuleSets)} accent={m.pausedRuleSets > 0} />
        <MetricCard label="Public quotes (24h)" value={String(m.publicQuotes24h)} />
        <MetricCard label="Stop-sell nights" value={String(m.stopSellNights)} accent={m.stopSellNights > 0} />
        <MetricCard label="Simulated channel pushes" value={String(m.simulatedPushes)} />
        <MetricCard
          label="Villas missing rule set"
          value={String(m.villasMissingRuleSet)}
          accent={m.villasMissingRuleSet > 0}
        />
      </div>
      <Section eyebrow="Surfaces" title="Where to go next">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <HubLink href="/dashboard/pricing/rule-sets" title="Rule sets" description="Configure scope, priority, base rate, and rule families." />
          <HubLink href="/dashboard/pricing/calendar" title="Calendar" description="Multi-villa nightly calendar with prices + availability." />
          <HubLink href="/dashboard/pricing/quote" title="Quote tester" description="Run a stay against a villa + channel; see admin explainer." />
          <HubLink href="/dashboard/pricing/logs" title="Quote logs" description="Public + admin quote observability." />
          <HubLink href="/dashboard/pricing/channel-push" title="Channel push" description="Simulate outbound rate / availability pushes." />
          <HubLink href="/dashboard/bookings/rates" title="Legacy rate plans" description="Rate plans + seasons + overrides — still supported." />
        </div>
      </Section>
    </div>
  );
}

function HubLink({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-md border border-line-soft bg-surface p-4 hover:border-line-strong"
    >
      <div className="text-sm text-ink font-medium">{title}</div>
      <div className="text-xs text-ink-tertiary mt-1">{description}</div>
    </Link>
  );
}
