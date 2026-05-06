import "server-only";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { guestStayRateLimits } from "@/lib/db/schema/guest-stay-security";
import { hashIpForLog } from "./token";
import { recordSecurityEvent } from "./security";
import {
  evaluateRateLimit,
  type RateLimitKind,
  type RateLimitOutcome,
} from "./rate-limit-pure";

/**
 * Server-side rate limiter. Reads the row keyed on (token_prefix, ip_hash),
 * computes the next state via the pure helper, and writes it back. Logs
 * a `token_rate_limited` security event the moment we transition from
 * "allowed" to "blocked" so operators see it once instead of once per
 * request.
 */
export async function rateLimitStayTokenAccess(args: {
  tokenPrefix: string;
  ip: string | null;
  kind?: RateLimitKind;
  bookingId?: string | null;
  guestStayTokenId?: string | null;
  now?: Date;
}): Promise<RateLimitOutcome & { ipHash: string }> {
  const ipHash = hashIpForLog(args.ip) ?? "unknown";
  const kind = args.kind ?? "token_access";
  const now = args.now ?? new Date();
  const db = getDb();
  if (!db) {
    // Without a DB we cannot persist counters — fail open for SSR demo
    // mode but never log it as "ok" with state, since callers may rely
    // on the returned `state` being persisted.
    return {
      allowed: true,
      state: { windowStart: now, requestCount: 1, blockedUntil: null },
      ipHash,
    };
  }
  const [prior] = await db
    .select()
    .from(guestStayRateLimits)
    .where(
      and(
        eq(guestStayRateLimits.tokenPrefix, args.tokenPrefix),
        eq(guestStayRateLimits.ipHash, ipHash),
      ),
    )
    .limit(1);

  const outcome = evaluateRateLimit(
    prior
      ? {
          windowStart: prior.windowStart,
          requestCount: prior.requestCount,
          blockedUntil: prior.blockedUntil ?? null,
        }
      : null,
    kind,
    now,
  );

  if (!prior) {
    await db.insert(guestStayRateLimits).values({
      tokenPrefix: args.tokenPrefix,
      ipHash,
      windowStart: outcome.state.windowStart,
      requestCount: outcome.state.requestCount,
      blockedUntil: outcome.state.blockedUntil,
    });
  } else {
    await db
      .update(guestStayRateLimits)
      .set({
        windowStart: outcome.state.windowStart,
        requestCount: outcome.state.requestCount,
        blockedUntil: outcome.state.blockedUntil,
        updatedAt: now,
      })
      .where(eq(guestStayRateLimits.id, prior.id));
  }

  // Log only on the transition into a block (not on every blocked request).
  if (
    !outcome.allowed &&
    (!prior?.blockedUntil ||
      prior.blockedUntil.getTime() < now.getTime())
  ) {
    await recordSecurityEvent({
      eventType: "token_rate_limited",
      severity: "high",
      guestStayTokenId: args.guestStayTokenId ?? null,
      bookingId: args.bookingId ?? null,
      ipHash,
      metadata: {
        tokenPrefix: args.tokenPrefix,
        kind,
        blockedUntil: outcome.state.blockedUntil?.toISOString() ?? null,
        requestCount: outcome.state.requestCount,
      },
    });
  }

  return { ...outcome, ipHash };
}
