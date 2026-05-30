"use server";
import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import { rateLimitBuckets } from "@/lib/db/schema/saas";
import {
  checkRateLimit,
  windowStartFor,
  type RateLimitConfig,
  type RateLimitVerdict,
} from "./rate-limiting-helpers";

/**
 * Atomic check-and-increment. Reads current bucket counts for the
 * three windows, runs the pure verdict, and (if allowed) bumps the
 * minute-bucket count via UPSERT.
 *
 * The minute bucket is enough to enforce all three windows since
 * `request_count` is ratchet-only — querying SUM(request_count) across
 * all minute buckets in the hour/day window gives the higher-window
 * counts at read time.
 */
export async function checkAndIncrementRateLimit(args: {
  apiKeyId: string;
  config: RateLimitConfig;
}): Promise<RateLimitVerdict> {
  const db = getDb();
  if (!db) {
    return {
      allowed: true,
      retryAfterSeconds: 0,
      remaining: { minute: 0, hour: 0, day: 0 },
    };
  }
  const now = new Date();
  const minuteStart = windowStartFor("minute", now);
  const hourStart = windowStartFor("hour", now);
  const dayStart = windowStartFor("day", now);

  const counts = await db.execute<{
    minute_count: string;
    hour_count: string;
    day_count: string;
  }>(sql`
    SELECT
      COALESCE(SUM(CASE WHEN window_start = ${minuteStart.toISOString()}::timestamptz THEN request_count ELSE 0 END), 0)::text AS minute_count,
      COALESCE(SUM(CASE WHEN window_start >= ${hourStart.toISOString()}::timestamptz THEN request_count ELSE 0 END), 0)::text AS hour_count,
      COALESCE(SUM(CASE WHEN window_start >= ${dayStart.toISOString()}::timestamptz THEN request_count ELSE 0 END), 0)::text AS day_count
    FROM rate_limit_buckets
    WHERE api_key_id = ${args.apiKeyId}::uuid
      AND window_type = 'minute'
      AND window_start >= ${dayStart.toISOString()}::timestamptz
  `);
  const row =
    rowsOf<{
        minute_count: string;
        hour_count: string;
        day_count: string;
      }>(counts)[0] ?? null;

  const verdict = checkRateLimit(args.config, {
    minuteCount: Number(row?.minute_count ?? "0"),
    hourCount: Number(row?.hour_count ?? "0"),
    dayCount: Number(row?.day_count ?? "0"),
  });

  if (verdict.allowed) {
    await db
      .insert(rateLimitBuckets)
      .values({
        apiKeyId: args.apiKeyId,
        windowType: "minute",
        windowStart: minuteStart,
        requestCount: 1,
      })
      .onConflictDoUpdate({
        target: [
          rateLimitBuckets.apiKeyId,
          rateLimitBuckets.windowType,
          rateLimitBuckets.windowStart,
        ],
        set: {
          requestCount: sql`${rateLimitBuckets.requestCount} + 1`,
        },
      });
  }

  return verdict;
}
