"use server";

/**
 * P5.5.2 AGENT-THREAD-ACTIONS — server-side read helpers + write actions
 * for the user-facing chat surface (/development-os/agents/[code]).
 *
 * Read helpers (default export not marked `"use server"`-only because
 * the module-level directive applies — Next is fine with read helpers
 * that don't mutate, they just get rolled into the same RPC boundary).
 *
 * Access control:
 *   · getCurrentAppUser() required
 *   · Every helper that returns an agent / thread / messages re-verifies
 *     the org-subscription. Avoids "leak through redirect" if a user
 *     hand-crafts a URL after their subscription is revoked.
 *
 * Citation rendering: the inference module persists
 * `agent_messages.retrieved_chunk_ids` for every assistant turn. The
 * read helper joins that array against `agent_knowledge_chunks` and
 * the parent `agent_knowledge_documents` so the UI can render numbered
 * footnotes ("Source N — filename") without a second roundtrip.
 */

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { requireDb, rowsOf } from "@/lib/db/client";
import {
  platformAgentConfigs,
  orgAgentSubscriptions,
  agentThreads,
  agentMessages,
} from "@/lib/db/schema/agents";
import { getCurrentAppUser } from "@/features/auth/current-user";

export interface ResolvedAgent {
  id: string;
  agentCode: string;
  displayName: string;
  description: string | null;
  provider: string;
  model: string;
  isActive: boolean;
  hasApiKey: boolean;
  subscriptionEnabled: boolean;
}

export interface ThreadListItem {
  id: string;
  title: string | null;
  updatedAt: string;
  lastMessagePreview: string | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  retrievedChunkIds: string[];
  tokensIn: number | null;
  tokensOut: number | null;
}

