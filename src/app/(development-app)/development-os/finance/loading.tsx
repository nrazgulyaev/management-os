import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";

/**
 * Streaming boundary for the Development OS finance landing — a heavy
 * fan-out page (multiple parallel queries for balances, cashflow and
 * recent activity). Streams a KPI-grid + widget-panel skeleton.
 */
export default function Loading() {
  return <DashboardSkeleton />;
}
