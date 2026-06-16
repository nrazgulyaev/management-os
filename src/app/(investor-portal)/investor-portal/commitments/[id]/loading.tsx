import { DetailSkeleton } from "@/components/dashboard/detail-skeleton";

/**
 * Streaming boundary for the Investor Portal commitment detail — a heavy
 * record (commitment terms, capital calls, wallet, distributions). Streams
 * the detail-shaped skeleton instead of inheriting the portal-root cabinet
 * fallback.
 */
export default function Loading() {
  return <DetailSkeleton />;
}
