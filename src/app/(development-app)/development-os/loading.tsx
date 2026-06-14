import { CabinetSkeleton } from "@/components/dashboard/cabinet-skeleton";

/**
 * Segment-level streaming boundary for Development OS. The persistent shell
 * (sidebar/topbar) lives in the layout above this file and paints instantly
 * on navigation, while this shape-matched skeleton streams in place of the
 * page body until its server data resolves — turning a blank full-TTFB wait
 * into an immediate response. Covers /development-os/* (any route that
 * doesn't ship its own loading.tsx).
 */
export default function Loading() {
  return <CabinetSkeleton />;
}
