import { DetailSkeleton } from "@/components/dashboard/detail-skeleton";

/**
 * Streaming boundary for the Development OS investor detail — a heavy
 * capital-account + commitments + distributions record. Streams the
 * detail-shaped skeleton instead of inheriting the cabinet fallback.
 */
export default function Loading() {
  return <DetailSkeleton />;
}
