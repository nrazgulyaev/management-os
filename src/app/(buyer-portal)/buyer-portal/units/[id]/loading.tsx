import { DetailSkeleton } from "@/components/dashboard/detail-skeleton";

/**
 * Streaming boundary for the Buyer Portal unit detail — a heavy record
 * (unit spec, payment schedule, documents, reports). Streams the
 * detail-shaped skeleton instead of inheriting the portal-root cabinet
 * fallback.
 */
export default function Loading() {
  return <DetailSkeleton />;
}
