/**
 * Phase 2.3 owner-05 / Phase 2 data-wiring PR 3 — getOwnerInbox /
 * getOwnerThread.
 *
 * Server fns that resolve inbox data. Both ownership-scoped to
 * prevent thread leakage across owners.
 *
 * The DB enum for `owner_threads.kind` has 8 values; the UI's
 * ThreadKind only covers 4 — mapped via the local helpers below.
 * Similarly, `owner_messages.actor_kind` has 4 values; the UI's
 * MsgActorKind has 3.
 */

import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { ownerThreads, ownerMessages } from "@/lib/db/schema/owner-threads";
import { getOwnerOrgId } from "@/features/owner-portal/owner-context";
import type { ThreadListItem, ThreadKind } from "@/components/owner-portal/thread-list";
import type { ThreadMessage } from "@/components/owner-portal/thread-view";
import type { MsgActorKind } from "@/components/owner-portal/msg-bubble";

export interface OwnerInboxResult {
  threads: ThreadListItem[];
  totalUnread: number;
}

export interface OwnerThreadResult {
  threadId: string;
  subject: string;
  counterpart: string;
  messages: ThreadMessage[];
}

function mapDbKindToUi(kind: string): ThreadKind {
  switch (kind) {
    case "dispute":
      return "statement_dispute";
    case "personal_stay_request":
      return "personal_stay";
    case "q_review":
      return "q_review";
    default:
      return "general";
  }
}

function mapDbActorToUi(kind: string): MsgActorKind {
  switch (kind) {
    case "owner":
      return "owner";
    case "mgmt_staff":
      return "mgmt_user";
    case "concierge_agent":
    case "system":
    default:
      return "agent";
  }
}

function actorDisplayName(kind: MsgActorKind): string {
  switch (kind) {
    case "owner":
      return "You";
    case "mgmt_user":
      return "Mgmt team";
    case "agent":
      return "Concierge";
  }
}

function relativeLabel(at: Date): string {
  const ms = Date.now() - at.getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return at.toISOString().slice(0, 10);
}

export async function getOwnerInbox(ownerId: string): Promise<OwnerInboxResult> {
  const db = getDb();
  if (!db) return { threads: [], totalUnread: 0 };

  // TENANCY 0158 — AND the owner's org onto the primary list read. When the
  // org cannot be resolved (orphan owner) we fall back to the owner_id-only
  // scope rather than hiding the owner's own threads.
  const organizationId = await getOwnerOrgId(ownerId).catch(() => null);

  const rows = await db
    .select({
      id: ownerThreads.id,
      kind: ownerThreads.kind,
      subject: ownerThreads.subject,
      lastMessageAt: ownerThreads.lastMessageAt,
      unreadCount: ownerThreads.unreadCount,
      status: ownerThreads.status,
    })
    .from(ownerThreads)
    .where(
      organizationId
        ? and(
            eq(ownerThreads.ownerId, ownerId),
            eq(ownerThreads.organizationId, organizationId),
          )
        : eq(ownerThreads.ownerId, ownerId),
    )
    .orderBy(desc(ownerThreads.lastMessageAt))
    .limit(100);

  // Per-thread preview = most recent message body, truncated.
  // One follow-up query per thread is fine at <100 threads; in
  // higher-volume tenants, batch this via window function.
  const threads: ThreadListItem[] = [];
  let totalUnread = 0;
  for (const r of rows) {
    const [latest] = await db
      .select({ body: ownerMessages.body, actorKind: ownerMessages.actorKind })
      .from(ownerMessages)
      .where(eq(ownerMessages.threadId, r.id))
      .orderBy(desc(ownerMessages.sentAt))
      .limit(1);
    totalUnread += r.unreadCount;
    threads.push({
      id: r.id,
      kind: mapDbKindToUi(r.kind),
      subject: r.subject,
      preview: latest ? latest.body.slice(0, 140) : "—",
      lastMessageLabel: relativeLabel(new Date(r.lastMessageAt)),
      unreadCount: r.unreadCount,
      counterpart: latest ? actorDisplayName(mapDbActorToUi(latest.actorKind)) : "Mgmt team",
    });
  }
  return { threads, totalUnread };
}

export async function getOwnerThread(
  ownerId: string,
  threadId: string,
): Promise<OwnerThreadResult | null> {
  const db = getDb();
  if (!db) return null;

  // Ownership gate — the AND on owner_id prevents thread enumeration
  // by an attacker who guesses a thread UUID.
  const [thread] = await db
    .select({
      id: ownerThreads.id,
      subject: ownerThreads.subject,
    })
    .from(ownerThreads)
    .where(and(eq(ownerThreads.id, threadId), eq(ownerThreads.ownerId, ownerId)))
    .limit(1);
  if (!thread) return null;

  const messages = await db
    .select({
      id: ownerMessages.id,
      actorKind: ownerMessages.actorKind,
      body: ownerMessages.body,
      sentAt: ownerMessages.sentAt,
    })
    .from(ownerMessages)
    .where(eq(ownerMessages.threadId, thread.id))
    .orderBy(ownerMessages.sentAt)
    .limit(500);

  const mapped: ThreadMessage[] = messages.map((m) => {
    const uiKind = mapDbActorToUi(m.actorKind);
    return {
      id: m.id,
      actorKind: uiKind,
      actorName: actorDisplayName(uiKind),
      body: m.body,
      sentLabel: relativeLabel(new Date(m.sentAt)),
    };
  });

  // Counterpart for the header — pick the most-recent non-owner actor.
  const counterpartMsg = [...mapped].reverse().find((m) => m.actorKind !== "owner");
  const counterpart = counterpartMsg ? counterpartMsg.actorName : "Mgmt team";

  void sql; // imported for future window-fn upgrades; keep the import warm
  return {
    threadId: thread.id,
    subject: thread.subject,
    counterpart,
    messages: mapped,
  };
}
