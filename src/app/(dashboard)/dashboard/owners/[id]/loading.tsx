import { DetailSkeleton } from "@/components/dashboard/detail-skeleton";

/**
 * Sibling loading boundary for the owner-detail page. Streams a
 * detail-shaped skeleton (header → tabs → main + right rail) while the
 * server component awaits its data, so this page shows the *right*
 * silhouette instead of inheriting the cabinet/table skeleton from the
 * dashboard-root boundary. Pure perceived-perf — no data fetching.
 */
export default function OwnerDetailLoading() {
  return <DetailSkeleton />;
}
