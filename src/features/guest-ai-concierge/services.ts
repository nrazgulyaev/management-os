import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  guestAiConciergeMessages,
  guestAiConciergeRuns,
  guestAiConciergeSessions,
  type GuestAiConciergeMessage,
  type GuestAiConciergeSession,
} from "@/lib/db/schema/guest-ai-concierge";
import { guestStayTokens } from "@/lib/db/schema/guest-stays";
import { bookings } from "@/lib/db/schema/bookings";

/**
 * Token-scoped: ensure an active session exists for the given stay
 * token. Returns the session id.
 */
export async function ensureActiveSession(args: {
  guestStayTokenId: string;
  bookingId: string | null;
}): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const [existing] = await db
    .select()
    .from(guestAiConciergeSessions)
    .where(
      and(
        eq(
          guestAiConciergeSessions.guestStayTokenId,
          args.guestStayTokenId,
        ),
        eq(guestAiConciergeSessions.status, "active"),
      ),
    )
    .limit(1);
  if (existing) return existing.id;
  const [row] = await db
    .insert(guestAiConciergeSessions)
    .values({
      guestStayTokenId: args.guestStayTokenId,
      bookingId: args.bookingId,
    })
    .returning({ id: guestAiConciergeSessions.id });
  return row?.id ?? null;
}

export async function listMessagesForSession(
  sessionId: string,
  limit = 60,
  organizationId: string | null = null,
): Promise<GuestAiConciergeMessage[]> {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(guestAiConciergeMessages)
    .where(
      and(
        eq(guestAiConciergeMessages.sessionId, sessionId),
        organizationId
          ? eq(guestAiConciergeMessages.organizationId, organizationId)
          : undefined,
      ),
    )
    .orderBy(asc(guestAiConciergeMessages.createdAt))
    .limit(limit);
}

/**
 * Resolve the org a concierge session belongs to (its own column).
 * Returns null when the session is unknown or its org is unbackfilled
 * (legacy) — callers treat a non-null mismatch as a cross-tenant access.
 */
export async function getConciergeSessionOrganizationId(
  sessionId: string,
): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const [s] = await db
    .select({ organizationId: guestAiConciergeSessions.organizationId })
    .from(guestAiConciergeSessions)
    .where(eq(guestAiConciergeSessions.id, sessionId))
    .limit(1);
  return s?.organizationId ?? null;
}

/**
 * Number of user messages in the active session — used to enforce the
 * "max 12 user messages per session" cap.
 */
export async function userMessageCount(sessionId: string): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const [r] = await db
    .select({ c: sql<number>`count(*)` })
    .from(guestAiConciergeMessages)
    .where(
      and(
        eq(guestAiConciergeMessages.sessionId, sessionId),
        eq(guestAiConciergeMessages.role, "user"),
      ),
    );
  return Number(r?.c ?? 0);
}

export interface AppendMessageInput {
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  safetyStatus?: "ok" | "refused" | "redacted" | "error";
  citationsJson?: unknown;
  toolContextJson?: unknown;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  latencyMs?: number | null;
}

export async function appendMessage(
  input: AppendMessageInput,
): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .insert(guestAiConciergeMessages)
    .values({
      sessionId: input.sessionId,
      role: input.role,
      content: input.content,
      safetyStatus: input.safetyStatus ?? "ok",
      citationsJson: input.citationsJson as never,
      toolContextJson: input.toolContextJson as never,
      model: input.model ?? null,
      inputTokens: input.inputTokens ?? null,
      outputTokens: input.outputTokens ?? null,
      latencyMs: input.latencyMs ?? null,
    })
    .returning({ id: guestAiConciergeMessages.id });
  await db
    .update(guestAiConciergeSessions)
    .set({
      lastMessageAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(guestAiConciergeSessions.id, input.sessionId));
  return row?.id ?? null;
}

export interface RecordRunInput {
  sessionId: string;
  status: "succeeded" | "failed" | "refused";
  model: string | null;
  promptHash: string | null;
  safetyFlags: Record<string, unknown> | null;
  allowedContextKeys: string[] | null;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date;
}

export async function recordRun(input: RecordRunInput): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.insert(guestAiConciergeRuns).values({
    sessionId: input.sessionId,
    status: input.status,
    model: input.model,
    promptHash: input.promptHash,
    safetyFlags: input.safetyFlags as never,
    allowedContextKeys: input.allowedContextKeys as never,
    errorMessage: input.errorMessage,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
  });
}

