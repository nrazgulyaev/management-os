import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  authLoginAttempts,
  authSecurityEvents,
} from "@/lib/db/schema/security";

/**
 * Stage 10.M.2 — Per-user (self-serve) account security read surfaces.
 *
 * Org-wide / admin-facing variants live in
 * `src/features/security-baseline/{login-throttle,mfa-services}.ts`.
 * The functions here scope every query by `appUserId` so they're safe
 * to expose on the per-user `/dashboard/settings/account-security`
 * page without leaking other users' data.
 */

export interface MyLoginAttempt {
  id: string;
  succeeded: boolean;
  failureReason: string | null;
  lockedUntil: string | null;
  ipHash: string | null;
  createdAt: string;
}

export interface MySecurityEvent {
  id: string;
  eventType: string;
  severity: string;
  ipHash: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export async function listMyLoginAttempts(
  appUserId: string,
  limit = 20,
): Promise<MyLoginAttempt[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: authLoginAttempts.id,
      succeeded: authLoginAttempts.succeeded,
      failureReason: authLoginAttempts.failureReason,
      lockedUntil: authLoginAttempts.lockedUntil,
      ipHash: authLoginAttempts.ipHash,
      createdAt: authLoginAttempts.createdAt,
    })
    .from(authLoginAttempts)
    .where(eq(authLoginAttempts.appUserId, appUserId))
    .orderBy(desc(authLoginAttempts.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    succeeded: r.succeeded,
    failureReason: r.failureReason,
    lockedUntil: r.lockedUntil ? r.lockedUntil.toISOString() : null,
    ipHash: r.ipHash,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function listMySecurityEvents(
  appUserId: string,
  limit = 20,
): Promise<MySecurityEvent[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: authSecurityEvents.id,
      eventType: authSecurityEvents.eventType,
      severity: authSecurityEvents.severity,
      ipHash: authSecurityEvents.ipHash,
      metadata: authSecurityEvents.metadata,
      createdAt: authSecurityEvents.createdAt,
    })
    .from(authSecurityEvents)
    .where(eq(authSecurityEvents.appUserId, appUserId))
    .orderBy(desc(authSecurityEvents.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    eventType: r.eventType,
    severity: r.severity,
    ipHash: r.ipHash,
    metadata: (r.metadata ?? {}) as Record<string, unknown>,
    createdAt: r.createdAt.toISOString(),
  }));
}

export interface MyAccountSecuritySummary {
  lastSuccessfulLoginAt: string | null;
  lastFailedLoginAt: string | null;
  failedAttemptsLast30Days: number;
  securityEventsLast30Days: number;
}

export async function summarizeMyAccountSecurity(
  appUserId: string,
): Promise<MyAccountSecuritySummary> {
  const db = getDb();
  const empty: MyAccountSecuritySummary = {
    lastSuccessfulLoginAt: null,
    lastFailedLoginAt: null,
    failedAttemptsLast30Days: 0,
    securityEventsLast30Days: 0,
  };
  if (!db) return empty;

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [lastSuccess] = await db
    .select({ createdAt: authLoginAttempts.createdAt })
    .from(authLoginAttempts)
    .where(
      and(
        eq(authLoginAttempts.appUserId, appUserId),
        eq(authLoginAttempts.succeeded, true),
      ),
    )
    .orderBy(desc(authLoginAttempts.createdAt))
    .limit(1);

  const [lastFail] = await db
    .select({ createdAt: authLoginAttempts.createdAt })
    .from(authLoginAttempts)
    .where(
      and(
        eq(authLoginAttempts.appUserId, appUserId),
        eq(authLoginAttempts.succeeded, false),
      ),
    )
    .orderBy(desc(authLoginAttempts.createdAt))
    .limit(1);

  const recentFails = await db
    .select({ id: authLoginAttempts.id })
    .from(authLoginAttempts)
    .where(
      and(
        eq(authLoginAttempts.appUserId, appUserId),
        eq(authLoginAttempts.succeeded, false),
      ),
    );

  const recentEvents = await db
    .select({ id: authSecurityEvents.id, createdAt: authSecurityEvents.createdAt })
    .from(authSecurityEvents)
    .where(eq(authSecurityEvents.appUserId, appUserId));

  return {
    lastSuccessfulLoginAt: lastSuccess?.createdAt
      ? lastSuccess.createdAt.toISOString()
      : null,
    lastFailedLoginAt: lastFail?.createdAt
      ? lastFail.createdAt.toISOString()
      : null,
    failedAttemptsLast30Days: recentFails.length,
    securityEventsLast30Days: recentEvents.filter(
      (e) => e.createdAt >= cutoff,
    ).length,
  };
}
