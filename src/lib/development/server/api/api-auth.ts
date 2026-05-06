import "server-only";

import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { apiKeys, apiRequestLog } from "@/lib/db/schema/saas";
import {
  hashApiKey,
  parseKeyPrefix,
  scopeAllowed,
} from "./api-key-helpers";
import {
  checkAndIncrementRateLimit,
} from "./rate-limiting-actions";

export interface AuthenticatedApiContext {
  apiKeyId: string;
  organizationId: string;
  scopes: string[];
  rateLimit: {
    perMinute: number;
    perHour: number;
    perDay: number;
  };
}

export type ApiAuthResult =
  | { ok: true; ctx: AuthenticatedApiContext }
  | { ok: false; status: number; error: string; retryAfterSeconds?: number };

/**
 * Validate an incoming `Authorization: Bearer <key>` header against
 * the API key registry, run rate-limiting, and return an authenticated
 * context (or an error verdict).
 *
 * All API routes funnel through this single helper so org isolation
 * + rate limiting + scope check happen in exactly one place.
 */
export async function authenticateApiRequest(args: {
  authorizationHeader: string | null;
  requiredScope: string;
}): Promise<ApiAuthResult> {
  if (!args.authorizationHeader) {
    return { ok: false, status: 401, error: "Authorization header required" };
  }
  const match = /^Bearer\s+(\S+)\s*$/i.exec(args.authorizationHeader);
  if (!match) {
    return { ok: false, status: 401, error: "Bearer token required" };
  }
  const fullKey = match[1];
  if (!parseKeyPrefix(fullKey)) {
    return { ok: false, status: 401, error: "Invalid key format" };
  }
  const db = getDb();
  if (!db) {
    return { ok: false, status: 503, error: "DB unavailable" };
  }
  const hash = hashApiKey(fullKey);
  const rows = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hash))
    .limit(1);
  const key = rows[0];
  if (!key || !key.isActive) {
    return { ok: false, status: 401, error: "Invalid or revoked key" };
  }
  if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
    return { ok: false, status: 401, error: "Key expired" };
  }
  if (!scopeAllowed(args.requiredScope, key.scopes ?? [])) {
    return {
      ok: false,
      status: 403,
      error: `Missing scope: ${args.requiredScope}`,
    };
  }

  const verdict = await checkAndIncrementRateLimit({
    apiKeyId: key.id,
    config: {
      perMinute: key.rateLimitPerMinute,
      perHour: key.rateLimitPerHour,
      perDay: key.rateLimitPerDay,
    },
  });
  if (!verdict.allowed) {
    return {
      ok: false,
      status: 429,
      error: `Rate limit exceeded (${verdict.reason})`,
      retryAfterSeconds: verdict.retryAfterSeconds,
    };
  }

  // Bump usage counters (last_used_at + total_requests) eventually
  // (kept off the hot path — handled by cron-or-batched updates later).
  await db
    .update(apiKeys)
    .set({
      lastUsedAt: new Date(),
      totalRequests: sql`${apiKeys.totalRequests} + 1`,
    })
    .where(eq(apiKeys.id, key.id));

  return {
    ok: true,
    ctx: {
      apiKeyId: key.id,
      organizationId: key.organizationId,
      scopes: key.scopes ?? [],
      rateLimit: {
        perMinute: key.rateLimitPerMinute,
        perHour: key.rateLimitPerHour,
        perDay: key.rateLimitPerDay,
      },
    },
  };
}

/**
 * Persist a single API request log entry. Called from each API route
 * after handling.
 */
export async function logApiRequest(args: {
  apiKeyId: string;
  organizationId: string;
  method: string;
  endpoint: string;
  statusCode: number;
  durationMs: number;
  wasRateLimited?: boolean;
  errorMessage?: string;
  ipAddress?: string;
  userAgent?: string;
  rateLimitRemaining?: number;
}): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.insert(apiRequestLog).values({
    apiKeyId: args.apiKeyId,
    organizationId: args.organizationId,
    method: args.method,
    endpoint: args.endpoint,
    statusCode: args.statusCode,
    durationMs: args.durationMs,
    wasRateLimited: args.wasRateLimited ?? false,
    errorMessage: args.errorMessage ?? null,
    ipAddress: args.ipAddress ?? null,
    userAgent: args.userAgent ?? null,
    rateLimitRemaining: args.rateLimitRemaining ?? null,
  });
}