export interface MessageCitation {
  chunkId: string;
  contentPreview: string;
  filename: string | null;
  documentId: string;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Resolves an agent by its agent_code AND verifies the current user's
 * org is subscribed. Returns null when:
 *   · no signed-in user
 *   · agent_code doesn't exist OR is_active=false
 *   · subscription row missing OR is_enabled=false
 */
export async function getAgentForCurrentUser(
  agentCode: string,
): Promise<ResolvedAgent | null> {
  const me = await getCurrentAppUser();
  if (!me) return null;

  const db = requireDb();
  const [row] = await db
    .select({
      id: platformAgentConfigs.id,
      agentCode: platformAgentConfigs.agentCode,
      displayName: platformAgentConfigs.displayName,
      description: platformAgentConfigs.description,
      provider: platformAgentConfigs.provider,
      model: platformAgentConfigs.model,
      isActive: platformAgentConfigs.isActive,
      vaultSecretName: platformAgentConfigs.vaultSecretName,
      subEnabled: orgAgentSubscriptions.isEnabled,
    })
    .from(platformAgentConfigs)
    .leftJoin(
      orgAgentSubscriptions,
      and(
        eq(orgAgentSubscriptions.agentId, platformAgentConfigs.id),
        eq(orgAgentSubscriptions.organizationId, me.organizationId),
      ),
    )
    .where(eq(platformAgentConfigs.agentCode, agentCode))
    .limit(1);

  if (!row || !row.isActive) return null;
  return {
    id: row.id,
    agentCode: row.agentCode,
    displayName: row.displayName,
    description: row.description,
    provider: row.provider,
    model: row.model,
    isActive: row.isActive,
    hasApiKey: Boolean(row.vaultSecretName),
    subscriptionEnabled: row.subEnabled === true,
  };
}

export async function listUserThreads(
  agentId: string,
): Promise<ThreadListItem[]> {
  const me = await getCurrentAppUser();
  if (!me) return [];
  const db = requireDb();

  const rows = await db.execute<{
    id: string;
    title: string | null;
    updated_at: string;
    last_preview: string | null;
  }>(sql`
    SELECT t.id::text                      AS id,
           t.title                          AS title,
           t.updated_at::text               AS updated_at,
           (
             SELECT content
               FROM agent_messages m
              WHERE m.thread_id = t.id
              ORDER BY m.created_at DESC
              LIMIT 1
           )                                AS last_preview
      FROM agent_threads t
     WHERE t.agent_id = ${agentId}::uuid
       AND t.organization_id = ${me.organizationId}::uuid
       AND t.user_id = ${me.id}::uuid
     ORDER BY t.updated_at DESC
     LIMIT 30
  `);

  const list =
    rowsOf<{
      id: string;
      title: string | null;
      updated_at: string;
      last_preview: string | null;
    }>(rows);

  return list.map((r) => ({
    id: r.id,
    title: r.title,
    updatedAt: r.updated_at,
    lastMessagePreview: r.last_preview
      ? r.last_preview.slice(0, 140)
      : null,
  }));
}

export async function loadThreadMessages(
  threadId: string,
): Promise<ChatMessage[]> {
  const me = await getCurrentAppUser();
  if (!me) return [];
  const db = requireDb();

  // Ownership check — surface as empty array rather than a 403, since
  // the UI's "select a thread" empty state is friendlier.
  const [own] = await db
    .select({ id: agentThreads.id })
    .from(agentThreads)
    .where(
      and(
        eq(agentThreads.id, threadId),
        eq(agentThreads.userId, me.id),
        eq(agentThreads.organizationId, me.organizationId),
      ),
    )
    .limit(1);
  if (!own) return [];

  const rows = await db
    .select()
    .from(agentMessages)
    .where(eq(agentMessages.threadId, threadId))
    .orderBy(agentMessages.createdAt);

  return rows.map((r) => ({
    id: r.id,
    role: r.role as "user" | "assistant" | "system",
    content: r.content,
    createdAt: r.createdAt.toISOString(),
    retrievedChunkIds: (r.retrievedChunkIds ?? []) as string[],
    tokensIn: r.tokensIn,
    tokensOut: r.tokensOut,
  }));
}

/**
 * Looks up the chunks referenced by an assistant message and joins
 * them with the parent document so the UI can render numbered
 * "Source N — filename" footnotes with a preview.
 */
export async function getMessageCitations(
  chunkIds: string[],
): Promise<MessageCitation[]> {
  if (chunkIds.length === 0) return [];

  // Auth + org scope. This is a `"use server"` action invoked from the
  // client with client-supplied chunk ids — a direct endpoint. Without
  // a principal + org predicate, any signed-in user could read another
  // tenant's (or a non-subscribed org's) knowledge-base chunk text and
  // filenames by passing arbitrary chunk UUIDs. We scope to the caller's
  // org and platform-global chunks (organization_id IS NULL), mirroring
  // the retrieval module's (org_id IS NULL OR org_id = $) shape.
  const me = await getCurrentAppUser();
  if (!me) return [];

  const db = requireDb();

  // Cap to 20 — we never retrieve more than topK=5 today, but the
  // schema column is `uuid[]` so this guards a future change.
  const safeIds = chunkIds.slice(0, 20);

  const rows = await db.execute<{
    chunk_id: string;
    content: string;
    document_id: string;
    filename: string | null;
  }>(sql`
    SELECT c.id::text         AS chunk_id,
           c.content           AS content,
           c.document_id::text AS document_id,
           d.filename          AS filename
      FROM agent_knowledge_chunks c
      LEFT JOIN agent_knowledge_documents d ON d.id = c.document_id
     WHERE c.id IN (${sql.join(
       safeIds.map((id) => sql`${id}::uuid`),
       sql`, `,
     )})
       AND (
         c.organization_id IS NULL
         OR c.organization_id = ${me.organizationId}::uuid
       )
  `);

  const list =
    rowsOf<{
      chunk_id: string;
      content: string;
      document_id: string;
      filename: string | null;
    }>(rows);

  // Preserve the request-order so footnote numbers line up with the
  // order the inference module retrieved them in.
  const byId = new Map(list.map((r) => [r.chunk_id, r]));
  return safeIds
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => ({
      chunkId: r.chunk_id,
      contentPreview: r.content.slice(0, 200).trim(),
      filename: r.filename,
      documentId: r.document_id,
    }));
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function deleteThreadAction(formData: FormData): Promise<void> {
  const threadId = String(formData.get("threadId") ?? "");
  const agentCode = String(formData.get("agentCode") ?? "");
  if (!threadId || !agentCode) return;

  const me = await getCurrentAppUser();
  if (!me) return;

  const db = requireDb();
  await db
    .delete(agentThreads)
    .where(
      and(
        eq(agentThreads.id, threadId),
        eq(agentThreads.userId, me.id),
        eq(agentThreads.organizationId, me.organizationId),
      ),
    );

  revalidatePath(`/development-os/agents/${agentCode}`);
}

export async function renameThreadAction(formData: FormData): Promise<void> {
  const threadId = String(formData.get("threadId") ?? "");
  const agentCode = String(formData.get("agentCode") ?? "");
  const title = String(formData.get("title") ?? "").slice(0, 120);
  if (!threadId || !agentCode || !title) return;

  const me = await getCurrentAppUser();
  if (!me) return;

  const db = requireDb();
  await db
    .update(agentThreads)
    .set({ title })
    .where(
      and(
        eq(agentThreads.id, threadId),
        eq(agentThreads.userId, me.id),
        eq(agentThreads.organizationId, me.organizationId),
      ),
    );

  revalidatePath(`/development-os/agents/${agentCode}`);
}

