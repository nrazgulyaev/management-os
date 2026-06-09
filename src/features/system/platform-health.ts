import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import { healthStaleJobMinutes } from "@/lib/env";

/**
 * P1 SUPERADMIN-SYSTEM-HEALTH — platform-scoped system-health reads.
 *
 * Reuses the EXISTING job / health infra (job_runs, job_locks,
 * notification_deliveries, auth_login_attempts, agent_runs) but at
 * platform scope: a single super-admin operator wants a cross-tenant
 * services-status grid + a job-queue panel.
 *
 * Every query is defensive:
 *   - `getDb()` may return null (demo / no-DB) → returns the neutral
 *     "no db" shape, never throws.
 *   - Each metric is guarded by `to_regclass('public.<table>')` so a
 *     database missing a migration degrades to a "missing" service
 *     row rather than 500-ing the page (this surface mirrors the
 *     false-negative-tolerant /dashboard/system/health page).
 *
 * Read-only v1: the org-scoped job runner exposes manual run / lock
 * actions only behind org RBAC (`requirePermission("jobs.run")`) and
 * revalidates `/dashboard/jobs` paths — there is NO platform-scoped
 * pause-workers / dead-letter-replay primitive. So this surface
 * read-onlys and deep-links to the existing /dashboard job + lock
 * action cabinets rather than re-gating an org write onto a
 * super-admin page.
 */

export type ServiceStatus = "operational" | "degraded" | "down" | "unknown";

export interface ServiceHealthRow {
  key: string;
  label: string;
  status: ServiceStatus;
  metric: string;
  detail: string;
}

export interface JobLockRow {
  jobKey: string;
  status: string;
  lockedBy: string;
  lockedAt: string;
  expiresAt: string;
  isStale: boolean;
}

export interface AgentRunRow {
  id: string;
  agentName: string;
  agentCode: string;
  orgName: string | null;
  status: string;
  runType: string;
  startedAt: string;
  latencyMs: number | null;
}

export interface PlatformHealthSnapshot {
  dbConfigured: boolean;
  services: ServiceHealthRow[];
  staleLocks: JobLockRow[];
  activeLocks: number;
  recentAgentRuns: AgentRunRow[];
  agentRunFailures24h: number;
}

/**
 * One dead-letter row: a job run that finished `failed` and has not been
 * re-run successfully since. This is the platform's "dead-letter queue" view
 * — the job runner has no separate DLQ table, so the canonical signal is a
 * failed `job_runs` row with no later success for the same `job_key`.
 */
export interface DeadLetterRow {
  jobKey: string;
  runId: string;
  failedAt: string;
  errorMessage: string | null;
  resultSummary: string | null;
}

export interface JobHealthPanel {
  dbConfigured: boolean;
  /** Jobs whose status is still `running` (in-flight queue depth). */
  runningCount: number;
  /** Jobs `running` past the stale threshold — a stuck worker / leaked lock. */
  stuckCount: number;
  staleJobMinutes: number;
  /** Failed runs (24h) with no later success — the dead-letter set. */
  deadLetters: DeadLetterRow[];
  deadLetterCount: number;
  /** Overall verdict for the panel header. */
  status: ServiceStatus;
  /**
   * What the underlying job runner ACTUALLY exposes as a control surface.
   * These drive whether we render a real wired button or an honest
   * "not exposed" note — never a fake button.
   */
  capabilities: {
    /** `runJobManuallyAction` exists → Dispatch-job is wireable. */
    dispatch: boolean;
    /** `forceReleaseJobLockAction` / `expireStaleJobLocksAction` exist. */
    clearLocks: boolean;
    /**
     * There is NO pause-all-workers primitive in the runner — crons fire via
     * Vercel scheduled GETs, there is no long-lived worker pool to pause.
     * Always false; the UI shows an honest "not exposed" note instead.
     */
    pauseWorkers: boolean;
  };
}

