import { notFound, redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { DigestDetailView } from "@/components/digests/digest-detail-view";
import { DevelopmentShell } from "@/components/development/development-shell";
import { requireDb, rowsOf } from "@/lib/db/client";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { getCurrentUserContext } from "@/features/auth/permissions";
import { getDigestByIdForCurrentUser } from "@/features/digests/queries";

export const metadata = { title: "Digest detail · Dev OS" };
export const dynamic = "force-dynamic";

export default async function DevDigestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getCurrentAppUser();
  if (!me) {
    redirect("/login?next=/development-os/agent-digests");
  }
  const { id } = await params;
  const digest = await getDigestByIdForCurrentUser(id);
  if (!digest) notFound();

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
    <DevelopmentShell>
      <DigestDetailView
        digest={digest}
        basePath="/development-os/agent-digests"
        isSuperAdmin={ctx.isSuperAdmin}
        platformAgentId={platformAgentId}
      />
    </DevelopmentShell>
  );
}
