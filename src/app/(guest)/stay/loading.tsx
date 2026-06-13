import { CabinetSkeleton } from "@/components/dashboard/cabinet-skeleton";

/**
 * Segment-level streaming boundary for the Guest Stay portal — streams a
 * skeleton instead of a blank full-TTFB wait on navigation. Covers /stay/*
 * (any route without its own loading.tsx).
 */
export default function Loading() {
  return <CabinetSkeleton />;
}
