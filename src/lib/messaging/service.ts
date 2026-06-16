"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import {
  conversationThreads,
  conversationMessages,
  messageTemplates,
  autoResponseRules,
  type MessagingChannel,
} from "@/lib/db/schema/messaging";
import { selectMessagingProvider } from "./select-provider";
import { decryptMessagingCredentials } from "./credentials-store";
import { evaluateAutoResponseRules } from "./rule-evaluator";
import type {
  IncomingMessage,
  MessagingCredentials,
  SendMessageInput,
  SendMessageResult,
} from "./types";

/**
 * Stage 6.P2.F — MessagingService: orchestration over the unified
 * messaging schema + every channel provider.
 *
 * Public surface:
 *   - handleIncomingMessage  — webhook routes + cron pull → service
 *   - sendOutboundMessage    — composer / templates → provider.sendMessage
 *   - sendTemplateMessage    — render template + dispatch
 *   - findOrCreateThread     — thread upsert by (channel, externalId)
 *
 * Per-org scope flows from the connection / credential row passed in
 * by the caller. RLS on conversation_* tables enforces isolation.
 *
 * Errors degrade to structured outcomes — webhook routes and cron
 * jobs loop through these and one bad message must not crash the
 * batch.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type IngestionOutcome =
  | "created"
  | "updated"
  | "echo_skipped"
  | "duplicate_skipped"
  | "failed";

export interface HandleIncomingMessageResult {
  outcome: IngestionOutcome;
  threadId?: string;
  messageId?: string;
  isNewThread?: boolean;
  rulesEvaluated?: number;
  rulesTriggered?: number;
  error?: string;
}

export interface HandleIncomingMessageInput {
  organizationId: string;
  message: IncomingMessage;
}

export interface SendOutboundMessageInput {
  organizationId: string;
  threadId: string;
  channel: MessagingChannel;
  /** Plain credentials object — caller decrypts first. */
  credentials: MessagingCredentials | null;
  recipientExternalId: string;
  text?: string;
  mediaUrl?: string;
  contentType?: SendMessageInput["contentType"];
  subject?: string;
  replyToExternalId?: string;
  /** When set, the message is logged with this user as the sender. */
  senderUserId?: string;
}

// ---------------------------------------------------------------------------
// handleIncomingMessage — webhook + cron pull entry
// ---------------------------------------------------------------------------

