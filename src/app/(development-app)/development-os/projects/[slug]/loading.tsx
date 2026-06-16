import { DetailSkeleton } from "@/components/dashboard/detail-skeleton";

/**
 * Streaming boundary for the Development OS project detail — the heaviest
 * detail page in the app (overview, milestones, budget, risks, RFIs and
 * more across a main-body + side-rail layout). Streams the detail-shaped
 * skeleton instead of inheriting the table-shaped cabinet fallback.
 */
export default function Loading() {
  return <DetailSkeleton />;
}
