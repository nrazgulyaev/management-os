import { DetailSkeleton } from "@/components/dashboard/detail-skeleton";

/**
 * Streaming boundary for the Owner Portal statement detail — a heavy
 * fan-out record (lines, source groups, reconciliation warnings,
 * explanation snapshot, linked activity). Streams the detail-shaped
 * skeleton instead of inheriting the owner-root cabinet fallback.
 */
export default function Loading() {
  return <DetailSkeleton />;
}