export async function handleIncomingMessage(
  input: HandleIncomingMessageInput,
): Promise<HandleIncomingMessageResult> {
  const db = requireDb();
  const m = input.message;

  // 1. Skip platform echoes (outbound messages mirrored back via webhook).
  //    Provider parsers tag these with `contentMetadata.echo = true`.
  if (
    m.contentMetadata &&
    typeof m.contentMetadata === "object" &&
    (m.contentMetadata as Record<string, unknown>)["echo"] === true
  ) {
    return { outcome: "echo_skipped" };
  }

  // 2. Idempotency: dedupe by (channel, externalMessageId).
  const [existing] = await db
    .select({ id: conversationMessages.id, threadId: conversationMessages.threadId })
    .from(conversationMessages)
    .where(
      and(
        eq(conversationMessages.channel, m.channel),
        eq(conversationMessages.externalMessageId, m.externalMessageId),
      ),
    )
    .limit(1);
  if (existing) {
    return {
      outcome: "duplicate_skipped",
      threadId: existing.threadId,
      messageId: existing.id,
    };
  }

  // 3. Find or create thread by (org, channel, externalThreadId).
  const { threadId, isNewThread } = await findOrCreateThread({
    organizationId: input.organizationId,
    channel: m.channel,
    externalThreadId: m.externalThreadId,
    senderDisplayName: m.senderDisplayName,
  });

  // 4. Persist the message.
  let inserted;
  try {
    [inserted] = await db
      .insert(conversationMessages)
      .values({
        organizationId: input.organizationId,
        threadId,
        channel: m.channel,
        externalMessageId: m.externalMessageId,
        externalThreadId: m.externalThreadId,
        direction: "inbound",
        senderExternalId: m.senderExternalId,
        senderDisplayName: m.senderDisplayName,
        contentType: m.contentType,
        contentText: m.contentText,
        contentMediaUrl: m.contentMediaUrl,
        contentMediaThumbnailUrl: m.contentMediaThumbnailUrl,
        contentMetadata: m.contentMetadata as never,
        replyToExternalId: m.replyToExternalId,
        status: "received",
        receivedAt: m.receivedAt,
        rawPayload: m.rawPayload as never,
      })
      .returning({ id: conversationMessages.id });
  } catch (err) {
    return {
      outcome: "failed",
      threadId,
      error: err instanceof Error ? err.message : "insert failed",
    };
  }

  // 5. Roll up thread counters.
  await db
    .update(conversationThreads)
    .set({
      totalMessages: sql`${conversationThreads.totalMessages} + 1`,
      unreadCount: sql`${conversationThreads.unreadCount} + 1`,
      lastMessageAt: m.receivedAt,
      lastInboundAt: m.receivedAt,
      // Append to channels_used if not present.
      channelsUsed: sql`(
        CASE WHEN ${m.channel} = ANY(${conversationThreads.channelsUsed})
          THEN ${conversationThreads.channelsUsed}
          ELSE array_append(${conversationThreads.channelsUsed}, ${m.channel})
        END
      )`,
      updatedAt: new Date(),
    })
    .where(eq(conversationThreads.id, threadId));

  // 6. Auto-rule evaluation. One bad rule must not block ingestion —
  //    wrap in try/catch and degrade to "no rules fired".
  let rulesEvaluated = 0;
  let rulesTriggered = 0;
  try {
    const evalResult = await evaluateAutoResponseRules({
      organizationId: input.organizationId,
      threadId,
      messageId: inserted.id,
      channel: m.channel,
      contentText: m.contentText ?? "",
      isFirstMessageInThread: isNewThread,
      receivedAt: m.receivedAt,
    });
    rulesEvaluated = evalResult.evaluated;
    rulesTriggered = evalResult.triggered;
  } catch {
    // Swallow — rules are best-effort.
  }

  return {
    outcome: "created",
    threadId,
    messageId: inserted.id,
    isNewThread,
    rulesEvaluated,
    rulesTriggered,
  };
}

// ---------------------------------------------------------------------------
// sendOutboundMessage — composer / template / rule-action entry
// ---------------------------------------------------------------------------

