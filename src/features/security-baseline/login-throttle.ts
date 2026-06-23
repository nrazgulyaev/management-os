import "server-only";

import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { authLoginAttempts } from "@/lib/db/schema/security";
import { appUsers } from "@/lib/db/schema/identity";
import { requireOrgId } from "@/features/auth/require-org";
import {
  decideLoginThrottle,
  newLockUntilForAttempt,
  normalizeEmail,
  type LoginAttemptRow,
  type ThrottleDecision,
} from "./login-throttle-pure";
import {
  isLoginThrottleEnabled,
  loginLockMinutes,
  loginMaxFailedPerEmail,
  loginMaxFailedPerIp,
} from "@/lib/env";
import {
  hashSecurityIdentifier,
  recordSecurityEvent,
} from "./security-events";

const WINDOW_MINUTES = 10;

function configFromEnv() {
  return {
    maxFailedPerEmail: loginMaxFailedPerEmail(),
    maxFailedPerIp: loginMaxFailedPerIp(),
    windowMinutes: WINDOW_MINUTES,
    lockMinutes: loginLockMinutes(),
  };
}

async function recentAttempts(
  filter: "email" | "ip",
  identifier: string | null,
  windowStart: Date,
): Promise<LoginAttemptRow[]> {
  if (!identifier) return [];
  const db = getDb();
  if (!db) return [];
  const where =
    filter === "email"
      ? and(
          eq(authLoginAttempts.emailNormalized, identifier),
          gte(authLoginAttempts.createdAt, windowStart),
        )
      : and(
          eq(authLoginAttempts.ipHash, identifier),
          gte(authLoginAttempts.createdAt, windowStart),
        );
  const rows = await db
    .select({
      succeeded: authLoginAttempts.succeeded,
      createdAt: authLoginAttempts.createdAt,
      lockedUntil: authLoginAttempts.lockedUntil,
    })
    .from(authLoginAttempts)
    .where(where)
    .orderBy(desc(authLoginAttempts.createdAt))
    .limit(200);
  return rows.map((r) => ({
    succeeded: r.succeeded,
    createdAt: r.createdAt as unknown as Date,
    lockedUntil: r.lockedUntil as unknown as Date | null,
  }));
}

export interface CheckThrottleInput {
  email: string;
  ip: string | null;
  now?: Date;
}

export async function checkLoginThrottle(
  input: CheckThrottleInput,
): Promise<ThrottleDecision> {
  if (!isLoginThrottleEnabled()) return { allowed: true };
  const now = input.now ?? new Date();
  const windowStart = new Date(now.getTime() - WINDOW_MINUTES * 60 * 1000);
  const emailNormalized = normalizeEmail(input.email);
  const ipHash = hashSecurityIdentifier(input.ip);
  const [emailAttempts, ipAttempts] = await Promise.all([
    recentAttempts("email", emailNormalized, windowStart),
    recentAttempts("ip", ipHash, windowStart),
  ]);
  return decideLoginThrottle({
    emailAttempts,
    ipAttempts,
    now,
    config: configFromEnv(),
  });
}

export interface RecordAttemptInput {
  email: string;
  ip: string | null;
  userAgent: string | null;
  succeeded: boolean;
  failureReason?: string | null;
  appUserId?: string | null;
}

