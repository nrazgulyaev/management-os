import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";

/**
 * Streaming boundary for the Buyer Portal dashboard — a heavy unit /
 * payment / report overview landing. Streams a KPI-grid + widget-panel
 * skeleton instead of inheriting the portal-root cabinet fallback.
 */
export default function Loading() {
  return <DashboardSkeleton />;
}