// -----------------------------------------------------------------------------
// Admin reads
// -----------------------------------------------------------------------------

export interface AdminSessionRow extends GuestAiConciergeSession {
  tokenPrefix: string | null;
  bookingCode: string | null;
  messageCount: number;
}

export async function listAdminSessions(opts?: {
  limit?: number;
  status?: "active" | "archived";
}): Promise<AdminSessionRow[]> {
  const db = getDb();
  if (!db) return [];

  const counts = db.$with("counts").as(
    db
      .select({
        sessionId: guestAiConciergeMessages.sessionId,
        c: sql<number>`count(*)`.as("c"),
      })
      .from(guestAiConciergeMessages)
      .groupBy(guestAiConciergeMessages.sessionId),
  );

  const rows = await db
    .with(counts)
    .select({
      s: guestAiConciergeSessions,
      tokenPrefix: guestStayTokens.tokenPrefix,
      bookingCode: bookings.bookingCode,
      messageCount: sql<number>`coalesce(${counts.c}, 0)`.as("message_count"),
    })
    .from(guestAiConciergeSessions)
    .leftJoin(
      guestStayTokens,
      eq(guestStayTokens.id, guestAiConciergeSessions.guestStayTokenId),
    )
    .leftJoin(
      bookings,
      eq(bookings.id, guestAiConciergeSessions.bookingId),
    )
    .leftJoin(counts, eq(counts.sessionId, guestAiConciergeSessions.id))
    .where(
      opts?.status
        ? eq(guestAiConciergeSessions.status, opts.status)
        : undefined,
    )
    .orderBy(desc(guestAiConciergeSessions.lastMessageAt))
    .limit(opts?.limit ?? 100);
  return rows.map((r) => ({
    ...r.s,
    tokenPrefix: r.tokenPrefix ?? null,
    bookingCode: r.bookingCode ?? null,
    messageCount: Number(r.messageCount ?? 0),
  }));
}

export async function getAdminSessionDetail(id: string): Promise<{
  session: AdminSessionRow | null;
  messages: GuestAiConciergeMessage[];
  runs: typeof guestAiConciergeRuns.$inferSelect[];
}> {
  const db = getDb();
  if (!db) return { session: null, messages: [], runs: [] };
  const [row] = await db
    .select({
      s: guestAiConciergeSessions,
      tokenPrefix: guestStayTokens.tokenPrefix,
      bookingCode: bookings.bookingCode,
      messageCount: sql<number>`(
        SELECT count(*) FROM ${guestAiConciergeMessages}
         WHERE ${guestAiConciergeMessages.sessionId} = ${guestAiConciergeSessions.id}
      )`,
    })
    .from(guestAiConciergeSessions)
    .leftJoin(
      guestStayTokens,
      eq(guestStayTokens.id, guestAiConciergeSessions.guestStayTokenId),
    )
    .leftJoin(
      bookings,
      eq(bookings.id, guestAiConciergeSessions.bookingId),
    )
    .where(eq(guestAiConciergeSessions.id, id))
    .limit(1);
  if (!row) return { session: null, messages: [], runs: [] };

  const messages = await listMessagesForSession(id, 200);
  const runs = await db
    .select()
    .from(guestAiConciergeRuns)
    .where(eq(guestAiConciergeRuns.sessionId, id))
    .orderBy(desc(guestAiConciergeRuns.startedAt))
    .limit(50);

  return {
    session: {
      ...row.s,
      tokenPrefix: row.tokenPrefix ?? null,
      bookingCode: row.bookingCode ?? null,
      messageCount: Number(row.messageCount ?? 0),
    },
    messages,
    runs,
  };
}

export async function countSessionsByStatus(): Promise<{
  active: number;
  archived: number;
  refused: number;
}> {
  const db = getDb();
  if (!db) return { active: 0, archived: 0, refused: 0 };
  const [agg] = await db
    .select({
      active: sql<number>`count(*) filter (where ${guestAiConciergeSessions.status} = 'active')`,
      archived: sql<number>`count(*) filter (where ${guestAiConciergeSessions.status} = 'archived')`,
      refused: sql<number>`(
        SELECT count(*) FROM ${guestAiConciergeMessages}
         WHERE ${guestAiConciergeMessages.safetyStatus} = 'refused'
      )`,
    })
    .from(guestAiConciergeSessions);
  return {
    active: Number(agg?.active ?? 0),
    archived: Number(agg?.archived ?? 0),
    refused: Number(agg?.refused ?? 0),
  };
}
