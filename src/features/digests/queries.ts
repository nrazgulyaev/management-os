import "server-only";

/**
 * DAILY-DIGEST-SPRINT-1 P4.1 — read helpers for the new `notifications`
 * table (created in migration 0111).
 *
 * Lives in its own feature module (NOT inside src/features/notifications/)
 * because the two systems are intentionally parallel per the
 * (A)-modified scope:
 *
 *   · src/features/notifications/  — operational notifications backed by
 *     `in_app_notifications` + template/provider/queue infrastructure.
 *     Surfaces at /dashboard/notifications/inbox.
 *
 *   · src/features/digests/  (this file) — agent-generated daily digests
 *     backed by `notifications` (the new 0111 table). Surfaces at
 *     /dashboard/digests + /development-os/digests.
 *
 * `countUnreadDigestsForCurrentUser` is the union-friend referenced by
 * the existing `countUnreadForCurrentUser` so the topbar bell badge
 * reflects digest unreads too (additive read; no writer changes).
 *
 * DIGEST-INBOX-UNIFY-1 (backlog, post-launch) would reconcile these
 * into a single inbox.
 */

import { sql } from "drizzle-orm";
import { getDb, requireDb, rowsOf } from "@/lib/db/client";
import { getCurrentAppUser } from "@/features/auth/current-user";

export interface DigestRow {
  id: string;
  title: string;
  body: string;
  type: "digest" | "alert" | "info";
  relatedRunId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface DigestListRow {
  id: string;
  title: string;
  type: "digest" | "alert" | "info";
  bodyPreview: string;
  readAt: string | null;
  createdAt: string;
}

/**
 * Bell-badge addend. Counts notifications.read_at IS NULL for the
 * current user. Read-only; never throws (returns 0 on error).
 */
export async function countUnreadDigestsForCurrentUser(): Promise<number> {
  try {
    const me = await getCurrentAppUser();
    if (!me) return 0;
    const db = requireDb();
    const r = rowsOf<{ n: string }>(
      await db.execute(sql`
        SELECT COUNT(*)::text AS n FROM notifications
         WHERE user_id = ${me.id}::uuid
           AND read_at IS NULL
      `),
    )[0];
    return Number(r?.n ?? "0");
  } catch {
    return 0;
  }
}

/**
 * Digest list for the current user. Paginated by `limit/offset` with
 * an optional `unreadOnly` filter. Ordered by created_at DESC.
 *
 * Returns a 200-char body preview suitable for row rendering — the
 * detail page fetches the full body separately.
 */
export async function listDigestsForCurrentUser(input?: {
  limit?: number;
  offset?: number;
  unreadOnly?: boolean;
}): Promise<DigestListRow[]> {
  const me = await getCurrentAppUser();
  if (!me) return [];
  // Degrade gracefully when the DB is unreachable (sibling read paths do
  // the same) — render an empty feed rather than throwing into the error
  // boundary.
  const db = getDb();
  if (!db) return [];
  const limit = input?.limit ?? 20;
  const offset = input?.offset ?? 0;
  const unreadOnly = input?.unreadOnly ?? false;

  const rows = rowsOf<{
    id: string;
    title: string;
    type: string;
    body_preview: string;
    read_at: string | null;
    created_at: string;
  }>(
    await db.execute(sql`
      SELECT id::text                  AS id,
             title                      AS title,
             type                       AS type,
             substr(body, 1, 200)       AS body_preview,
             read_at::text              AS read_at,
             created_at::text           AS created_at
        FROM notifications
       WHERE user_id = ${me.id}::uuid
         ${unreadOnly ? sql`AND read_at IS NULL` : sql``}
       ORDER BY created_at DESC
       LIMIT ${limit}
       OFFSET ${offset}
    `),
  );

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    type: r.type as "digest" | "alert" | "info",
    bodyPreview: r.body_preview,
    readAt: r.read_at,
    createdAt: r.created_at,
  }));
}

/**
 * Compact list for the "Recent digests" dashboard tile — top N
 * notifications (any type) belonging to the current user.
 */
export async function listRecentDigestsForTile(limit = 3): Promise<DigestListRow[]> {
  return listDigestsForCurrentUser({ limit, offset: 0 });
}

/**
 * Full digest row for the detail page. Ownership-scoped: returns null
 * if the id doesn't belong to the current user (defense-in-depth on
 * top of RLS). Production reads see RLS catch this case too; the
 * extra check makes the local dev path (where RLS is sometimes
 * permissive) safe.
 */
export async function getDigestByIdForCurrentUser(
  id: string,
): Promise<DigestRow | null> {
  const me = await getCurrentAppUser();
  if (!me) return null;
  const db = requireDb();
  const rows = rowsOf<{
    id: string;
    title: string;
    body: string;
    type: string;
    related_run_id: string | null;
    read_at: string | null;
    created_at: string;
  }>(
    await db.execute(sql`
      SELECT id::text                  AS id,
             title                      AS title,
             body                       AS body,
             type                       AS type,
             related_run_id::text       AS related_run_id,
             read_at::text              AS read_at,
             created_at::text           AS created_at
        FROM notifications
       WHERE id = ${id}::uuid
         AND user_id = ${me.id}::uuid
       LIMIT 1
    `),
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    type: r.type as "digest" | "alert" | "info",
    relatedRunId: r.related_run_id,
    readAt: r.read_at,
    createdAt: r.created_at,
  };
}

export async function countDigestsForCurrentUser(input?: {
  unreadOnly?: boolean;
}): Promise<number> {
  const me = await getCurrentAppUser();
  if (!me) return 0;
  // Degrade gracefully when the DB is unreachable (matches the sibling
  // counters) so the digests page never error-boundaries instead of
  // rendering an empty feed.
  const db = getDb();
  if (!db) return 0;
  const r = rowsOf<{ n: string }>(
    await db.execute(sql`
      SELECT COUNT(*)::text AS n FROM notifications
       WHERE user_id = ${me.id}::uuid
         ${input?.unreadOnly ? sql`AND read_at IS NULL` : sql``}
    `),
  )[0];
  return Number(r?.n ?? "0");
}