const EMPTY_SNAPSHOT: PlatformHealthSnapshot = {
  dbConfigured: false,
  services: [
    {
      key: "db",
      label: "Database connections",
      status: "unknown",
      metric: "—",
      detail: "DATABASE_URL not configured (demo mode).",
    },
  ],
  staleLocks: [],
  activeLocks: 0,
  recentAgentRuns: [],
  agentRunFailures24h: 0,
};

type Exec = (q: ReturnType<typeof sql>) => Promise<unknown>;

/** Returns true if a base table exists, false otherwise — never throws. */
async function tableExists(exec: Exec, table: string): Promise<boolean> {
  try {
    const rows = rowsOf<{ ok: boolean }>(
      await exec(
        sql`SELECT to_regclass(${`public.${table}`}) IS NOT NULL AS ok`,
      ),
    );
    return rows[0]?.ok === true;
  } catch {
    return false;
  }
}

async function dbConnectionsService(exec: Exec): Promise<ServiceHealthRow> {
  try {
    const rows = rowsOf<{ total: string; active: string; max_conn: string }>(
      await exec(sql`
        SELECT
          (SELECT count(*)::text FROM pg_stat_activity)                              AS total,
          (SELECT count(*)::text FROM pg_stat_activity WHERE state = 'active')        AS active,
          (SELECT setting FROM pg_settings WHERE name = 'max_connections')            AS max_conn
      `),
    );
    const total = Number(rows[0]?.total ?? 0);
    const active = Number(rows[0]?.active ?? 0);
    const max = Number(rows[0]?.max_conn ?? 0);
    const pct = max > 0 ? total / max : 0;
    const status: ServiceStatus =
      pct >= 0.9 ? "down" : pct >= 0.7 ? "degraded" : "operational";
    return {
      key: "db",
      label: "Database connections",
      status,
      metric: max > 0 ? `${total} / ${max}` : String(total),
      detail: `${active} active · ${Math.round(pct * 100)}% of pool in use`,
    };
  } catch {
    return {
      key: "db",
      label: "Database connections",
      status: "unknown",
      metric: "—",
      detail: "Could not read pg_stat_activity.",
    };
  }
}

async function queueDepthService(exec: Exec): Promise<ServiceHealthRow> {
  if (!(await tableExists(exec, "notification_queue"))) {
    return {
      key: "queue",
      label: "Notification queue depth",
      status: "unknown",
      metric: "—",
      detail: "notification_queue table missing (migration pending).",
    };
  }
  try {
    const rows = rowsOf<{ queued: string; failed: string }>(
      await exec(sql`
        SELECT
          count(*) FILTER (WHERE status = 'queued')::text AS queued,
          count(*) FILTER (WHERE status = 'failed')::text AS failed
        FROM notification_queue
      `),
    );
    const queued = Number(rows[0]?.queued ?? 0);
    const failed = Number(rows[0]?.failed ?? 0);
    const status: ServiceStatus =
      queued >= 500 || failed >= 50
        ? "down"
        : queued >= 100 || failed >= 10
          ? "degraded"
          : "operational";
    return {
      key: "queue",
      label: "Notification queue depth",
      status,
      metric: String(queued),
      detail: `${failed} failed in queue`,
    };
  } catch {
    return {
      key: "queue",
      label: "Notification queue depth",
      status: "unknown",
      metric: "—",
      detail: "Could not read notification_queue.",
    };
  }
}

