import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";

/**
 * Streaming boundary for the Owner Portal revenue page — a heavy earnings /
 * payout / occupancy rollup. Streams a KPI-grid + widget-panel skeleton
 * instead of inheriting the owner-root cabinet fallback.
 */
export default function Loading() {
  return <DashboardSkeleton />;
}
