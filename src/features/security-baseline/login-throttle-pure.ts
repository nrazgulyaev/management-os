/**
 * Prompt 111 — Pure helpers for login throttling.  No DB, no
 * `server-only` — DB lookups live in `login-throttle.ts`.
 *
 * Rules:
 *   - `LOGIN_MAX_FAILED_PER_EMAIL` failures within the rolling 10-minute
 *     window → lock that email for `LOGIN_LOCK_MINUTES`.
 *   - `LOGIN_MAX_FAILED_PER_IP` failures within the rolling 10-minute
 *     window → lock that IP hash for `LOGIN_LOCK_MINUTES`.
 *   - A successful login does NOT scrub the historical record.
 */

export interface LoginAttemptRow {
  succeeded: boolean;
  createdAt: Date;
  lockedUntil: Date | null;
}

export interface ThrottleConfig {
  maxFailedPerEmail: number;
  maxFailedPerIp: number;
  windowMinutes: number;
  lockMinutes: number;
}

export const DEFAULT_THROTTLE_CONFIG: ThrottleConfig = {
  maxFailedPerEmail: 5,
  maxFailedPerIp: 20,
  windowMinutes: 10,
  lockMinutes: 15,
};

export type ThrottleDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: "email_locked" | "ip_locked";
      retryAfterSeconds: number;
    };

/**
 * Pure: combine a list of recent login attempts with a target time
 * `now` and the config to produce a decision.  Pass two attempt lists
 * (per-email and per-IP) — the longer list with active lock wins.
 */
export function decideLoginThrottle(input: {
  emailAttempts: ReadonlyArray<LoginAttemptRow>;
  ipAttempts: ReadonlyArray<LoginAttemptRow>;
  now: Date;
  config?: Partial<ThrottleConfig>;
}): ThrottleDecision {
  const cfg = { ...DEFAULT_THROTTLE_CONFIG, ...(input.config ?? {}) };
  const now = input.now;
  const windowStart = new Date(now.getTime() - cfg.windowMinutes * 60 * 1000);

  // Active lock-until from any prior attempt wins immediately.
  const emailLock = activeLockUntil(input.emailAttempts, now);
  if (emailLock) {
    return {
      allowed: false,
      reason: "email_locked",
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((emailLock.getTime() - now.getTime()) / 1000),
      ),
    };
  }
  const ipLock = activeLockUntil(input.ipAttempts, now);
  if (ipLock) {
    return {
      allowed: false,
      reason: "ip_locked",
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((ipLock.getTime() - now.getTime()) / 1000),
      ),
    };
  }

  const emailFailures = input.emailAttempts.filter(
    (a) => !a.succeeded && a.createdAt >= windowStart,
  ).length;
  const ipFailures = input.ipAttempts.filter(
    (a) => !a.succeeded && a.createdAt >= windowStart,
  ).length;
  if (emailFailures >= cfg.maxFailedPerEmail) {
    return {
      allowed: false,
      reason: "email_locked",
      retryAfterSeconds: cfg.lockMinutes * 60,
    };
  }
  if (ipFailures >= cfg.maxFailedPerIp) {
    return {
      allowed: false,
      reason: "ip_locked",
      retryAfterSeconds: cfg.lockMinutes * 60,
    };
  }
  return { allowed: true };
}

function activeLockUntil(
  attempts: ReadonlyArray<LoginAttemptRow>,
  now: Date,
): Date | null {
  let latest: Date | null = null;
  for (const a of attempts) {
    if (a.lockedUntil && a.lockedUntil > now) {
      if (!latest || a.lockedUntil > latest) latest = a.lockedUntil;
    }
  }
  return latest;
}

/**
 * Pure: given the post-throttle state, decide whether a *new* lock
 * should be written (i.e. this attempt is the one that crossed the
 * threshold).  Returns the lock expiry, or null when no new lock
 * should be persisted.
 */
export function newLockUntilForAttempt(input: {
  recentEmailFailures: number;
  recentIpFailures: number;
  now: Date;
  config?: Partial<ThrottleConfig>;
}): { lockedUntil: Date; reason: "email_locked" | "ip_locked" } | null {
  const cfg = { ...DEFAULT_THROTTLE_CONFIG, ...(input.config ?? {}) };
  const lockEnd = new Date(input.now.getTime() + cfg.lockMinutes * 60 * 1000);
  if (input.recentEmailFailures >= cfg.maxFailedPerEmail) {
    return { lockedUntil: lockEnd, reason: "email_locked" };
  }
  if (input.recentIpFailures >= cfg.maxFailedPerIp) {
    return { lockedUntil: lockEnd, reason: "ip_locked" };
  }
  return null;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