async function cronSuccessService(exec: Exec): Promise<ServiceHealthRow> {
  if (!(await tableExists(exec, "job_runs"))) {
    return {
      key: "cron",
      label: "Cron success (24h)",
      status: "unknown",
      metric: "—",
      detail: "job_runs table missing (migration pending).",
    };
  }
  try {
    const rows = rowsOf<{ total: string; failed: string }>(
      await exec(sql`
        SELECT
          count(*)::text AS total,
          count(*) FILTER (
            WHERE status IN ('failed', 'partial_success')
          )::text AS failed
        FROM job_runs
        WHERE started_at >= now() - INTERVAL '24 hours'
      `),
    );
    const total = Number(rows[0]?.total ?? 0);
    const failed = Number(rows[0]?.failed ?? 0);
    const rate = total > 0 ? (total - failed) / total : 1;
    const status: ServiceStatus =
      total === 0
        ? "unknown"
        : rate >= 0.95
          ? "operational"
          : rate >= 0.8
            ? "degraded"
            : "down";
    return {
      key: "cron",
      label: "Cron success (24h)",
      status,
      metric: total > 0 ? `${Math.round(rate * 100)}%` : "no runs",
      detail: `${total} runs · ${failed} failed`,
    };
  } catch {
    return {
      key: "cron",
      label: "Cron success (24h)",
      status: "unknown",
      metric: "—",
      detail: "Could not read job_runs.",
    };
  }
}

async function emailBounceService(exec: Exec): Promise<ServiceHealthRow> {
  if (!(await tableExists(exec, "notification_deliveries"))) {
    return {
      key: "email",
      label: "Email bounce (7d)",
      status: "unknown",
      metric: "—",
      detail: "notification_deliveries table missing (migration pending).",
    };
  }
  try {
    const rows = rowsOf<{ total: string; bounced: string }>(
      await exec(sql`
        SELECT
          count(*)::text AS total,
          count(*) FILTER (
            WHERE status IN ('bounced', 'failed', 'complained')
          )::text AS bounced
        FROM notification_deliveries
        WHERE channel = 'email'
          AND created_at >= now() - INTERVAL '7 days'
      `),
    );
    const total = Number(rows[0]?.total ?? 0);
    const bounced = Number(rows[0]?.bounced ?? 0);
    const rate = total > 0 ? bounced / total : 0;
    const status: ServiceStatus =
      total === 0
        ? "unknown"
        : rate >= 0.1
          ? "down"
          : rate >= 0.03
            ? "degraded"
            : "operational";
    return {
      key: "email",
      label: "Email bounce (7d)",
      status,
      metric: total > 0 ? `${(rate * 100).toFixed(1)}%` : "no sends",
      detail: `${bounced} bounced / ${total} email deliveries`,
    };
  } catch {
    return {
      key: "email",
      label: "Email bounce (7d)",
      status: "unknown",
      metric: "—",
      detail: "Could not read notification_deliveries.",
    };
  }
}

async function signInService(exec: Exec): Promise<ServiceHealthRow> {
  if (!(await tableExists(exec, "auth_login_attempts"))) {
    return {
      key: "signin",
      label: "Sign-in success (24h)",
      status: "unknown",
      metric: "—",
      detail: "auth_login_attempts table missing (migration pending).",
    };
  }
  try {
    const rows = rowsOf<{ total: string; ok: string }>(
      await exec(sql`
        SELECT
          count(*)::text AS total,
          count(*) FILTER (WHERE succeeded = TRUE)::text AS ok
        FROM auth_login_attempts
        WHERE created_at >= now() - INTERVAL '24 hours'
      `),
    );
    const total = Number(rows[0]?.total ?? 0);
    const ok = Number(rows[0]?.ok ?? 0);
    const rate = total > 0 ? ok / total : 1;
    const status: ServiceStatus =
      total === 0
        ? "unknown"
        : rate >= 0.7
          ? "operational"
          : rate >= 0.4
            ? "degraded"
            : "down";
    return {
      key: "signin",
      label: "Sign-in success (24h)",
      status,
      metric: total > 0 ? `${Math.round(rate * 100)}%` : "no attempts",
      detail: `${ok} ok / ${total} attempts`,
    };
  } catch {
    return {
      key: "signin",
      label: "Sign-in success (24h)",
      status: "unknown",
      metric: "—",
      detail: "Could not read auth_login_attempts.",
    };
  }
}

