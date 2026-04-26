"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { withJobRun, type JobOutcome, type TriggerType } from "./runner";
import { runCalendarSyncJob } from "./calendar-sync-job";
import { runPreventiveTasksJob } from "./preventive-tasks-job";
import { runMaterialUsageFinanceBridgeJob } from "./material-usage-bridge-job";
import { runLowStockScanJob } from "./low-stock-job";
import { ensureDefaultJobDefinitions } from "./services";
import { findJobDefinition } from "./definitions";
import type { ActionResult } from "@/features/projects/actions";

const runJobSchema = z.object({
  jobKey: z.string().min(2).max(80),
});

const KNOWN_JOBS = new Set([
  "calendar_sync_active_feeds",
  "generate_preventive_tasks",
  "bridge_pending_material_usage",
  "scan_low_stock",
]);

export type JobKey =
  | "calendar_sync_active_feeds"
  | "generate_preventive_tasks"
  | "bridge_pending_material_usage"
  | "scan_low_stock";

/**
 * Dispatch table — maps job key to runner. Cron routes call into this
 * directly (after CRON_SECRET auth); the dashboard "Run now" button goes
 * through `runJobManuallyAction` which adds a permission check.
 */
export async function executeJob(
  jobKey: string,
  triggerType: TriggerType,
  createdBy: string | null,
): Promise<{ jobRunId: string | null; outcome: JobOutcome }> {
  if (!KNOWN_JOBS.has(jobKey)) {
    throw new Error(`Unknown job key: ${jobKey}`);
  }
  return withJobRun(jobKey, triggerType, createdBy, async (handle) => {
    const def = findJobDefinition(jobKey);
    switch (jobKey) {
      case "calendar_sync_active_feeds":
        return runCalendarSyncJob(handle, {
          respectFeedInterval: (def?.config as { respectFeedInterval?: boolean } | null)
            ?.respectFeedInterval ?? true,
        });
      case "generate_preventive_tasks":
        return runPreventiveTasksJob(handle);
      case "bridge_pending_material_usage":
        return runMaterialUsageFinanceBridgeJob(handle);
      case "scan_low_stock":
        return runLowStockScanJob(handle);
      default:
        // unreachable — KNOWN_JOBS keeps us honest
        throw new Error(`Unhandled job key: ${jobKey}`);
    }
  });
}

export async function executeAllJobs(
  triggerType: TriggerType,
  createdBy: string | null,
): Promise<{
  results: { jobKey: string; jobRunId: string | null; status: string; summary: string }[];
}> {
  const results: {
    jobKey: string;
    jobRunId: string | null;
    status: string;
    summary: string;
  }[] = [];

  for (const jobKey of [
    "calendar_sync_active_feeds",
    "generate_preventive_tasks",
    "bridge_pending_material_usage",
    "scan_low_stock",
  ] as JobKey[]) {
    try {
      const { jobRunId, outcome } = await executeJob(jobKey, triggerType, createdBy);
      results.push({ jobKey, jobRunId, status: outcome.status, summary: outcome.summary });
    } catch (e) {
      // Per spec: run-all must NOT throw if one job fails.
      const message = e instanceof Error ? e.message : "unknown error";
      results.push({
        jobKey,
        jobRunId: null,
        status: "failed",
        summary: `threw: ${message}`,
      });
    }
  }

  return { results };
}

export async function runJobManuallyAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult & { jobRunId?: string | null; status?: string; summary?: string }> {
  await requirePermission("jobs.run");
  const parsed = runJobSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing jobKey." };
  if (!KNOWN_JOBS.has(parsed.data.jobKey)) {
    return { ok: false, error: `Unknown job: ${parsed.data.jobKey}` };
  }

  const me = await getCurrentAppUser();
  try {
    const { jobRunId, outcome } = await executeJob(
      parsed.data.jobKey,
      "manual",
      me?.id ?? null,
    );
    revalidatePath("/dashboard/jobs");
    revalidatePath("/dashboard/jobs/runs");
    return {
      ok: true,
      jobRunId,
      status: outcome.status,
      summary: outcome.summary,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return { ok: false, error: message };
  }
}

export async function seedDefaultJobDefinitionsAction(
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult & { inserted?: number }> {
  await requirePermission("jobs.manage");
  const inserted = await ensureDefaultJobDefinitions();
  revalidatePath("/dashboard/jobs");
  return { ok: true, inserted };
}
