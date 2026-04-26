import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  jobDefinitions,
  jobRunEvents,
  jobRuns,
} from "@/lib/db/schema/jobs";
import { recordAuditEvent } from "@/features/audit/services";
import { findJobDefinition } from "./definitions";

export type TriggerType = "cron" | "manual" | "system" | "retry";
export type RunStatus =
  | "running"
  | "success"
  | "partial_success"
  | "failed"
  | "cancelled"
  | "skipped";

export interface JobRunHandle {
  id: string | null; // null when DB is unavailable
  jobKey: string;
  triggerType: TriggerType;
  startedAt: Date;
  /** Append a structured event to the run log. Falls back to `console.log`
   *  when DB is unavailable so dev runs are still observable. */
  event: (
    level: "debug" | "info" | "warning" | "error",
    message: string,
    metadata?: Record<string, unknown>,
  ) => Promise<void>;
}

/**
 * Open a new job run. Looks up the matching `job_definitions` row by key
 * (so manual / cron triggers see the same `job_definition_id`), inserts a
 * `running` row, and returns a handle the caller uses to log events.
 */
export async function startJobRun(
  jobKey: string,
  triggerType: TriggerType,
  createdBy: string | null = null,
): Promise<JobRunHandle> {
  const startedAt = new Date();
  const db = getDb();
  if (!db) {
    return {
      id: null,
      jobKey,
      triggerType,
      startedAt,
      async event(level, message, metadata) {
        console.log(`[job:${jobKey}] [${level}] ${message}`, metadata ?? "");
      },
    };
  }

  // Locate the job_definition row (may be null on a fresh DB before the
  // seeder has run — that's fine, the run still works).
  let jobDefinitionId: string | null = null;
  const [def] = await db
    .select({ id: jobDefinitions.id })
    .from(jobDefinitions)
    .where(eq(jobDefinitions.key, jobKey))
    .limit(1);
  jobDefinitionId = def?.id ?? null;

  const [row] = await db
    .insert(jobRuns)
    .values({
      jobDefinitionId,
      jobKey,
      triggerType,
      status: "running",
      startedAt,
      createdBy,
    })
    .returning({ id: jobRuns.id });

  const id = row.id;
  return {
    id,
    jobKey,
    triggerType,
    startedAt,
    async event(level, message, metadata) {
      const dbInner = getDb();
      if (!dbInner) {
        console.log(`[job:${jobKey}] [${level}] ${message}`, metadata ?? "");
        return;
      }
      await dbInner.insert(jobRunEvents).values({
        jobRunId: id,
        level,
        message,
        metadata: metadata ?? null,
      });
    },
  };
}

export interface FinishOptions {
  status: RunStatus;
  summary?: string | null;
  metrics?: Record<string, unknown> | null;
  error?: string | null;
}

export async function finishJobRun(
  handle: JobRunHandle,
  opts: FinishOptions,
): Promise<void> {
  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - handle.startedAt.getTime();
  const db = getDb();
  if (!db || !handle.id) return;
  await db
    .update(jobRuns)
    .set({
      status: opts.status,
      finishedAt,
      durationMs,
      resultSummary: opts.summary ?? null,
      metrics: (opts.metrics ?? null) as typeof jobRuns.$inferInsert["metrics"],
      errorMessage: opts.error ?? null,
    })
    .where(eq(jobRuns.id, handle.id));

  await recordAuditEvent({
    actorUserId: null,
    action: `jobs.${handle.jobKey}.${opts.status}`,
    entityType: "job_run",
    entityId: handle.id,
    after: {
      triggerType: handle.triggerType,
      durationMs,
      summary: opts.summary ?? null,
    },
  });
}

export async function appendJobEvent(
  handle: JobRunHandle,
  level: "debug" | "info" | "warning" | "error",
  message: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await handle.event(level, message, metadata);
}

export interface JobOutcome {
  status: RunStatus;
  summary: string;
  metrics: Record<string, unknown>;
  error?: string;
}

/**
 * High-level wrapper that starts a run, executes `fn`, and finishes the
 * run with the outcome `fn` reports. If `fn` throws, the wrapper finishes
 * the run as `failed` and re-throws so the cron route can return 500.
 */
export async function withJobRun(
  jobKey: string,
  triggerType: TriggerType,
  createdBy: string | null,
  fn: (handle: JobRunHandle) => Promise<JobOutcome>,
): Promise<{ jobRunId: string | null; outcome: JobOutcome }> {
  const def = findJobDefinition(jobKey);
  const handle = await startJobRun(jobKey, triggerType, createdBy);
  await handle.event("info", def ? `Starting ${def.name}` : `Starting ${jobKey}`, {
    triggerType,
  });
  try {
    const outcome = await fn(handle);
    await finishJobRun(handle, {
      status: outcome.status,
      summary: outcome.summary,
      metrics: outcome.metrics,
      error: outcome.error ?? null,
    });
    await handle.event(
      outcome.status === "failed" ? "error" : "info",
      `Finished with status ${outcome.status}: ${outcome.summary}`,
      outcome.metrics,
    );
    return { jobRunId: handle.id, outcome };
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    await handle.event("error", `Job threw: ${message}`);
    await finishJobRun(handle, {
      status: "failed",
      summary: "uncaught error",
      error: message,
    });
    throw e;
  }
}
