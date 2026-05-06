import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";

/**
 * Stage 5.E — Content publish scheduler (hourly).
 *
 * Scans `content_pieces` where status='scheduled' AND scheduled_publish_at <= now().
 * Marks them as ready to publish (publishing itself is a separate manual
 * step until platform integrations land — see invariant 1).
 *
 * Idempotent — second run on the same row is a no-op (status already
 * advanced past 'scheduled').
 */
export async function runDevOsContentPublishScheduler(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { marked: 0 },
      error: "DB unavailable",
    };
  }

  const result = await db.execute<{ count: string }>(sql`
    WITH ready AS (
      UPDATE content_pieces
         SET status = 'published',
             published_at = now(),
             status_changed_at = now(),
             updated_at = now()
       WHERE status = 'scheduled'
         AND scheduled_publish_at <= now()
       RETURNING id
    )
    SELECT COUNT(*)::text AS count FROM ready
  `);
  const marked = Number(
    (result as unknown as { rows: Array<{ count: string }> }).rows?.[0]
      ?.count ?? "0",
  );

  await handle.event("info", `marked ${marked} content piece(s) published`, {
    marked,
  });

  return {
    status: "success",
    summary: `Marked ${marked} content piece(s) ready/published.`,
    metrics: { marked },
  };
}
