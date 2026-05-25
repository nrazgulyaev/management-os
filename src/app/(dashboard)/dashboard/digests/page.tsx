import { redirect } from "next/navigation";
import { DigestListView } from "@/components/digests/digest-list-view";
import { getCurrentAppUser } from "@/features/auth/current-user";
import {
  countDigestsForCurrentUser,
  listDigestsForCurrentUser,
} from "@/features/digests/queries";

export const metadata = { title: "Daily digests" };
export const dynamic = "force-dynamic";

/**
 * DAILY-DIGEST-SPRINT-1 P4.2 — Mgmt OS digest list. Mirror at
 * /development-os/digests for Dev OS. Both pages render the same
 * user's notifications (digest type primary, but all types from
 * the new `notifications` table); the routes differ only in OS
 * shell context.
 */
export default async function MgmtDigestsListPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const me = await getCurrentAppUser();
  if (!me) {
    redirect("/login?next=/dashboard/digests");
  }
  const sp = await searchParams;
  const filter: "all" | "unread" = sp.filter === "unread" ? "unread" : "all";

  const [digests, totalCount, unreadCount] = await Promise.all([
    listDigestsForCurrentUser({
      limit: 50,
      unreadOnly: filter === "unread",
    }),
    countDigestsForCurrentUser(),
    countDigestsForCurrentUser({ unreadOnly: true }),
  ]);

  return (
    <DigestListView
      digests={digests}
      totalCount={totalCount}
      unreadCount={unreadCount}
      filter={filter}
      basePath="/dashboard/digests"
    />
  );
}
