import { DetailSkeleton } from "@/components/dashboard/detail-skeleton";

/**
 * Sibling loading boundary for the booking-detail page. Streams a
 * detail-shaped skeleton (header → tabs → main + right rail) while the
 * heavy server component awaits its data, so this page shows the *right*
 * silhouette instead of inheriting the cabinet/table skeleton from the
 * dashboard-root boundary. Pure perceived-perf — no data fetching.
 */
export default function BookingDetailLoading() {
  return <DetailSkeleton />;
}
