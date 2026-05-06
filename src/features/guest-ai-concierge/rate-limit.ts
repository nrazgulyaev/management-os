import "server-only";

import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  guestAiConciergeMessages,
  guestAiConciergeSessions,
} from "@/lib/db/schema/guest-ai-concierge";
import {
  CONCIERGE_RATE_POLICIES,
  evaluateConciergeRate,
  type ConciergeRateOutcome,
  type ConciergeRateState,
} from "./rate-limit-pure";

/**
 * Stateless server wrapper. We don't persist a separate counter row
 * for the concierge — instead we re-derive the rolling counts from
 * the message log, since rates are low. Keeps the schema lean and
 * means the limiter is consistent with what's actually stored.
 */
export async function rateLimitConciergeMessage(args: {
  guestStayTokenId: string;
  now?: Date;
}): Promise<ConciergeRateOutcome> {
  const now = args.now ?? new Date();
  const db = getDb();
  if (!db) {
    return evaluateConciergeRate(null, now);
  }
  // Look at the user message stream for this token.
  const sinceHour = new Date(
    now.getTime() - CONCIERGE_RATE_POLICIES.hour.windowMs,
  );
  const sinceMinute = new Date(
    now.getTime() - CONCIERGE_RATE_POLICIES.minute.windowMs,
  );
  const [agg] = await db
    .select({
      hourCount: sql<number>`count(*) filter (where ${guestAiConciergeMessages.role} = 'user' and ${guestAiConciergeMessages.createdAt} >= ${sinceHour.toISOString()})`,
      hourFirst: sql<Date | null>`min(${guestAiConciergeMessages.createdAt}) filter (where ${guestAiConciergeMessages.role} = 'user' and ${guestAiConciergeMessages.createdAt} >= ${sinceHour.toISOString()})`,
      minuteCount: sql<number>`count(*) filter (where ${guestAiConciergeMessages.role} = 'user' and ${guestAiConciergeMessages.createdAt} >= ${sinceMinute.toISOString()})`,
      minuteFirst: sql<Date | null>`min(${guestAiConciergeMessages.createdAt}) filter (where ${guestAiConciergeMessages.role} = 'user' and ${guestAiConciergeMessages.createdAt} >= ${sinceMinute.toISOString()})`,
    })
    .from(guestAiConciergeMessages)
    .innerJoin(
      guestAiConciergeSessions,
      eq(guestAiConciergeSessions.id, guestAiConciergeMessages.sessionId),
    )
    .where(
      and(
        eq(
          guestAiConciergeSessions.guestStayTokenId,
          args.guestStayTokenId,
        ),
        gte(guestAiConciergeMessages.createdAt, sinceHour),
      ),
    );

  const prior: ConciergeRateState | null = agg
    ? {
        hour: {
          windowStart: agg.hourFirst ?? now,
          count: Number(agg.hourCount ?? 0),
          blockedUntil: null,
        },
        minute: {
          windowStart: agg.minuteFirst ?? now,
          count: Number(agg.minuteCount ?? 0),
          blockedUntil: null,
        },
      }
    : null;

  return evaluateConciergeRate(prior, now);
}
