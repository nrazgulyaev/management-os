import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  jobDefinitions,
  jobRunEvents,
  jobRuns,
} from "@/lib/db/schema/jobs";
import { appUsers } from "@/lib/db/schema/identity";
import { requireOrgId } from "@/features/auth/require-org";
import type { WithSource } from "@/features/types";
import { DEFAULT_JOB_DEFINITIONS } from "./definitions";

export interface JobDefinitionRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  jobType: string;
  scheduleCron: string | null;
  enabled: boolean;
  timeoutSeconds: number;
  maxRetries: number;
  config: Record<string, unknown> | null;
  lastRunStatus: string | null;
  lastRunAt: string | null;
  lastDurationMs: number | null;
}

export interface JobRunRow {
  id: string;
  jobKey: string;
  triggerType: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  resultSummary: string | null;
  metrics: Record<string, unknown> | null;
  errorMessage: string | null;
  createdByName: string | null;
}

export interface JobRunDetail extends JobRunRow {
  events: {
    id: string;
    level: string;
    message: string;
    metadata: Record<string, unknown> | null;
    createdAt: string;
  }[];
}

export async function listJobDefinitions(opts?: {
  organizationId?: string | null;
}): Promise<WithSource<JobDefinitionRow>[]> {
  const db = getDb();
  if (!db) return [];
  // TENANCY — default (undefined) scopes to the caller's tenant via
  // requireOrgId; an explicit `null` (super-admin / cron) stays
  // platform-wide. Mirrors listMaintenanceTickets/listServiceRequests.
  const organizationId =
    opts?.organizationId === undefined ? await requireOrgId() : opts.organizationId;
  const rows = await db
    .select({
      d: jobDefinitions,
      lastRun: sql<{
        status: string | null;
        started_at: string | null;
        duration_ms: number | null;
      }>`(
        SELECT json_build_object(
          'status', r.status,
          'started_at', r.started_at,
          'duration_ms', r.duration_ms
        )
          FROM job_runs r
         WHERE r.job_definition_id = ${jobDefinitions.id}
         ORDER BY r.started_at DESC
         LIMIT 1
      )`,
    })
    .from(jobDefinitions)
    .where(
      organizationId
        ? eq(jobDefinitions.organizationId, organizationId)
        : undefined,
    )
    .orderBy(asc(jobDefinitions.name));

  return rows.map((r) => {
    const last = r.lastRun ?? null;
    return {
      source: "db" as const,
      id: r.d.id,
      key: r.d.key,
      name: r.d.name,
      description: r.d.description,
      jobType: r.d.jobType,
      scheduleCron: r.d.scheduleCron,
      enabled: r.d.enabled,
      timeoutSeconds: r.d.timeoutSeconds,
      maxRetries: r.d.maxRetries,
      config: r.d.config as Record<string, unknown> | null,
      lastRunStatus: last?.status ?? null,
      lastRunAt: last?.started_at ?? null,
      lastDurationMs: last?.duration_ms ?? null,
    };
  });
}

export async function listJobRuns(opts?: {
  jobKey?: string;
  status?: string;
  limit?: number;
  organizationId?: string | null;
}): Promise<WithSource<JobRunRow>[]> {
  const db = getDb();
  if (!db) return [];
  // TENANCY — default (undefined) scopes to the caller's tenant via
  // requireOrgId; an explicit `null` (super-admin / cron) stays
  // platform-wide. Mirrors listMaintenanceTickets/listServiceRequests.
  const organizationId =
    opts?.organizationId === undefined ? await requireOrgId() : opts.organizationId;
  const filters = [];
  if (organizationId) filters.push(eq(jobRuns.organizationId, organizationId));
  if (opts?.jobKey) filters.push(eq(jobRuns.jobKey, opts.jobKey));
  if (opts?.status) filters.push(eq(jobRuns.status, opts.status));

  const rows = await db
    .select({
      r: jobRuns,
      createdByName: appUsers.fullName,
    })
    .from(jobRuns)
    .leftJoin(appUsers, eq(appUsers.id, jobRuns.createdBy))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(jobRuns.startedAt))
    .limit(opts?.limit ?? 100);

  return rows.map((r) => ({
    source: "db" as const,
    id: r.r.id,
    jobKey: r.r.jobKey,
    triggerType: r.r.triggerType,
    status: r.r.status,
    startedAt: r.r.startedAt.toISOString(),
    finishedAt: r.r.finishedAt?.toISOString() ?? null,
    durationMs: r.r.durationMs,
    resultSummary: r.r.resultSummary,
    metrics: r.r.metrics as Record<string, unknown> | null,
    errorMessage: r.r.errorMessage,
    createdByName: r.createdByName ?? null,
  }));
}

