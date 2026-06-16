import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";

/**
 * Streaming boundary for the Development OS marketing dashboard — a heavy
 * fan-out attribution / pipeline / conversion landing. Streams a KPI-grid +
 * widget-panel skeleton instead of inheriting the cabinet fallback.
 */
export default function Loading() {
  return <DashboardSkeleton />;
}
