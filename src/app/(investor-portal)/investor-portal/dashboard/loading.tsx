import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";

/**
 * Streaming boundary for the Investor Portal dashboard — a heavy capital /
 * distribution / forecast landing. Streams a KPI-grid + widget-panel
 * skeleton instead of inheriting the portal-root cabinet fallback.
 */
export default function Loading() {
  return <DashboardSkeleton />;
}