async function readLocks(exec: Exec): Promise<{
  staleLocks: JobLockRow[];
  activeLocks: number;
}> {
  if (!(await tableExists(exec, "job_locks"))) {
    return { staleLocks: [], activeLocks: 0 };
  }
  try {
    const rows = rowsOf<{
      job_key: string;
      status: string;
      locked_by: string;
      locked_at: string;
      expires_at: string;
      is_stale: boolean;
    }>(
      await exec(sql`
        SELECT
          job_key,
          status,
          locked_by,
          locked_at::text AS locked_at,
          expires_at::text AS expires_at,
          (status = 'locked' AND expires_at < now()) AS is_stale
        FROM job_locks
        WHERE status = 'locked'
        ORDER BY locked_at DESC
        LIMIT 50
      `),
    );
    const activeLocks = rows.length;
    const staleLocks = rows
      .filter((r) => r.is_stale)
      .map((r) => ({
        jobKey: r.job_key,
        status: r.status,
        lockedBy: r.locked_by,
        lockedAt: r.locked_at,
        expiresAt: r.expires_at,
        isStale: true,
      }));
    return { staleLocks, activeLocks };
  } catch {
    return { staleLocks: [], activeLocks: 0 };
  }
}

async function readAgentRuns(exec: Exec): Promise<{
  recentAgentRuns: AgentRunRow[];
  agentRunFailures24h: number;
}> {
  if (!(await tableExists(exec, "agent_runs"))) {
    return { recentAgentRuns: [], agentRunFailures24h: 0 };
  }
  try {
    const rows = rowsOf<{
      id: string;
      agent_name: string;
      agent_code: string;
      org_name: string | null;
      status: string;
      run_type: string;
      started_at: string;
      latency_ms: number | null;
    }>(
      await exec(sql`
        SELECT
          r.id::text                      AS id,
          c.display_name                  AS agent_name,
          c.agent_code                    AS agent_code,
          o.name                          AS org_name,
          r.status                        AS status,
          r.run_type                      AS run_type,
          r.started_at::text              AS started_at,
          r.latency_ms                    AS latency_ms
        FROM agent_runs r
        LEFT JOIN platform_agent_configs c ON c.id = r.agent_id
        LEFT JOIN organizations o ON o.id = r.organization_id
        ORDER BY r.started_at DESC
        LIMIT 15
      `),
    );
    const failRows = rowsOf<{ failures: string }>(
      await exec(sql`
        SELECT count(*)::text AS failures
        FROM agent_runs
        WHERE started_at >= now() - INTERVAL '24 hours'
          AND status IN ('error', 'budget_exceeded', 'rate_limited')
      `),
    );
    return {
      recentAgentRuns: rows.map((r) => ({
        id: r.id,
        agentName: r.agent_name ?? "—",
        agentCode: r.agent_code ?? "—",
        orgName: r.org_name,
        status: r.status,
        runType: r.run_type,
        startedAt: r.started_at,
        latencyMs: r.latency_ms,
      })),
      agentRunFailures24h: Number(failRows[0]?.failures ?? 0),
    };
  } catch {
    return { recentAgentRuns: [], agentRunFailures24h: 0 };
  }
}

/**
 * Cron / job-health panel — the queue-depth + dead-letter view that backs
 * the platform System Health page's job control panel.
 *
 * Honest by construction:
 *   - `runningCount` / `stuckCount` come from real `job_runs` rows; a stuck
 *     run (running past `healthStaleJobMinutes`) is the same signal the
 *     /api/cron/health 503 probe uses, so this panel and the probe agree.
 *   - `deadLetters` are failed runs (24h) with no LATER success for the same
 *     job key — there is no separate DLQ table, so this IS the dead-letter
 *     queue. "Replay" = dispatch the same job again (the runner's only
 *     re-run primitive); we never pretend a replay-in-place exists.
 *   - `capabilities.pauseWorkers` is hard-false: the runner has no worker
 *     pool to pause (crons are stateless Vercel GETs). The UI renders an
 *     honest "not exposed" note rather than a dead button.
 */
