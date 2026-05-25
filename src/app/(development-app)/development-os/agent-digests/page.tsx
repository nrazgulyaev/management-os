import { redirect } from "next/navigation";
import { DigestListView } from "@/components/digests/digest-list-view";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getCurrentAppUser } from "@/features/auth/current-user";
import {
  countDigestsForCurrentUser,
  listDigestsForCurrentUser,
} from "@/features/digests/queries";

export const metadata = { title: "Daily digests · Dev OS" };
export const dynamic = "force-dynamic";

/**
 * DAILY-DIGEST-SPRINT-1 P4.2 — Dev OS digest list.
 *
 * Route note: mounted at /development-os/agent-digests (not
 * /development-os/digests) because the latter is the existing
 * Executive Digests surface (human-curated reports). "agent-digests"
 * is intentionally specific to AI-generated daily reports; both
 * Mgmt OS and Dev OS render the same `notifications` rows for the
 * same user — the routes differ only in OS shell context.
 *
 * Asymmetric with Mgmt's `/dashboard/digests`; harmonization would
 * be part of the future DIGEST-INBOX-UNIFY-1 sprint.
 */
export default async function DevAgentDigestsListPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const me = await getCurrentAppUser();
  if (!me) {
    redirect("/login?next=/development-os/agent-digests");
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
    <DevelopmentShell>
      <DigestListView
        digests={digests}
        totalCount={totalCount}
        unreadCount={unreadCount}
        filter={filter}
        basePath="/development-os/agent-digests"
      />
    </DevelopmentShell>
  );
}
