import { CabinetSkeleton } from "@/components/dashboard/cabinet-skeleton";

/**
 * Segment-level streaming boundary for the Platform console. The platform
 * shell paints instantly on navigation while this skeleton streams in place
 * of the page body — no blank full-TTFB wait. Covers /platform/* (any route
 * without its own loading.tsx).
 */
export default function Loading() {
  return <CabinetSkeleton />;
}
