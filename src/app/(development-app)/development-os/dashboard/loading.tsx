import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";

/**
 * Streaming boundary for the Development OS executive dashboard — a heavy
 * KPI-widget landing (cash, payroll runway, project health, budget burn,
 * pipeline, investor capital, QA/QC). Streams a KPI-grid + widget-panel
 * skeleton instead of inheriting the table-shaped cabinet fallback.
 */
export default function Loading() {
  return <DashboardSkeleton />;
}
