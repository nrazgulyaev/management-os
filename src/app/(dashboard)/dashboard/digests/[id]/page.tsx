import { notFound, redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { DigestDetailView } from "@/components/digests/digest-detail-view";
import { requireDb, rowsOf } from "@/lib/db/client";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { getCurrentUserContext } from "@/features/auth/permissions";
import { getDigestByIdForCurrentUser } from "@/features/digests/queries";

export const metadata = { title: "Digest detail" };
export const dynamic = "force-dynamic";

export default async function MgmtDigestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getCurrentAppUser();
  if (!me) {
    redirect("/login?next=/dashboard/digests");
  }
  const { id } = await params;
  const digest = await getDigestByIdForCurrentUser(id);
  if (!digest) notFound();

  // Super_admin gets a deep link to the source run. Resolve the
  // platform_agent_id via agent_runs → relatedRunId, but only if
  // we actually need it (skip the lookup for regular users).
  const ctx = await getCurrentUserContext();
  let platformAgentId: string | null = null;
  if (ctx.isSuperAdmin && digest.relatedRunId) {
    const db = requireDb();
    const r = rowsOf<{ agent_id: string }>(
      await db.execute(sql`
        SELECT agent_id::text AS agent_id FROM agent_runs
         WHERE id = ${digest.relatedRunId}::uuid LIMIT 1
      `),
    )[0];
    platformAgentId = r?.agent_id ?? null;
  }

  return (
    <DigestDetailView
      digest={digest}
      basePath="/dashboard/digests"
      isSuperAdmin={ctx.isSuperAdmin}
      platformAgentId={platformAgentId}
    />
  );
}
