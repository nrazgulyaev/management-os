/**
 * Sprint 1 — AreaChartCard primitive (lazy wrapper).
 *
 * The "hero chart card" pattern from the doctor / logistics / crypto
 * reference dashboards: a gradient-toned rounded-3xl card with title,
 * optional period selector, and a softly-filled area chart. Optionally
 * surfaces a "pinned tooltip" capsule positioned at the series peak.
 *
 * Uses Stage 10.6.C.1 tokens:
 *   --gradient-emerald-soft / gold-soft / coral-soft / ink-deep
 *   --r-3xl, --shadow-soft-card
 *   --data-emerald / gold / sage / terracotta
 *
 * client-tax: the recharts render lives in `area-chart-card-impl.tsx` and
 * is loaded via `next/dynamic({ ssr:false })` so the recharts library no
 * longer ships eagerly to every page that mounts this card. A skeleton
 * card (same height) is shown while the chunk loads. The named-export API
 * is unchanged so call-sites keep working.
 */

"use client";

import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import type {
  AreaChartCardProps,
  AreaChartPoint,
  AreaChartTone,
  PinnedTooltipSpec,
} from "./area-chart-card-shared";

export type {
  AreaChartCardProps,
  AreaChartPoint,
  AreaChartTone,
  PinnedTooltipSpec,
};

/** Same-shape placeholder shown while the recharts chunk loads, so the
 *  layout doesn't jump. Sized to the default chart height (200). */
function AreaChartCardSkeleton() {
  return (
    <div
      className={cn(
        "rounded-3xl border border-line-soft shadow-soft-card p-6 md:p-7 flex flex-col gap-5 bg-surface",
      )}
      aria-hidden
    >
      <div className="h-6 w-40 rounded-md bg-line-soft/50 animate-pulse" />
      <div
        className="w-full rounded-2xl bg-line-soft/30 animate-pulse"
        style={{ height: 200 }}
      />
    </div>
  );
}

const AreaChartCardImpl = dynamic(
  () => import("./area-chart-card-impl").then((m) => m.AreaChartCardImpl),
  { ssr: false, loading: () => <AreaChartCardSkeleton /> },
);

export function AreaChartCard(props: AreaChartCardProps) {
  return <AreaChartCardImpl {...props} />;
}