export async function getJobHealthPanel(): Promise<JobHealthPanel> {
  const staleJobMinutes = healthStaleJobMinutes();
  const capabilities = {
    dispatch: true,
    clearLocks: true,
    pauseWorkers: false,
  };

  const db = getDb();
  if (!db) {
    return {
      dbConfigured: false,
      runningCount: 0,
      stuckCount: 0,
      staleJobMinutes,
      deadLetters: [],
      deadLetterCount: 0,
      status: "unknown",
      capabilities,
    };
  }

  const exec: Exec = (q) => db.execute(q);

  if (!(await tableExists(exec, "job_runs"))) {
    return {
      dbConfigured: true,
      runningCount: 0,
      stuckCount: 0,
      staleJobMinutes,
      deadLetters: [],
      deadLetterCount: 0,
      status: "unknown",
      capabilities,
    };
  }

  try {
    const counts = rowsOf<{ running: string; stuck: string }>(
      await exec(sql`
        SELECT
          count(*) FILTER (WHERE status = 'running')::text AS running,
          count(*) FILTER (
            WHERE status = 'running'
              AND started_at < now() - (${staleJobMinutes} * INTERVAL '1 minute')
          )::text AS stuck
        FROM job_runs
      `),
    );
    const runningCount = Number(counts[0]?.running ?? 0);
    const stuckCount = Number(counts[0]?.stuck ?? 0);

    // Dead-letter = a failed run (24h) for which no SUCCESS exists for the
    // same job_key at-or-after that failure. Those still need attention.
    const dlRows = rowsOf<{
      job_key: string;
      run_id: string;
      failed_at: string;
      error_message: string | null;
      result_summary: string | null;
    }>(
      await exec(sql`
        SELECT
          f.job_key                  AS job_key,
          f.id::text                 AS run_id,
          f.started_at::text         AS failed_at,
          f.error_message            AS error_message,
          f.result_summary           AS result_summary
        FROM job_runs f
        WHERE f.status = 'failed'
          AND f.started_at >= now() - INTERVAL '24 hours'
          AND NOT EXISTS (
            SELECT 1 FROM job_runs s
             WHERE s.job_key = f.job_key
               AND s.status = 'success'
               AND s.started_at >= f.started_at
          )
        ORDER BY f.started_at DESC
        LIMIT 25
      `),
    );

    const deadLetters: DeadLetterRow[] = dlRows.map((r) => ({
      jobKey: r.job_key,
      runId: r.run_id,
      failedAt: r.failed_at,
      errorMessage: r.error_message,
      resultSummary: r.result_summary,
    }));

    const status: ServiceStatus =
      stuckCount > 0 || deadLetters.length >= 5
        ? "down"
        : deadLetters.length > 0
          ? "degraded"
          : "operational";

    return {
      dbConfigured: true,
      runningCount,
      stuckCount,
      staleJobMinutes,
      deadLetters,
      deadLetterCount: deadLetters.length,
      status,
      capabilities,
    };
  } catch {
    return {
      dbConfigured: true,
      runningCount: 0,
      stuckCount: 0,
      staleJobMinutes,
      deadLetters: [],
      deadLetterCount: 0,
      status: "unknown",
      capabilities,
    };
  }
}

export async function getPlatformHealthSnapshot(): Promise<PlatformHealthSnapshot> {
  const db = getDb();
  if (!db) return EMPTY_SNAPSHOT;

  const exec: Exec = (q) => db.execute(q);

  const [
    dbSvc,
    queueSvc,
    cronSvc,
    emailSvc,
    signinSvc,
    locks,
    agentRuns,
  ] = await Promise.all([
    dbConnectionsService(exec),
    queueDepthService(exec),
    cronSuccessService(exec),
    emailBounceService(exec),
    signInService(exec),
    readLocks(exec),
    readAgentRuns(exec),
  ]);

  return {
    dbConfigured: true,
    services: [dbSvc, queueSvc, cronSvc, emailSvc, signinSvc],
    staleLocks: locks.staleLocks,
    activeLocks: locks.activeLocks,
    recentAgentRuns: agentRuns.recentAgentRuns,
    agentRunFailures24h: agentRuns.agentRunFailures24h,
  };
}
