import { CabinetSkeleton } from "@/components/dashboard/cabinet-skeleton";

/**
 * Segment-root loading boundary for the whole dashboard. Next.js renders
 * this during navigation / RSC data-fetch for any cabinet that doesn't
 * declare its own `loading.tsx`, so every redesigned cabinet now shows a
 * shape-matched skeleton instead of a blank wait.
 */
export default function DashboardLoading() {
  return <CabinetSkeleton />;
}
