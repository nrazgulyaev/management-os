import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";

/**
 * Streaming boundary for the Development OS executive overview — a heavy
 * fan-out KPI / digest landing. Streams a KPI-grid + widget-panel skeleton
 * instead of inheriting the table-shaped cabinet fallback.
 */
export default function Loading() {
  return <DashboardSkeleton />;
}
