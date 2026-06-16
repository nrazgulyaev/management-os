import { DetailSkeleton } from "@/components/dashboard/detail-skeleton";

/**
 * Streaming boundary for the Investor Portal capital-call detail — a heavy
 * record (call schedule, allocation, payment status). Streams the
 * detail-shaped skeleton instead of inheriting the portal-root cabinet
 * fallback.
 */
export default function Loading() {
  return <DetailSkeleton />;
}
