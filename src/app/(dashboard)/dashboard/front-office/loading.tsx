import { CabinetSkeleton } from "@/components/dashboard/cabinet-skeleton";

/**
 * Sibling loading boundary for the Front Office cabinet. Streams a
 * shape-matched cabinet skeleton (header → KPI strip → table) while the
 * server component awaits its data, instead of inheriting the generic
 * dashboard-root fallback from a further ancestor. Pure perceived-perf —
 * no data fetching.
 */
export default function FrontOfficeLoading() {
  return <CabinetSkeleton />;
}
