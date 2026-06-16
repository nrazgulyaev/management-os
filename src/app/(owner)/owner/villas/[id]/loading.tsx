import { DetailSkeleton } from "@/components/dashboard/detail-skeleton";

/**
 * Streaming boundary for the Owner Portal villa detail — a heavy property
 * record (revenue, calendar, health, timeline across a main-body + rail
 * layout). Streams the detail-shaped skeleton instead of inheriting the
 * owner-root cabinet fallback.
 */
export default function Loading() {
  return <DetailSkeleton />;
}
