"use server";
import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  salesConversationThreads,
  salesConversationMessages,
} from "@/lib/db/schema/marketing";
import { requireOrgId } from "@/features/auth/require-org";

export async function recordConsent(args: {
  threadCode: string;
  userId: string;
  consent: boolean;
}) {
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  const organizationId = await requireOrgId();
  await db
    .update(salesConversationThreads)
    .set({
      consentToAnalyze: args.consent,
      consentRecordedAt: args.consent ? new Date() : null,
      consentRecordedBy: args.consent ? args.userId : null,
    })
    .where(
      and(
        eq(salesConversationThreads.threadCode, args.threadCode),
        eq(salesConversationThreads.organizationId, organizationId),
      ),
    );
  return { ok: true as const };
}

/**
 * Append a message to a sales conversation's transcript. Org-scoped: the
 * parent thread must belong to the caller's org (confused-deputy guard) before
 * we insert. Also bumps the thread's total_message_count + last_message_at so
 * the aggregate stays consistent with the stored transcript.
 */
export async function appendConversationMessage(args: {
  threadCode: string;
  direction: "inbound" | "outbound";
  body: string;
  senderName?: string | null;
  channelType?: string;
  occurredAt?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "DB not configured" };
  const body = args.body?.trim();
  if (!body) return { ok: false, error: "Message body is required" };
  if (args.direction !== "inbound" && args.direction !== "outbound") {
    return { ok: false, error: "direction must be inbound or outbound" };
  }
  const organizationId = await requireOrgId();
  const rows = await db
    .select({ id: salesConversationThreads.id })
    .from(salesConversationThreads)
    .where(
      and(
        eq(salesConversationThreads.threadCode, args.threadCode),
        eq(salesConversationThreads.organizationId, organizationId),
      ),
    )
    .limit(1);
  const thread = rows[0];
  if (!thread) return { ok: false, error: "Thread not found" };
  const occurredAt = args.occurredAt ? new Date(args.occurredAt) : new Date();
  await db.insert(salesConversationMessages).values({
    organizationId,
    threadId: thread.id,
    channelType: args.channelType?.trim() || "whatsapp",
    direction: args.direction,
    senderName: args.senderName?.trim() || null,
    body,
    occurredAt,
  });
  await db
    .update(salesConversationThreads)
    .set({
      totalMessageCount: sql`${salesConversationThreads.totalMessageCount} + 1`,
      lastMessageAt: occurredAt,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(salesConversationThreads.id, thread.id),
        eq(salesConversationThreads.organizationId, organizationId),
      ),
    );
  return { ok: true };
}

/**
 * Trigger AI analysis on a conversation. **Hard-gated on consent.**
 */
export async function triggerConversationAnalysis(args: {
  threadCode: string;
}): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "DB not configured" };
  const organizationId = await requireOrgId();
  const rows = await db
    .select()
    .from(salesConversationThreads)
    .where(
      and(
        eq(salesConversationThreads.threadCode, args.threadCode),
        eq(salesConversationThreads.organizationId, organizationId),
      ),
    )
    .limit(1);
  const thread = rows[0];
  if (!thread) return { ok: false, error: "Thread not found" };
  if (!thread.consentToAnalyze) {
    return {
      ok: false,
      error: "Cannot analyze without explicit consent_to_analyze=true",
    };
  }
  await db
    .update(salesConversationThreads)
    .set({ aiAnalysisStatus: "analyzing" })
    .where(
      and(
        eq(salesConversationThreads.id, thread.id),
        eq(salesConversationThreads.organizationId, organizationId),
      ),
    );
  // Actual provider call would happen here; in dry-run we just mark analyzed
  // and rely on the Stage 5.D Marketing Assistant agent for any text gen.
  await db
    .update(salesConversationThreads)
    .set({ aiAnalysisStatus: "analyzed" })
    .where(
      and(
        eq(salesConversationThreads.id, thread.id),
        eq(salesConversationThreads.organizationId, organizationId),
      ),
    );
  return { ok: true };
}
