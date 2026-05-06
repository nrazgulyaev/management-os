import Link from "next/link";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { listMaintenanceRiskEvents } from "@/features/maintenance-intelligence/services";

/**
 * V9D — compact risk summary card. Drop-in for the operations dashboard.
 * Buckets open events into maintenance-side and utility-side and links
 * into the dedicated feeds.
 */
export async function RiskSummaryCard() {
  const open = await listMaintenanceRiskEvents({ status: "open", limit: 200 });
  const maint = open.filter((r) =>
    [
      "overdue_maintenance",
      "repeated_ticket",
      "upcoming_guest_conflict",
      "arrival_not_ready",
    ].includes(r.riskType),
  );
  const util = open.filter((r) =>
    [
      "utility_low_balance",
      "utility_critical_balance",
      "no_recent_reading",
    ].includes(r.riskType),
  );
  const critical = open.filter((r) => r.severity === "critical");

  return (
    <Section
      eyebrow="Risk feed"
      title="Operations risks"
      description="Open events from the unified scanner — overdue maintenance, utility balances, repeated tickets, arrival-not-ready, and upcoming guest/maintenance conflicts."
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Link
          href="/dashboard/maintenance-intelligence/risks"
          className="rounded-md border border-line-soft bg-surface p-5 hover:border-line-strong block"
        >
          <div className="flex items-center gap-2">
            <Badge tone={maint.length > 0 ? "warning" : "neutral"}>
              {maint.length} maintenance
            </Badge>
          </div>
          <div className="text-sm text-ink-secondary mt-2">
            Overdue plans, repeated tickets, arrival-not-ready, upcoming
            maintenance vs. guest conflicts.
          </div>
        </Link>
        <Link
          href="/dashboard/utilities/risks"
          className="rounded-md border border-line-soft bg-surface p-5 hover:border-line-strong block"
        >
          <div className="flex items-center gap-2">
            <Badge tone={util.length > 0 ? "warning" : "neutral"}>
              {util.length} utilities
            </Badge>
          </div>
          <div className="text-sm text-ink-secondary mt-2">
            Low / critical balance and stale readings across PLN, water,
            internet, gas, waste, security.
          </div>
        </Link>
        <div className="rounded-md border border-line-soft bg-surface p-5">
          <div className="flex items-center gap-2">
            <Badge tone={critical.length > 0 ? "danger" : "neutral"}>
              {critical.length} critical
            </Badge>
          </div>
          <div className="text-sm text-ink-secondary mt-2">
            Severity = critical. Includes accounts under the critical
            threshold.
          </div>
        </div>
      </div>
    </Section>
  );
}