export async function getJobRunById(
  id: string,
  opts?: { organizationId?: string | null },
): Promise<JobRunDetail | null> {
  const db = getDb();
  if (!db) return null;
  // TENANCY — default (undefined) scopes to the caller's tenant via
  // requireOrgId so a run owned by another org resolves to null →
  // notFound(). An explicit `null` (super-admin / cron) stays
  // platform-wide. Mirrors listMaintenanceTickets/listServiceRequests.
  const organizationId =
    opts?.organizationId === undefined ? await requireOrgId() : opts.organizationId;
  const [r] = await db
    .select({
      r: jobRuns,
      createdByName: appUsers.fullName,
    })
    .from(jobRuns)
    .leftJoin(appUsers, eq(appUsers.id, jobRuns.createdBy))
    .where(
      organizationId
        ? and(eq(jobRuns.id, id), eq(jobRuns.organizationId, organizationId))
        : eq(jobRuns.id, id),
    )
    .limit(1);
  if (!r) return null;
  const events = await db
    .select()
    .from(jobRunEvents)
    .where(eq(jobRunEvents.jobRunId, id))
    .orderBy(asc(jobRunEvents.createdAt));

  return {
    id: r.r.id,
    jobKey: r.r.jobKey,
    triggerType: r.r.triggerType,
    status: r.r.status,
    startedAt: r.r.startedAt.toISOString(),
    finishedAt: r.r.finishedAt?.toISOString() ?? null,
    durationMs: r.r.durationMs,
    resultSummary: r.r.resultSummary,
    metrics: r.r.metrics as Record<string, unknown> | null,
    errorMessage: r.r.errorMessage,
    createdByName: r.createdByName ?? null,
    events: events.map((e) => ({
      id: e.id,
      level: e.level,
      message: e.message,
      metadata: e.metadata as Record<string, unknown> | null,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

/**
 * Get the most-recent run for one job. Cheap helper so existing dashboards
 * can show "last calendar sync · 2h ago" without joining their own queries.
 */
export async function getLastRunByJobKey(
  jobKey: string,
  opts?: { organizationId?: string | null },
): Promise<JobRunRow | null> {
  const db = getDb();
  if (!db) return null;
  // TENANCY — default (undefined) scopes to the caller's tenant via
  // requireOrgId; an explicit `null` (super-admin / cron) stays
  // platform-wide. Mirrors listMaintenanceTickets/listServiceRequests.
  const organizationId =
    opts?.organizationId === undefined ? await requireOrgId() : opts.organizationId;
  const [row] = await db
    .select({
      r: jobRuns,
      createdByName: appUsers.fullName,
    })
    .from(jobRuns)
    .leftJoin(appUsers, eq(appUsers.id, jobRuns.createdBy))
    .where(
      organizationId
        ? and(
            eq(jobRuns.jobKey, jobKey),
            eq(jobRuns.organizationId, organizationId),
          )
        : eq(jobRuns.jobKey, jobKey),
    )
    .orderBy(desc(jobRuns.startedAt))
    .limit(1);
  if (!row) return null;
  return {
    id: row.r.id,
    jobKey: row.r.jobKey,
    triggerType: row.r.triggerType,
    status: row.r.status,
    startedAt: row.r.startedAt.toISOString(),
    finishedAt: row.r.finishedAt?.toISOString() ?? null,
    durationMs: row.r.durationMs,
    resultSummary: row.r.resultSummary,
    metrics: row.r.metrics as Record<string, unknown> | null,
    errorMessage: row.r.errorMessage,
    createdByName: row.createdByName ?? null,
  };
}

/**
 * Idempotent seeder. Called from /dashboard/jobs and from the CLI seed
 * file via the seed-default action. Safe to run on every boot.
 */
export async function ensureDefaultJobDefinitions(): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  let inserted = 0;
  for (const def of DEFAULT_JOB_DEFINITIONS) {
    const [existing] = await db
      .select({ id: jobDefinitions.id })
      .from(jobDefinitions)
      .where(eq(jobDefinitions.key, def.key))
      .limit(1);
    if (existing) continue;
    await db.insert(jobDefinitions).values({
      key: def.key,
      name: def.name,
      description: def.description,
      jobType: def.jobType,
      scheduleCron: def.scheduleCron,
      enabled: def.enabled,
      timeoutSeconds: def.timeoutSeconds,
      maxRetries: def.maxRetries,
      config: def.config as typeof jobDefinitions.$inferInsert["config"],
    });
    inserted++;
  }
  return inserted;
}
