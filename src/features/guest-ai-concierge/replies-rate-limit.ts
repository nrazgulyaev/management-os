import "server-only";

import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  guestAiHandoffReplies,
  guestAiHandoffs,
} from "@/lib/db/schema/guest-ai-concierge";

/**
 * Pure-shaped rate limiter for guest replies. Caps:
 *   • 10 replies / handoff / hour
 *   • 30 replies / token / hour
 *
 * Counted directly off the persisted reply log so no extra counter
 * row exists. Returns `{ allowed: false, reason }` when blocked.
 */

const HOUR_MS = 60 * 60 * 1000;
const PER_HANDOFF = 10;
const PER_TOKEN = 30;

export type GuestReplyRateOutcome =
  | { allowed: true }
  | {
      allowed: false;
      reason: "per_handoff" | "per_token";
      retryAfterMs: number;
    };

export async function rateLimitGuestReply(args: {
  handoffId: string;
  guestStayTokenId: string;
  now?: Date;
}): Promise<GuestReplyRateOutcome> {
  const now = args.now ?? new Date();
  const since = new Date(now.getTime() - HOUR_MS);
  const db = getDb();
  if (!db) return { allowed: true };

  // Per-handoff count (guest replies only).
  const [perHandoff] = await db
    .select({
      c: sql<number>`count(*)`,
      oldest: sql<Date | null>`min(${guestAiHandoffReplies.createdAt})`,
    })
    .from(guestAiHandoffReplies)
    .where(
      and(
        eq(guestAiHandoffReplies.handoffId, args.handoffId),
        eq(guestAiHandoffReplies.authorType, "guest"),
        gte(guestAiHandoffReplies.createdAt, since),
      ),
    );
  if (Number(perHandoff?.c ?? 0) >= PER_HANDOFF) {
    const oldest = perHandoff?.oldest ?? since;
    return {
      allowed: false,
      reason: "per_handoff",
      retryAfterMs: Math.max(60_000, oldest.getTime() + HOUR_MS - now.getTime()),
    };
  }

  // Per-token count across all handoffs for this stay token.
  const [perToken] = await db
    .select({
      c: sql<number>`count(*)`,
      oldest: sql<Date | null>`min(${guestAiHandoffReplies.createdAt})`,
    })
    .from(guestAiHandoffReplies)
    .innerJoin(
      guestAiHandoffs,
      eq(guestAiHandoffs.id, guestAiHandoffReplies.handoffId),
    )
    .where(
      and(
        eq(guestAiHandoffs.guestStayTokenId, args.guestStayTokenId),
        eq(guestAiHandoffReplies.authorType, "guest"),
        gte(guestAiHandoffReplies.createdAt, since),
      ),
    );
  if (Number(perToken?.c ?? 0) >= PER_TOKEN) {
    const oldest = perToken?.oldest ?? since;
    return {
      allowed: false,
      reason: "per_token",
      retryAfterMs: Math.max(60_000, oldest.getTime() + HOUR_MS - now.getTime()),
    };
  }

  return { allowed: true };
}
