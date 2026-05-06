import "server-only";

import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { guestAiHandoffs } from "@/lib/db/schema/guest-ai-concierge";

/**
 * Pure-shaped rate limiter for the v9I handoff. Counts existing rows
 * directly so the limiter is consistent with what's actually
 * persisted (no separate counter table).
 *
 * Policy:
 *   max 5 handoffs / token / hour
 *   max 2 urgent  / token / hour
 */

const HOUR_MS = 60 * 60 * 1000;
const MAX_PER_HOUR = 5;
const MAX_URGENT_PER_HOUR = 2;

export type HandoffRateOutcome =
  | { allowed: true }
  | {
      allowed: false;
      reason: "hourly_total" | "hourly_urgent";
      retryAfterMs: number;
    };

export async function rateLimitHandoff(args: {
  guestStayTokenId: string;
  isUrgent: boolean;
  now?: Date;
}): Promise<HandoffRateOutcome> {
  const now = args.now ?? new Date();
  const since = new Date(now.getTime() - HOUR_MS);
  const db = getDb();
  if (!db) return { allowed: true };
  const [row] = await db
    .select({
      total: sql<number>`count(*)`,
      urgent: sql<number>`count(*) filter (where ${guestAiHandoffs.priority} = 'urgent')`,
      oldest: sql<Date | null>`min(${guestAiHandoffs.createdAt})`,
    })
    .from(guestAiHandoffs)
    .where(
      and(
        eq(guestAiHandoffs.guestStayTokenId, args.guestStayTokenId),
        gte(guestAiHandoffs.createdAt, since),
      ),
    );
  const total = Number(row?.total ?? 0);
  const urgent = Number(row?.urgent ?? 0);
  if (total >= MAX_PER_HOUR) {
    const oldest = row?.oldest ?? since;
    return {
      allowed: false,
      reason: "hourly_total",
      retryAfterMs: Math.max(
        60_000,
        oldest.getTime() + HOUR_MS - now.getTime(),
      ),
    };
  }
  if (args.isUrgent && urgent >= MAX_URGENT_PER_HOUR) {
    const oldest = row?.oldest ?? since;
    return {
      allowed: false,
      reason: "hourly_urgent",
      retryAfterMs: Math.max(
        60_000,
        oldest.getTime() + HOUR_MS - now.getTime(),
      ),
    };
  }
  return { allowed: true };
}
