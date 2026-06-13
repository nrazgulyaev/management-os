import { CabinetSkeleton } from "@/components/dashboard/cabinet-skeleton";

/**
 * Segment-level streaming boundary for the Field app — streams a skeleton
 * instead of a blank full-TTFB wait on navigation. Covers /field/* (any route
 * without its own loading.tsx).
 */
export default function Loading() {
  return <CabinetSkeleton />;
}
