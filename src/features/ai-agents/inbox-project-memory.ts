import "server-only";

/**
 * AI FOLLOW-ON (b) — project-memory retrieval for the unified-inbox drafter.
 *
 * This is NOT a "use server" module (so it may export sync helpers + types).
 * `inbox-draft-actions.ts` is the "use server" boundary and imports from here.
 *
 * When the `inbox` agent's `project_memory` knowledge source is ON, the
 * drafter previously only appended a guardrail NOTE ("known property/project
 * facts already established with this contact") without ever fetching a
 * single fact — a no-op. This module makes the toggle do real work: it
 * retrieves relevant rows from `ai_project_memory` (the org-scoped general
 * fact store) and formats them as a compact, quotable block the drafter can
 * ground its reply in.
 *
 * Relevance, honestly: there is no embedding pipeline wired for this store
 * yet (`embedding_vector` is an unused text column), so retrieval is a
 * recency- + access-ranked filter rather than vector search. We narrow to:
 *   · the caller's org (tenancy), AND
 *   · active + un-expired rows, AND
 *   · rows scoped to THIS contact (scope_type='contact', scope_id=contactId)
 *     OR org-wide rows (no contact scope) — so contact-specific facts win
 *     but workspace-level facts still inform the reply.
 *
 * When the store has no matching rows (it is empty until the platform starts
 * writing contact/property facts), `retrieveInboxProjectMemory` returns an
 * empty list and the caller falls back to its existing guardrail note — no
 * fabricated facts, ever.
 */

import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { aiProjectMemory } from "@/lib/db/schema/ai";

export interface InboxMemoryFact {
  id: string;
  memoryType: string;
  content: string;
}

/**
 * Fetch up to `limit` relevant project-memory facts for an inbox draft.
 * Returns [] when the DB is unavailable or no facts match.
 */
export async function retrieveInboxProjectMemory(args: {
  organizationId: string;
  contactId: string | null;
  limit?: number;
}): Promise<InboxMemoryFact[]> {
  const db = getDb();
  if (!db) return [];
  const limit = args.limit ?? 6;

  // Contact-scoped rows when we know the contact, plus org-wide rows
  // (scope_id null). `aiProjectMemory.scopeType` defaults to 'project'; a
  // contact fact is written as scope_type='contact'. We don't constrain on
  // scope_type for the org-wide arm so a future 'org'/'workspace' scope_type
  // with a null scope_id still surfaces.
  const scopeFilter = args.contactId
    ? or(
        eq(aiProjectMemory.scopeId, args.contactId),
        isNull(aiProjectMemory.scopeId),
      )
    : isNull(aiProjectMemory.scopeId);

  const rows = await db
    .select({
      id: aiProjectMemory.id,
      memoryType: aiProjectMemory.memoryType,
      content: aiProjectMemory.content,
    })
    .from(aiProjectMemory)
    .where(
      and(
        eq(aiProjectMemory.organizationId, args.organizationId),
        eq(aiProjectMemory.isActive, true),
        // Not expired: ttl_at null (never expires) or still in the future.
        or(
          isNull(aiProjectMemory.ttlAt),
          sql`${aiProjectMemory.ttlAt} > now()`,
        ),
        scopeFilter,
      ),
    )
    // Contact-scoped facts first, then most-recently-accessed, then newest.
    .orderBy(
      sql`CASE WHEN ${aiProjectMemory.scopeId} IS NOT NULL THEN 0 ELSE 1 END`,
      desc(aiProjectMemory.lastAccessedAt),
      desc(aiProjectMemory.createdAt),
    )
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    memoryType: r.memoryType,
    content: r.content,
  }));
}

/**
 * Best-effort: bump access bookkeeping for the facts we injected so cold
 * rows can be pruned later without losing recently-used context. Never
 * throws — drafting must not fail because telemetry did.
 */
export async function bumpInboxMemoryAccess(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = getDb();
  if (!db) return;
  try {
    await db
      .update(aiProjectMemory)
      .set({
        lastAccessedAt: new Date(),
        accessCount: sql`${aiProjectMemory.accessCount} + 1`,
      })
      .where(inArray(aiProjectMemory.id, ids));
  } catch {
    // swallow — non-critical bookkeeping.
  }
}

/**
 * Format retrieved facts as a compact block for the drafter's system prompt.
 * Returns "" when there are no facts (caller keeps its guardrail note).
 */
export function formatInboxMemoryBlock(facts: InboxMemoryFact[]): string {
  if (facts.length === 0) return "";
  const lines = facts.map((f) => `- (${f.memoryType}) ${f.content.trim()}`);
  return (
    "\n\nKnown facts already established for this contact / workspace " +
    "(ground your reply in these; do not contradict them):\n" +
    lines.join("\n")
  );
}
