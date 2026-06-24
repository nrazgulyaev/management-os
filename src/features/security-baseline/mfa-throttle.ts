import "server-only";

import { and, count, eq, gte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { authSecurityEvents } from "@/lib/db/schema/security";
import {
  isLoginThrottleEnabled,
  mfaFailureWindowMinutes,
  mfaMaxFailedPerUser,
} from "@/lib/env";

/**
 * MFA-THROTTLE-1 — brute-force protection for the second-factor challenge.
 *
 * The TOTP-challenge and recovery-code actions had NO attempt limit: an
 * attacker who phished a password (clearing the first factor) could grind
 * a 6-digit TOTP or a recovery code unbounded behind the `mfa_pending`
 * session. This reuses the login-throttle pattern — count recent FAILURES
 * in a rolling window and lock once the threshold is crossed — but keyed on
 * the `app_user_id` rather than email/IP, because the `mfa_pending` session
 * is already bound to exactly one user.
 *
 * No new table: every failed challenge already writes an `mfa_failed`
 * security event (recordSecurityEvent in mfa-actions). We count those for
 * the user inside the window. The window is rolling, so the lock naturally
 * clears once the user stops failing for `windowMinutes`; the caller also
 * drops the `mfa_pending` marker so a locked user must re-authenticate
 * (re-establishing a fresh session) before retrying — which itself runs the
 * login throttle.
 *
 * Fail-open: no DB / throttle disabled → { allowed: true }. We never lock a
 * legitimate user out on an infrastructure error.
 */

export type MfaThrottleDecision =
  | { allowed: true }
  | { allowed: false; recentFailures: number; maxFailures: number };

/**
 * Decide whether the user may make another second-factor attempt. Counts
 * `mfa_failed` events for the user within the rolling window (both the TOTP
 * challenge and recovery-code stages write this event type, so both feed the
 * same per-user counter).
 */
export async function checkMfaThrottle(
  appUserId: string,
  now: Date = new Date(),
): Promise<MfaThrottleDecision> {
  if (!isLoginThrottleEnabled()) return { allowed: true };
  const db = getDb();
  if (!db) return { allowed: true };

  const maxFailures = mfaMaxFailedPerUser();
  const windowStart = new Date(
    now.getTime() - mfaFailureWindowMinutes() * 60 * 1000,
  );

  try {
    const [row] = await db
      .select({ value: count() })
      .from(authSecurityEvents)
      .where(
        and(
          eq(authSecurityEvents.appUserId, appUserId),
          eq(authSecurityEvents.eventType, "mfa_failed"),
          gte(authSecurityEvents.createdAt, windowStart),
        ),
      );
    const recentFailures = Number(row?.value ?? 0);
    if (recentFailures >= maxFailures) {
      return { allowed: false, recentFailures, maxFailures };
    }
    return { allowed: true };
  } catch {
    // Counting failed — fall open, never lock a legitimate user out.
    return { allowed: true };
  }
}

/**
 * Count the user's `mfa_failed` events in the current window INCLUDING any
 * just-written one. Lets the action decide, immediately after recording a
 * failure, whether to lock the session now rather than waiting for the next
 * request.
 */
export async function countRecentMfaFailures(
  appUserId: string,
  now: Date = new Date(),
): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const windowStart = new Date(
    now.getTime() - mfaFailureWindowMinutes() * 60 * 1000,
  );
  try {
    const [row] = await db
      .select({ value: count() })
      .from(authSecurityEvents)
      .where(
        and(
          eq(authSecurityEvents.appUserId, appUserId),
          eq(authSecurityEvents.eventType, "mfa_failed"),
          gte(authSecurityEvents.createdAt, windowStart),
        ),
      );
    return Number(row?.value ?? 0);
  } catch {
    return 0;
  }
}