export async function sendOutboundMessage(
  input: SendOutboundMessageInput,
): Promise<{
  ok: boolean;
  messageId?: string;
  externalMessageId?: string;
  error?: string;
}> {
  const db = requireDb();
  const provider = selectMessagingProvider(input.channel, input.credentials);

  // Tenant boundary: `threadId` arrives from the caller (a client form /
  // body), and the DB role bypasses RLS. Confirm the thread belongs to
  // `organizationId` BEFORE inserting a message or rolling up thread
  // state — otherwise a caller could pre-insert into / mutate another
  // org's thread by guessing its id (write-IDOR). A cross-org or missing
  // id reads as "not found".
  const [ownedThread] = await db
    .select({ id: conversationThreads.id })
    .from(conversationThreads)
    .where(
      and(
        eq(conversationThreads.id, input.threadId),
        eq(conversationThreads.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!ownedThread) {
    return { ok: false, error: "thread not found" };
  }

  // Pre-insert the message in `pending` status so we have a row to
  // update with the external ID after dispatch. This also lets the
  // composer optimistic-render before the network round-trip lands.
  const [pending] = await db
    .insert(conversationMessages)
    .values({
      organizationId: input.organizationId,
      threadId: input.threadId,
      channel: input.channel,
      direction: "outbound",
      senderUserId: input.senderUserId ?? null,
      recipientExternalId: input.recipientExternalId,
      contentType: input.contentType ?? "text",
      contentText: input.text,
      contentMediaUrl: input.mediaUrl,
      replyToExternalId: input.replyToExternalId,
      status: "pending",
      sentAt: new Date(),
    })
    .returning({ id: conversationMessages.id });

  let result: SendMessageResult;
  try {
    result = await provider.sendMessage({
      channel: input.channel,
      recipientExternalId: input.recipientExternalId,
      contentType: input.contentType ?? "text",
      text: input.text,
      mediaUrl: input.mediaUrl,
      subject: input.subject,
      replyToExternalId: input.replyToExternalId,
    });
  } catch (err) {
    result = {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  await db
    .update(conversationMessages)
    .set({
      status: result.success ? "sent" : "failed",
      externalMessageId: result.externalMessageId ?? null,
      errorMessage: result.success ? null : (result.error ?? "send failed"),
      costMinor: result.costMinor ?? null,
      costCurrency: result.costCurrency ?? null,
      updatedAt: new Date(),
    })
    .where(eq(conversationMessages.id, pending.id));

  // Roll up thread state on success.
  if (result.success) {
    await db
      .update(conversationThreads)
      .set({
        totalMessages: sql`${conversationThreads.totalMessages} + 1`,
        lastMessageAt: new Date(),
        lastOutboundAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(conversationThreads.id, input.threadId),
          eq(conversationThreads.organizationId, input.organizationId),
        ),
      );
  }

  return {
    ok: result.success,
    messageId: pending.id,
    externalMessageId: result.externalMessageId,
    error: result.success ? undefined : result.error,
  };
}

// ---------------------------------------------------------------------------
// sendTemplateMessage — render template content per channel + dispatch
// ---------------------------------------------------------------------------

export async function sendTemplateMessage(input: {
  organizationId: string;
  threadId: string;
  channel: MessagingChannel;
  credentials: MessagingCredentials | null;
  recipientExternalId: string;
  templateCode: string;
  variables: Record<string, string>;
  senderUserId?: string;
}): Promise<{
  ok: boolean;
  messageId?: string;
  externalMessageId?: string;
  error?: string;
}> {
  const db = requireDb();
  const [template] = await db
    .select()
    .from(messageTemplates)
    .where(
      and(
        eq(messageTemplates.organizationId, input.organizationId),
        eq(messageTemplates.code, input.templateCode),
        eq(messageTemplates.status, "active"),
      ),
    )
    .limit(1);
  if (!template) {
    return { ok: false, error: `template not found: ${input.templateCode}` };
  }

  const contentMap = template.contentPerChannel as Record<string, string>;
  const rawContent = contentMap[input.channel];
  if (!rawContent) {
    return {
      ok: false,
      error: `template ${input.templateCode} has no content for channel ${input.channel}`,
    };
  }
  const rendered = renderTemplate(rawContent, input.variables);

  return sendOutboundMessage({
    organizationId: input.organizationId,
    threadId: input.threadId,
    channel: input.channel,
    credentials: input.credentials,
    recipientExternalId: input.recipientExternalId,
    text: rendered,
    contentType: "text",
    senderUserId: input.senderUserId,
  });
}

/**
 * Pure template substitution — `{{variable}}` placeholders replaced
 * with the corresponding value. Missing variables stay as `{{name}}`
 * so the operator can spot them in the rendered preview.
 *
 * Module-private (not `export`) because the surrounding module is
 * `"use server"` and Next requires every exported binding from such
 * a module to be an async function. Callers that need the helper
 * should import a sibling pure module if/when one is added.
 */
function renderTemplate(
  content: string,
  variables: Record<string, string>,
): string {
  return content.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key) => {
    const value = variables[key];
    return typeof value === "string" ? value : match;
  });
}

// ---------------------------------------------------------------------------
// findOrCreateThread — idempotent thread upsert
// ---------------------------------------------------------------------------

export async function findOrCreateThread(input: {
  organizationId: string;
  channel: MessagingChannel;
  externalThreadId: string;
  senderDisplayName?: string;
}): Promise<{ threadId: string; isNewThread: boolean }> {
  const db = requireDb();
  // Look up existing thread by org + channel + external_identifiers JSONB key.
  const existingRows = await db
    .select({ id: conversationThreads.id })
    .from(conversationThreads)
    .where(
      and(
        eq(conversationThreads.organizationId, input.organizationId),
        sql`${conversationThreads.externalIdentifiers} ->> ${input.channel} = ${input.externalThreadId}`,
      ),
    )
    .limit(1);
  if (existingRows.length > 0) {
    return { threadId: existingRows[0].id, isNewThread: false };
  }
  const [created] = await db
    .insert(conversationThreads)
    .values({
      organizationId: input.organizationId,
      channelsUsed: [input.channel],
      primaryChannel: input.channel,
      externalIdentifiers: { [input.channel]: input.externalThreadId } as never,
      status: "active",
      subject: input.senderDisplayName,
      totalMessages: 0,
      unreadCount: 0,
    })
    .returning({ id: conversationThreads.id });
  return { threadId: created.id, isNewThread: true };
}

// ---------------------------------------------------------------------------
// Cron support — read helpers
// ---------------------------------------------------------------------------

export async function listInactiveThreadsForCleanup(opts: {
  inactiveSince: Date;
  limit?: number;
}): Promise<Array<{ id: string }>> {
  const db = requireDb();
  return db
    .select({ id: conversationThreads.id })
    .from(conversationThreads)
    .where(
      and(
        eq(conversationThreads.status, "active"),
        sql`${conversationThreads.lastMessageAt} < ${opts.inactiveSince}`,
      ),
    )
    .orderBy(desc(conversationThreads.lastMessageAt))
    .limit(opts.limit ?? 100);
}

export async function archiveInactiveThreads(opts: {
  inactiveSince: Date;
}): Promise<number> {
  const db = requireDb();
  const rows = await db
    .update(conversationThreads)
    .set({ status: "archived", updatedAt: new Date() })
    .where(
      and(
        eq(conversationThreads.status, "active"),
        sql`${conversationThreads.lastMessageAt} < ${opts.inactiveSince}`,
      ),
    )
    .returning({ id: conversationThreads.id });
  return rows.length;
}

/** Used by the inbox UI's stats strip. */
export async function getInboxMetrics(orgId: string): Promise<{
  totalThreads: number;
  activeThreads: number;
  unreadCount: number;
  perChannel: Record<MessagingChannel, number>;
}> {
  const db = requireDb();
  const rows = await db
    .select({
      status: conversationThreads.status,
      unreadCount: conversationThreads.unreadCount,
      primaryChannel: conversationThreads.primaryChannel,
      total: sql<number>`count(*)::int`,
      unreadSum: sql<number>`coalesce(sum(${conversationThreads.unreadCount}), 0)::int`,
    })
    .from(conversationThreads)
    .where(eq(conversationThreads.organizationId, orgId))
    .groupBy(
      conversationThreads.status,
      conversationThreads.unreadCount,
      conversationThreads.primaryChannel,
    );

  let totalThreads = 0;
  let activeThreads = 0;
  let unreadCount = 0;
  const perChannel: Record<string, number> = {};
  for (const r of rows) {
    totalThreads += Number(r.total);
    if (r.status === "active") activeThreads += Number(r.total);
    unreadCount += Number(r.unreadSum);
    if (r.primaryChannel) {
      perChannel[r.primaryChannel] =
        (perChannel[r.primaryChannel] ?? 0) + Number(r.total);
    }
  }
  // Round out missing channels with 0 so the UI doesn't have to defend.
  for (const c of [
    "whatsapp",
    "telegram",
    "instagram",
    "facebook_messenger",
    "email",
    "sms",
    "internal_note",
  ]) {
    if (!(c in perChannel)) perChannel[c] = 0;
  }
  return {
    totalThreads,
    activeThreads,
    unreadCount,
    perChannel: perChannel as Record<MessagingChannel, number>,
  };
}

void autoResponseRules; // referenced indirectly via rule-evaluator import
void decryptMessagingCredentials;
