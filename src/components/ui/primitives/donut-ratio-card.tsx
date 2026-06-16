/**
 * Sprint 1 — DonutRatioCard primitive (lazy wrapper).
 *
 * Pattern lifted from the doctor / candidate / health dashboards: a
 * gradient-toned card with a single-segment donut showing a ratio
 * (numerator/denominator) plus the big number, optional change pill,
 * and an accessory slot.
 *
 * Single segment by design — the "story" is the proportion, not a
 * categorical split. For multi-category splits a future
 * `<DonutCategoryCard>` would carry the legend logic.
 *
 * client-tax: the recharts render lives in `donut-ratio-card-impl.tsx`
 * and is loaded via `next/dynamic({ ssr:false })` so recharts no longer
 * ships eagerly. A same-shape skeleton card is shown while the chunk
 * loads. The named-export API is unchanged so call-sites keep working.
 */

"use client";

import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import type {
  DonutRatioCardProps,
  DonutTone,
} from "./donut-ratio-card-shared";

export type { DonutRatioCardProps, DonutTone };

/** Same-shape placeholder shown while the recharts chunk loads. */
function DonutRatioCardSkeleton() {
  return (
    <div
      className={cn(
        "rounded-3xl border border-line-soft shadow-soft-card p-6 md:p-7 flex flex-col gap-5 bg-surface",
      )}
      aria-hidden
    >
      <div className="h-5 w-32 rounded-md bg-line-soft/50 animate-pulse" />
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="h-12 w-28 rounded-md bg-line-soft/40 animate-pulse" />
          <div className="h-4 w-20 rounded-md bg-line-soft/30 animate-pulse" />
        </div>
        <div className="w-[120px] h-[120px] rounded-full bg-line-soft/30 animate-pulse" />
      </div>
    </div>
  );
}

const DonutRatioCardImpl = dynamic(
  () => import("./donut-ratio-card-impl").then((m) => m.DonutRatioCardImpl),
  { ssr: false, loading: () => <DonutRatioCardSkeleton /> },
);

export function DonutRatioCard(props: DonutRatioCardProps) {
  return <DonutRatioCardImpl {...props} />;
}
