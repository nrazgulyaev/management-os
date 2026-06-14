import { CabinetSkeleton } from "@/components/dashboard/cabinet-skeleton";

/**
 * Segment-level streaming boundary for the Owner Portal. The owner shell
 * paints instantly on navigation while this skeleton streams in place of the
 * page body — no blank full-TTFB wait. Covers /owner/* (any route without its
 * own loading.tsx).
 */
export default function Loading() {
  return <CabinetSkeleton />;
}
