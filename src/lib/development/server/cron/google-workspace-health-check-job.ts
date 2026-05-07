import "server-only";

import { and, eq } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { oauthConnections } from "@/lib/db/schema/bulk-import";
import { probeGoogleConnection } from "@/lib/google-workspace/service";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 6.P5 — Google Workspace OAuth health-check cron.
 *
 * Hourly probe of every active `oauth_connections` row where
 * provider = 'google'. Each probe hits a cheap endpoint via the
 * appropriate service provider; on auth failure the row is marked
 * `is_active = false` and the operator surfaces the bad connection
 * on the connections page. Refresh happens automatically inside
 * the client when probing — no separate "refresh" cron needed.
 */
export async function runGoogleWorkspaceHealthCheck(
  _handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = requireDb();
  const rows = await db
    .select()
    .from(oauthConnections)
    .where(
      and(
        eq(oauthConnections.provider, "google"),
        eq(oauthConnections.isActive, true),
      ),
    );

  let probed = 0;
  let healthy = 0;
  let degraded = 0;
  for (const row of rows) {
    probed++;
    const result = await probeGoogleConnection({
      organizationId: row.organizationId,
      userId: row.userId,
    });
    if (result?.connected) {
      healthy++;
      await db
        .update(oauthConnections)
        .set({ lastUsedAt: new Date(), updatedAt: new Date() })
        .where(eq(oauthConnections.id, row.id));
    } else {
      degraded++;
      await db
        .update(oauthConnections)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(oauthConnections.id, row.id));
    }
  }

  return {
    status: "success",
    summary: `Probed ${probed} Google connection(s) — ${healthy} healthy, ${degraded} degraded.`,
    metrics: { probed, healthy, degraded },
  };
}
