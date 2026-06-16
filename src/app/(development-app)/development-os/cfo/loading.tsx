import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";

/**
 * Streaming boundary for the Development OS CFO landing — a heavy capital /
 * cashflow / distributions overview. Streams a KPI-grid + widget-panel
 * skeleton instead of inheriting the table-shaped cabinet fallback.
 */
export default function Loading() {
  return <DashboardSkeleton />;
}
