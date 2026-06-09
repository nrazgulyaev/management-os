import "server-only";

import { and, eq, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { jobRuns } from "@/lib/db/schema/jobs";
import { healthStaleJobMinutes } from "@/lib/env";

/**
 * OBSERVABILITY-SPINE-H — liveness/health probe backing /api/cron/health.
 *
 * Unlike /dashboard/system/health (a rich operator page), this is a thin
 * machine-readable probe for an uptime monitor. It returns HTTP 200 when the
 * platform is healthy and HTTP 503 when a threshold is breached, so a monitor
 * (BetterUptime / Pingdom / Vercel) can alert + the route can be used as a
 * deploy gate.
 *
 * Two checks today:
 *   · db        — a `SELECT 1` round-trip succeeds (DB reachable).
 *   · staleJobs — no job_run has been stuck `running` longer than the
 *                 configured threshold (a stuck job means the worker died
 *                 mid-run or a lock leaked).
 *
 * When DATABASE_URL is unset (marketing/demo deploys) the probe reports
 * `db: { ok: true, skipped: true }` — there is no DB to be down, so the
 * surface is considered healthy rather than 503.
 */

export interface HealthCheckItem {
  ok: boolean;
  /** True when the check could not run (e.g. no DB configured) — not a failure. */
  skipped?: boolean;
  detail?: string;
}

export interface HealthReport {
  /** Overall verdict. False ⇒ the route returns HTTP 503. */
  healthy: boolean;
  checkedAt: string;
  checks: {
    db: HealthCheckItem;
    staleJobs: HealthCheckItem;
  };
}

export async function evaluateHealth(): Promise<HealthReport> {
  const checkedAt = new Date().toISOString();
  const db = getDb();

  if (!db) {
    // No backend wired (demo / marketing). Nothing can be "down".
    return {
      healthy: true,
      checkedAt,
      checks: {
        db: { ok: true, skipped: true, detail: "DATABASE_URL not configured" },
        staleJobs: { ok: true, skipped: true, detail: "no DB to inspect" },
      },
    };
  }

  // ---- Check 1: DB connectivity --------------------------------------------
  let dbCheck: HealthCheckItem;
  try {
    await db.execute(sql`SELECT 1`);
    dbCheck = { ok: true };
  } catch (e) {
    dbCheck = {
      ok: false,
      detail: e instanceof Error ? e.message : "SELECT 1 failed",
    };
  }

  // ---- Check 2: stale running jobs -----------------------------------------
  // If the DB is already down, skip the job query (it would just rethrow the
  // same connectivity error); the db check alone drives the 503.
  let staleCheck: HealthCheckItem;
  if (!dbCheck.ok) {
    staleCheck = { ok: true, skipped: true, detail: "skipped — DB unreachable" };
  } else {
    const thresholdMinutes = healthStaleJobMinutes();
    const cutoff = new Date(Date.now() - thresholdMinutes * 60_000);
    try {
      const [row] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(jobRuns)
        .where(and(eq(jobRuns.status, "running"), lt(jobRuns.startedAt, cutoff)));
      const stale = Number(row?.c ?? 0);
      staleCheck =
        stale === 0
          ? { ok: true, detail: `0 jobs running > ${thresholdMinutes}m` }
          : {
              ok: false,
              detail: `${stale} job_run(s) stuck running > ${thresholdMinutes}m`,
            };
    } catch (e) {
      // A failed count is not itself a liveness breach — report it but do not
      // flip the verdict (the db check already covers hard outages).
      staleCheck = {
        ok: true,
        skipped: true,
        detail: e instanceof Error ? `stale-job query failed: ${e.message}` : "stale-job query failed",
      };
    }
  }

  const healthy = dbCheck.ok && staleCheck.ok;
  return {
    healthy,
    checkedAt,
    checks: { db: dbCheck, staleJobs: staleCheck },
  };
}