export async function recordLoginAttempt(
  input: RecordAttemptInput,
): Promise<{ ok: true; locked: boolean }> {
  const db = getDb();
  if (!db) return { ok: true, locked: false };
  const now = new Date();
  const emailNormalized = normalizeEmail(input.email);
  const ipHash = hashSecurityIdentifier(input.ip);
  const userAgentHash = hashSecurityIdentifier(input.userAgent);

  // Compute whether this attempt crosses the threshold.
  let lockedUntil: Date | null = null;
  if (!input.succeeded) {
    const windowStart = new Date(now.getTime() - WINDOW_MINUTES * 60 * 1000);
    const [emailAttempts, ipAttempts] = await Promise.all([
      recentAttempts("email", emailNormalized, windowStart),
      recentAttempts("ip", ipHash, windowStart),
    ]);
    // Include this in-flight failure when calculating recent failures.
    const recentEmailFailures =
      emailAttempts.filter((a) => !a.succeeded).length + 1;
    const recentIpFailures =
      ipAttempts.filter((a) => !a.succeeded).length + 1;
    const lock = newLockUntilForAttempt({
      recentEmailFailures,
      recentIpFailures,
      now,
      config: configFromEnv(),
    });
    if (lock) lockedUntil = lock.lockedUntil;
  }

  // TENANCY: stamp the org when the attempt is attributable to a known
  // app_user (succeeded sign-ins + failures where the email resolved to a
  // user). Unknown-email pre-auth attempts legitimately stay NULL — there
  // is no org to attribute them to. recordLoginAttempt runs on the
  // pre-session sign-in path, so we derive the org from the known
  // appUserId rather than requireOrgId() (no session exists yet).
  let organizationId: string | null = null;
  if (input.appUserId) {
    const [owner] = await db
      .select({ organizationId: appUsers.organizationId })
      .from(appUsers)
      .where(eq(appUsers.id, input.appUserId))
      .limit(1);
    organizationId = owner?.organizationId ?? null;
  }

  await db.insert(authLoginAttempts).values({
    emailNormalized,
    appUserId: input.appUserId ?? null,
    organizationId,
    ipHash,
    userAgentHash,
    succeeded: input.succeeded,
    failureReason: input.failureReason ?? null,
    lockedUntil,
  });

  if (input.succeeded) {
    await recordSecurityEvent({
      eventType: "login_succeeded",
      appUserId: input.appUserId ?? null,
      ip: input.ip,
      userAgent: input.userAgent,
      metadata: { email: emailNormalized },
    });
  } else {
    await recordSecurityEvent({
      eventType: "login_failed",
      appUserId: input.appUserId ?? null,
      ip: input.ip,
      userAgent: input.userAgent,
      metadata: {
        email: emailNormalized,
        reason: input.failureReason ?? "unknown",
      },
    });
    if (lockedUntil) {
      await recordSecurityEvent({
        eventType: "login_locked",
        appUserId: input.appUserId ?? null,
        ip: input.ip,
        userAgent: input.userAgent,
        severity: "warning",
        metadata: {
          email: emailNormalized,
          lockedUntil: lockedUntil.toISOString(),
        },
      });
    }
  }
  return { ok: true, locked: lockedUntil !== null };
}

export interface LoginAttemptSummary {
  failedLast24h: number;
  successfulLast24h: number;
  activeLocks: number;
}

export async function summariseRecentLoginAttempts(): Promise<LoginAttemptSummary> {
  const db = getDb();
  if (!db) {
    return { failedLast24h: 0, successfulLast24h: 0, activeLocks: 0 };
  }
  const organizationId = await requireOrgId();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      succeeded: authLoginAttempts.succeeded,
      lockedUntil: authLoginAttempts.lockedUntil,
    })
    .from(authLoginAttempts)
    .where(
      and(
        eq(authLoginAttempts.organizationId, organizationId),
        gte(authLoginAttempts.createdAt, since),
      ),
    );
  const now = new Date();
  let failed = 0;
  let succeeded = 0;
  let activeLocks = 0;
  for (const r of rows) {
    if (r.succeeded) succeeded += 1;
    else failed += 1;
    if (r.lockedUntil && (r.lockedUntil as unknown as Date) > now) {
      activeLocks += 1;
    }
  }
  return {
    failedLast24h: failed,
    successfulLast24h: succeeded,
    activeLocks,
  };
}

export async function listRecentLoginAttempts(
  limit = 100,
): Promise<{
  id: string;
  emailNormalized: string | null;
  succeeded: boolean;
  failureReason: string | null;
  ipHash: string | null;
  lockedUntil: string | null;
  createdAt: string;
}[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const rows = await db
    .select()
    .from(authLoginAttempts)
    .where(eq(authLoginAttempts.organizationId, organizationId))
    .orderBy(desc(authLoginAttempts.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    emailNormalized: r.emailNormalized,
    succeeded: r.succeeded,
    failureReason: r.failureReason,
    ipHash: r.ipHash,
    lockedUntil:
      r.lockedUntil instanceof Date ? r.lockedUntil.toISOString() : null,
    createdAt:
      r.createdAt instanceof Date ? r.createdAt.toISOString() : "",
  }));
}

export async function listActiveLoginLocks(): Promise<
  { emailNormalized: string | null; ipHash: string | null; lockedUntil: string }[]
> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const now = new Date();
  const rows = await db
    .select({
      emailNormalized: authLoginAttempts.emailNormalized,
      ipHash: authLoginAttempts.ipHash,
      lockedUntil: authLoginAttempts.lockedUntil,
    })
    .from(authLoginAttempts)
    .where(
      and(
        eq(authLoginAttempts.organizationId, organizationId),
        isNotNull(authLoginAttempts.lockedUntil),
        gte(authLoginAttempts.lockedUntil, now),
      ),
    )
    .orderBy(desc(authLoginAttempts.lockedUntil))
    .limit(50);
  return rows
    .filter((r): r is typeof r & { lockedUntil: Date } => r.lockedUntil !== null)
    .map((r) => ({
      emailNormalized: r.emailNormalized,
      ipHash: r.ipHash,
      lockedUntil: r.lockedUntil.toISOString(),
    }));
}
