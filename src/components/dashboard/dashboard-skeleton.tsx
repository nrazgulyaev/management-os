import { Skeleton, SkeletonGroup } from "@/components/ui/state";

/**
 * DashboardSkeleton — shape-matched loading placeholder for landing /
 * dashboard pages (page-header chrome → KPI card grid → two wide chart /
 * widget panels).
 *
 * Landings render a KPI grid plus chart/widget cards rather than a single
 * table, so this dissolves into real content with less layout shift than the
 * generic table-shaped CabinetSkeleton. Composed from the Block-01 state-kit
 * <Skeleton> atom, so every shimmer shares one rhythm + one token set.
 *
 * Server-safe (no hooks) — composes directly inside RSC `loading.tsx`.
 */
export function DashboardSkeleton() {
  return (
    <SkeletonGroup label="Loading dashboard">
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

      {/* KPI card grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mt-[18px] mb-[18px]">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="card p-4">
            <Skeleton tone="soft" className="h-2.5 w-24 mb-3" />
            <Skeleton className="h-7 w-20 mb-2" />
            <Skeleton tone="soft" className="h-2.5 w-16" />
          </div>
        ))}
      </div>

      {/* two wide widget / chart panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="card p-5">
            <Skeleton tone="soft" className="h-3 w-32 mb-4" />
            <Skeleton className="h-40 w-full mb-4" />
            <div className="flex gap-3">
              <Skeleton tone="soft" className="h-2.5 flex-1" />
              <Skeleton tone="soft" className="h-2.5 w-20" />
            </div>
          </div>
        ))}
      </div>
    </SkeletonGroup>
  );
}
