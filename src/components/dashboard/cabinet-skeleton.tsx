import { Skeleton, SkeletonGroup } from "@/components/ui/state";

/**
 * CabinetSkeleton — generic loading placeholder for dashboard cabinets.
 *
 * Mirrors the shared cabinet rhythm (page-header chrome → KPI strip →
 * table card) so the Suspense fallback dissolves into real content without
 * a layout jump. Rendered by `(dashboard)/dashboard/loading.tsx`, so it
 * covers every cabinet that doesn't ship its own loading state.
 *
 * Composed from the Block-01 state-kit <Skeleton> atom, so every shimmer in
 * the app shares one rhythm + one token set.
 */
export function CabinetSkeleton() {
  return (
    <SkeletonGroup label="Loading cabinet">
      {/* page-header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <Skeleton tone="soft" className="h-3 w-40 mb-3" />
          <Skeleton className="h-8 w-64 max-w-[70%] mb-2.5" />
          <Skeleton tone="soft" className="h-3 w-[min(560px,90%)]" />
        </div>
        <div className="flex gap-2">
          <Skeleton tone="soft" circle className="h-8 w-28" />
          <Skeleton circle className="h-8 w-28" />
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-[18px] mb-[18px]">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="card p-4">
            <Skeleton tone="soft" className="h-2.5 w-20 mb-3" />
            <Skeleton className="h-6 w-16 mb-2" />
            <Skeleton tone="soft" className="h-2.5 w-24" />
          </div>
        ))}
      </div>

      {/* table card */}
      <div className="card p-0 overflow-hidden">
        <div className="h-10 bg-cream-warm border-b border-line-soft" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-4 py-3.5 border-b border-line-soft last:border-0"
          >
            <Skeleton tone="soft" className="h-3 flex-1" />
            <Skeleton tone="soft" className="h-3 w-28" />
            <Skeleton className="h-3 w-16" />
            <Skeleton tone="soft" circle className="h-5 w-16" />
          </div>
        ))}
      </div>
    </SkeletonGroup>
  );
}
