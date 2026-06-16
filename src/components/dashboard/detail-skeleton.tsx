import { Skeleton, SkeletonGroup } from "@/components/ui/state";

/**
 * DetailSkeleton — generic loading placeholder for dashboard *detail* pages
 * (the `[id]` / `[slug]` segments behind a cabinet landing).
 *
 * Mirrors the shared detail rhythm — detail-header chrome (eyebrow → title →
 * subtitle + action cluster) → a tab strip → the main-and-side two-column
 * grid (a stack of content cards beside a 300px right rail) — so the Suspense
 * fallback dissolves into the real <DetailPage> without a layout jump.
 *
 * Unlike <CabinetSkeleton> (header → KPI strip → table), this matches the
 * detail-page silhouette, so a sibling `loading.tsx` at a `[id]` segment shows
 * the *right* shape instead of inheriting the cabinet/table skeleton from the
 * dashboard-root loading boundary.
 *
 * Composed purely from the Block-01 state-kit <Skeleton> atom (tokens only,
 * no hooks) so it is safe to render inside an RSC `loading.tsx` fallback.
 */
export function DetailSkeleton() {
  return (
    <SkeletonGroup label="Loading details">
      {/* detail-header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <Skeleton tone="soft" className="h-3 w-28 mb-3" />
          <Skeleton className="h-7 w-72 max-w-[70%] mb-2.5" />
          <Skeleton tone="soft" className="h-3 w-[min(480px,80%)]" />
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <Skeleton tone="soft" circle className="h-8 w-24" />
          <Skeleton tone="soft" circle className="h-8 w-28" />
          <Skeleton circle className="h-8 w-24" />
        </div>
      </div>

      {/* tab strip */}
      <div className="flex gap-5 border-b border-line-soft mt-[18px] mb-[18px]">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton
            key={i}
            tone={i === 0 ? "muted" : "soft"}
            className="h-3 w-20 mb-3"
          />
        ))}
      </div>

      {/* main-and-side */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
        {/* main column — a couple of content cards */}
        <div className="flex flex-col gap-4 min-w-0">
          <div className="card p-5">
            <Skeleton tone="soft" className="h-2.5 w-24 mb-4" />
            <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-x-3 gap-y-[10px]">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="contents">
                  <Skeleton tone="soft" className="h-3 w-28" />
                  <Skeleton tone="soft" className="h-3 w-full max-w-[220px]" />
                </div>
              ))}
            </div>
          </div>
          <div className="card p-5">
            <Skeleton tone="soft" className="h-2.5 w-28 mb-4" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 py-3 border-b border-line-soft last:border-0"
              >
                <Skeleton tone="soft" className="h-3 flex-1" />
                <Skeleton tone="soft" className="h-3 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        </div>

        {/* right rail */}
        <aside className="flex flex-col gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="card p-4">
              <Skeleton tone="soft" className="h-2.5 w-20 mb-3" />
              <Skeleton className="h-5 w-28 mb-2" />
              <Skeleton tone="soft" className="h-3 w-full mb-1.5" />
              <Skeleton tone="soft" className="h-3 w-2/3" />
            </div>
          ))}
        </aside>
      </div>
    </SkeletonGroup>
  );
}
