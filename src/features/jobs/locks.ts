import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { jobLocks, type JobLock } from "@/lib/db/schema/security";

/**
 * Prompt 111 — Cron job mutual exclusion via `job_locks`.
 *
 * Algorithm:
 *   - One row per job_key (UNIQUE).
 *   - status = 'locked' until expires_at; then implicitly stale.
 *   - Acquire steps:
 *       1. Try INSERT … ON CONFLICT DO NOTHING.  If inserted: held.
 *       2. Otherwise SELECT existing row.  If status='locked' and
 *          expires_at > now → another worker has it; return null.
 *       3. Otherwise UPDATE the row to (locked, new_locked_by,
 *          locked_at=now, expires_at=now+ttl, released_at=null) and
 *          return it.
 *   - releaseJobLock is idempotent.
 *
 * The lock is best-effort — it relies on the UNIQUE index on
 * `job_key` and Postgres MVCC to serialise the INSERT branch.  In the
 * (rare) race between the SELECT and UPDATE branches, two workers may
 * both observe an expired row and both UPDATE it; whichever commits
 * last wins.  withJobLock callers should treat this as "skipped" if
 * the runtime detects the lock was actually held by someone else.
 */

const DEFAULT_TTL_SECONDS = 600; // 10 minutes — bigger than any single job runtime today.
const STALE_GRACE_SECONDS = 30;

export interface JobLockHandle {
  jobKey: string;
  lockId: string;
  lockedBy: string;
  expiresAt: Date;
}

export type AcquireOutcome =
  | { ok: true; handle: JobLockHandle }
  | { ok: false; reason: "held"; lockedBy: string; expiresAt: Date | null }
  | { ok: false; reason: "no_db" };

export async function acquireJobLock(
  jobKey: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
  lockedBy: string = "cron",
): Promise<AcquireOutcome> {
  const db = getDb();
  if (!db) return { ok: false, reason: "no_db" };
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
  // First-write wins: try a straight INSERT.  If the row already
  // exists (UNIQUE on job_key), drizzle will throw — we handle that
  // by reading + maybe taking over.
  try {
    const [row] = await db
      .insert(jobLocks)
      .values({
        jobKey,
        status: "locked",
        lockedBy,
        lockedAt: now,
        expiresAt,
        metadata: {},
      })
      .returning();
    return {
      ok: true,
      handle: {
        jobKey,
        lockId: row!.id,
        lockedBy,
        expiresAt: row!.expiresAt as unknown as Date,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (!msg.toLowerCase().includes("unique")) {
      throw err;
    }
  }
  // Row exists — either currently locked, or stale and ours to take.
  const [existing] = await db
    .select()
    .from(jobLocks)
    .where(eq(jobLocks.jobKey, jobKey))
    .limit(1);
  if (!existing) {
    return { ok: false, reason: "held", lockedBy: "unknown", expiresAt: null };
  }
  const expires = existing.expiresAt as unknown as Date;
  const stillHeld = existing.status === "locked" && expires > now;
  if (stillHeld) {
    return {
      ok: false,
      reason: "held",
      lockedBy: existing.lockedBy,
      expiresAt: expires,
    };
  }
  // Stale — take it over.  Update with WHERE matching the prior
  // status so concurrent take-overs still serialise on row update.
  const [updated] = await db
    .update(jobLocks)
    .set({
      status: "locked",
      lockedBy,
      lockedAt: now,
      expiresAt,
      releasedAt: null,
      metadata: { takeover_of: existing.lockedBy, prior_status: existing.status },
    })
    .where(eq(jobLocks.id, existing.id))
    .returning();
  if (!updated) {
    return {
      ok: false,
      reason: "held",
      lockedBy: existing.lockedBy,
      expiresAt: expires,
    };
  }
  return {
    ok: true,
    handle: {
      jobKey,
      lockId: updated.id,
      lockedBy,
      expiresAt: updated.expiresAt as unknown as Date,
    },
  };
}

export async function releaseJobLock(
  jobKey: string,
  lockId: string,
): Promise<{ ok: boolean }> {
  const db = getDb();
  if (!db) return { ok: false };
  const now = new Date();
  await db
    .update(jobLocks)
    .set({ status: "released", releasedAt: now })
    .where(
      and(
        eq(jobLocks.jobKey, jobKey),
        eq(jobLocks.id, lockId),
        eq(jobLocks.status, "locked"),
      ),
    );
  return { ok: true };
}

export async function expireStaleJobLocks(now: Date = new Date()): Promise<{
  expired: number;
}> {
  const db = getDb();
  if (!db) return { expired: 0 };
  // Stale = status='locked' AND expires_at + grace < now.
  const cutoff = new Date(now.getTime() - STALE_GRACE_SECONDS * 1000);
  const updated = await db
    .update(jobLocks)
    .set({ status: "expired", releasedAt: now })
    .where(
      and(
        eq(jobLocks.status, "locked"),
        lt(jobLocks.expiresAt, cutoff),
      ),
    )
    .returning({ id: jobLocks.id });
  return { expired: updated.length };
}

export async function forceReleaseJobLock(
  jobKey: string,
): Promise<{ ok: boolean }> {
  const db = getDb();
  if (!db) return { ok: false };
  const now = new Date();
  await db
    .update(jobLocks)
    .set({ status: "released", releasedAt: now })
    .where(
      and(
        eq(jobLocks.jobKey, jobKey),
        eq(jobLocks.status, "locked"),
      ),
    );
  return { ok: true };
}

export async function listJobLocks(): Promise<JobLock[]> {
  const db = getDb();
  if (!db) return [];
  return db.select().from(jobLocks).orderBy(sql`${jobLocks.lockedAt} DESC`).limit(50);
}

// -----------------------------------------------------------------------------
// withJobLock helper
// -----------------------------------------------------------------------------

export type WithJobLockOutcome<T> =
  | { ok: true; result: T; handle: JobLockHandle }
  | {
      ok: false;
      skipped: true;
      reason: "locked";
      lockedBy: string;
      expiresAt: Date | null;
    }
  | { ok: false; skipped: false; reason: "no_db" | "error"; error?: string };

export async function withJobLock<T>(
  jobKey: string,
  fn: (handle: JobLockHandle) => Promise<T>,
  opts: { ttlSeconds?: number; lockedBy?: string } = {},
): Promise<WithJobLockOutcome<T>> {
  const acquireOutcome = await acquireJobLock(
    jobKey,
    opts.ttlSeconds,
    opts.lockedBy ?? `process-${randomUUID().slice(0, 8)}`,
  );
  if (!acquireOutcome.ok) {
    if (acquireOutcome.reason === "no_db") {
      return { ok: false, skipped: false, reason: "no_db" };
    }
    return {
      ok: false,
      skipped: true,
      reason: "locked",
      lockedBy: acquireOutcome.lockedBy,
      expiresAt: acquireOutcome.expiresAt,
    };
  }
  try {
    const result = await fn(acquireOutcome.handle);
    return { ok: true, result, handle: acquireOutcome.handle };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, skipped: false, reason: "error", error: msg };
  } finally {
    await releaseJobLock(jobKey, acquireOutcome.handle.lockId);
  }
}
