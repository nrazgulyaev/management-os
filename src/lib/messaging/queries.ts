import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import {
  conversationThreads,
  conversationMessages,
  messageTemplates,
  autoResponseRules,
  type MessagingChannel,
  type ThreadStatus,
} from "@/lib/db/schema/messaging";

/**
 * Stage 6.P2.F — Read queries for the messaging UI.
 *
 * Every read is scoped to the caller's organization via
 * `requireOrgId()`; the org predicate is ANDed into each WHERE so a
 * BYPASSRLS DB role cannot leak another tenant's threads/messages.
 */

export interface ThreadFilters {
  channel?: MessagingChannel;
  status?: ThreadStatus;
  assignedToUserId?: string;
  unreadOnly?: boolean;
  search?: string;
  limit?: number;
}

export interface ThreadListItem {
  id: string;
  contactId: string | null;
  channelsUsed: string[];
  primaryChannel: string | null;
  status: ThreadStatus;
  assignedToUserId: string | null;
  totalMessages: number;
  unreadCount: number;
  lastMessageAt: Date | null;
  lastInboundAt: Date | null;
  subject: string | null;
  tags: string[] | null;
}

export async function listThreads(
  filters: ThreadFilters = {},
): Promise<ThreadListItem[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const conds = [
    eq(conversationThreads.organizationId, organizationId),
  ] as ReturnType<typeof eq>[];
  if (filters.channel) {
    conds.push(
      sql`${filters.channel} = ANY(${conversationThreads.channelsUsed})` as never,
    );
  }
  if (filters.status) {
    conds.push(eq(conversationThreads.status, filters.status));
  }
  if (filters.assignedToUserId) {
    conds.push(
      eq(conversationThreads.assignedToUserId, filters.assignedToUserId),
    );
  }
  if (filters.unreadOnly) {
    conds.push(sql`${conversationThreads.unreadCount} > 0` as never);
  }
  if (filters.search) {
    const needle = "%" + filters.search.trim() + "%";
    conds.push(sql`${conversationThreads.subject} ILIKE ${needle}` as never);
  }

  const where = and(...conds);
  return (await db
    .select({
      id: conversationThreads.id,
      contactId: conversationThreads.contactId,
      channelsUsed: conversationThreads.channelsUsed,
      primaryChannel: conversationThreads.primaryChannel,
      status: conversationThreads.status,
      assignedToUserId: conversationThreads.assignedToUserId,
      totalMessages: conversationThreads.totalMessages,
      unreadCount: conversationThreads.unreadCount,
      lastMessageAt: conversationThreads.lastMessageAt,
      lastInboundAt: conversationThreads.lastInboundAt,
      subject: conversationThreads.subject,
      tags: conversationThreads.tags,
    })
    .from(conversationThreads)
    .where(where)
    .orderBy(desc(conversationThreads.lastMessageAt))
    .limit(filters.limit ?? 100)) as ThreadListItem[];
}

export async function getThreadById(threadId: string) {
  const db = getDb();
  if (!db) return null;
  const organizationId = await requireOrgId();
  const [row] = await db
    .select()
    .from(conversationThreads)
    .where(
      and(
        eq(conversationThreads.id, threadId),
        eq(conversationThreads.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listThreadMessages(threadId: string, opts: {
  limit?: number;
} = {}) {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  return db
    .select()
    .from(conversationMessages)
    .where(
      and(
        eq(conversationMessages.threadId, threadId),
        eq(conversationMessages.organizationId, organizationId),
      ),
    )
    .orderBy(asc(conversationMessages.receivedAt))
    .limit(opts.limit ?? 200);
}

export async function listTemplates(opts: { activeOnly?: boolean } = {}) {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const where = opts.activeOnly
    ? and(
        eq(messageTemplates.organizationId, organizationId),
        eq(messageTemplates.status, "active"),
      )
    : eq(messageTemplates.organizationId, organizationId);
  return db
    .select()
    .from(messageTemplates)
    .where(where)
    .orderBy(asc(messageTemplates.code));
}

export async function listAutoResponseRules() {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  return db
    .select()
    .from(autoResponseRules)
    .where(eq(autoResponseRules.organizationId, organizationId))
    .orderBy(asc(autoResponseRules.priority));
}
