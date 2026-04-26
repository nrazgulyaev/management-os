import { MetricCard } from "@/components/ui/metric-card";
import type { OperationsMetrics } from "@/features/operations/services";

export function OperationsMetricsGrid({ metrics }: { metrics: OperationsMetrics }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <MetricCard label="Open" value={String(metrics.open + metrics.inProgress)} hint="open + active" />
      <MetricCard label="Due today" value={String(metrics.dueToday)} accent={metrics.dueToday > 0} />
      <MetricCard
        label="Urgent"
        value={String(metrics.urgent)}
        accent={metrics.urgent > 0}
        hint={metrics.urgent > 0 ? "needs eyes" : undefined}
      />
      <MetricCard label="Needs review" value={String(metrics.needsReview)} />
      <MetricCard label="Housekeeping" value={String(metrics.housekeeping)} />
      <MetricCard label="Maintenance" value={String(metrics.maintenance)} />
      <MetricCard
        label="Maintenance tickets"
        value={String(metrics.pendingMaintenanceTickets)}
        hint="pending"
      />
      <MetricCard
        label="Service requests"
        value={String(metrics.newServiceRequests)}
        hint="new"
      />
    </div>
  );
}
