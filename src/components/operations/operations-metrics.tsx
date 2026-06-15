import { Kpi } from "@/components/dashboard/primitives";
import type { OperationsMetrics } from "@/features/operations/services";

function mapAccent(accent: boolean): "danger" | undefined {
  return accent ? "danger" : undefined;
}

export function OperationsMetricsGrid({ metrics }: { metrics: OperationsMetrics }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Kpi label="Open" value={String(metrics.open + metrics.inProgress)} sub="open + active" />
      <Kpi label="Due today" value={String(metrics.dueToday)} tone={mapAccent(metrics.dueToday > 0)} />
      <Kpi
        label="Urgent"
        value={String(metrics.urgent)}
        tone={mapAccent(metrics.urgent > 0)}
        sub={metrics.urgent > 0 ? "needs eyes" : undefined}
      />
      <Kpi label="Needs review" value={String(metrics.needsReview)} />
      <Kpi label="Housekeeping" value={String(metrics.housekeeping)} />
      <Kpi label="Maintenance" value={String(metrics.maintenance)} />
      <Kpi
        label="Maintenance tickets"
        value={String(metrics.pendingMaintenanceTickets)}
        sub="pending"
      />
      <Kpi
        label="Service requests"
        value={String(metrics.newServiceRequests)}
        sub="new"
      />
    </div>
  );
}
