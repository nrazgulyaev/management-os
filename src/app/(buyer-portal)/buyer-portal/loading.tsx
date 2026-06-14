import { CabinetSkeleton } from "@/components/dashboard/cabinet-skeleton";

/**
 * Segment-level streaming boundary for the Buyer Portal — streams a
 * shape-matched skeleton instead of a blank full-TTFB wait on navigation.
 * Covers /buyer-portal/* (any route without its own loading.tsx).
 */
export default function Loading() {
  return <CabinetSkeleton />;
}
