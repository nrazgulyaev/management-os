import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";

/**
 * Owner inbox — two-way conversation threads (owner_threads /
 * owner_messages, mig 0114). Distinct from get-inbox.ts which reads the
 * one-way in-app notification feed.
 *
 * All raw reads use rowsOf<T>() — owner-portal-queries.ts had the
 * postgres-js `.rows` shape bug (OWNER-PORTAL-SHAPE-1); do not reintroduce.
 */

export type OwnerThreadKind =
  | "general"
  | "dispute"
  | "personal_stay_request"
  | "maintenance_question"
  | "tax_question"
  | "onboarding"
  | "offboarding"
  | "other";

export interface OwnerThreadListItem {
  id: string;
  kind: string;
  subject: string;
  status: string;
  unreadCount: number;
  lastMessageAt: string;
  preview: string | null;
}

/** Threads for an owner, newest activity first, with a last-message preview. */
export async function listOwnerThreads(ownerId: string): Promise<OwnerThreadListItem[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.execute(sql`
    SELECT t.id::text                       AS id,
           t.kind                            AS kind,
           t.subject                         AS subject,
           t.status                          AS status,
           t.unread_count                    AS unread_count,
           t.last_message_at::text           AS last_message_at,
           lm.body                           AS preview
      FROM owner_threads t
      LEFT JOIN LATERAL (
        SELECT m.body
          FROM owner_messages m
         WHERE m.thread_id = t.id
         ORDER BY m.sent_at DESC
         LIMIT 1
      ) lm ON true
     WHERE t.owner_id = ${ownerId}::uuid
     ORDER BY t.last_message_at DESC
     LIMIT 100
  `);
  return rowsOf<{
    id: string;
    kind: string;
    subject: string;
    status: string;
    unread_count: number;
    last_message_at: string;
    preview: string | null;
  }>(rows).map((r) => ({
    id: r.id,
    kind: r.kind,
    subject: r.subject,
    status: r.status,
    unreadCount: Number(r.unread_count ?? 0),
    lastMessageAt: r.last_message_at,
    preview: r.preview ? r.preview.slice(0, 120) : null,
  }));
}

export interface OwnerThreadMessageAttachment {
  documentId: string;
  name: string;
  mimeType: string | null;
  sizeBytes: number | null;
}

export interface OwnerThreadMessageScheduling {
  id: string;
  kind: "accept_slot" | "propose_time";
  label: string;
  slotIso: string | null;
}

export interface OwnerThreadMessage {
  id: string;
  actorKind: string;
  actorName: string;
  body: string;
  sentAt: string;
  /** Structured scheduling chips ("Accept · <time>" / "Propose different time"). */
  scheduling: OwnerThreadMessageScheduling[];
  /** True once the owner has acted on this message's scheduling chips. */
  schedulingResolved: boolean;
  attachments: OwnerThreadMessageAttachment[];
}

export interface OwnerThreadDetail {
  id: string;
  subject: string;
  kind: string;
  status: string;
  messages: OwnerThreadMessage[];
}

/**
 * One thread + its messages — scoped to the owner (returns null if the
 * thread isn't theirs, so a guessed id can't leak another owner's thread).
 */
export async function getOwnerThreadDetail(
  threadId: string,
  ownerId: string,
): Promise<OwnerThreadDetail | null> {
  const db = getDb();
  if (!db) return null;

  const head = rowsOf<{
    id: string;
    subject: string;
    kind: string;
    status: string;
  }>(
    await db.execute(sql`
      SELECT id::text AS id, subject, kind, status
        FROM owner_threads
       WHERE id = ${threadId}::uuid AND owner_id = ${ownerId}::uuid
       LIMIT 1
    `),
  )[0];
  if (!head) return null;

  const messages = rowsOf<{
    id: string;
    actor_kind: string;
    actor_name: string | null;
    body: string;
    sent_at: string;
    inline_actions: unknown;
    attachments: unknown;
  }>(
    await db.execute(sql`
      SELECT m.id::text         AS id,
             m.actor_kind        AS actor_kind,
             au.full_name         AS actor_name,
             m.body               AS body,
             m.sent_at::text      AS sent_at,
             m.inline_actions     AS inline_actions,
             m.attachments        AS attachments
        FROM owner_messages m
        LEFT JOIN app_users au ON au.id = m.actor_id
       WHERE m.thread_id = ${threadId}::uuid
       ORDER BY m.sent_at ASC
       LIMIT 500
    `),
  ).map((r) => ({
    id: r.id,
    actorKind: r.actor_kind,
    actorName:
      r.actor_name ??
      (r.actor_kind === "owner"
        ? "You"
        : r.actor_kind === "concierge_agent"
          ? "Concierge"
          : r.actor_kind === "system"
            ? "System"
            : "Arconique"),
    body: r.body,
    sentAt: r.sent_at,
    scheduling: parseScheduling(r.inline_actions),
    schedulingResolved: parseSchedulingResolved(r.inline_actions),
    attachments: parseAttachments(r.attachments),
  }));

  return { id: head.id, subject: head.subject, kind: head.kind, status: head.status, messages };
}

/** Parse owner_messages.inline_actions → scheduling chips (tolerant of nulls / legacy shapes). */
function parseScheduling(raw: unknown): OwnerThreadMessageScheduling[] {
  if (!raw || typeof raw !== "object") return [];
  const list = (raw as { scheduling?: unknown }).scheduling;
  if (!Array.isArray(list)) return [];
  const out: OwnerThreadMessageScheduling[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const a = item as { id?: unknown; kind?: unknown; label?: unknown; slotIso?: unknown };
    if (typeof a.id !== "string" || typeof a.label !== "string") continue;
    const kind = a.kind === "accept_slot" ? "accept_slot" : "propose_time";
    out.push({
      id: a.id,
      kind,
      label: a.label,
      slotIso: typeof a.slotIso === "string" ? a.slotIso : null,
    });
  }
  return out;
}

function parseSchedulingResolved(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  return (raw as { resolved?: unknown }).resolved === true;
}

/** Parse owner_messages.attachments → document refs (tolerant of nulls / legacy shapes). */
function parseAttachments(raw: unknown): OwnerThreadMessageAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: OwnerThreadMessageAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const a = item as {
      documentId?: unknown;
      name?: unknown;
      mimeType?: unknown;
      sizeBytes?: unknown;
    };
    if (typeof a.documentId !== "string") continue;
    out.push({
      documentId: a.documentId,
      name: typeof a.name === "string" ? a.name : "Attachment",
      mimeType: typeof a.mimeType === "string" ? a.mimeType : null,
      sizeBytes: typeof a.sizeBytes === "number" ? a.sizeBytes : null,
    });
  }
  return out;
}
