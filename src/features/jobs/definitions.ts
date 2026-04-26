/**
 * Default job catalog. Pure data — safe to import from server actions, the
 * cron route handlers, tests, and the dashboard.
 *
 * `key` is the canonical identifier used in `job_runs.job_key` and on the
 * cron URLs (`/api/cron/<jobKey>`). Add a new entry here, then write a
 * matching runner in `src/features/jobs/<jobKey>-job.ts`.
 */

export type JobType =
  | "calendar_sync"
  | "preventive_tasks"
  | "finance_bridge"
  | "low_stock_scan"
  | "cleanup"
  | "notification_digest";

export interface JobDefinitionSeed {
  key: string;
  name: string;
  description: string;
  jobType: JobType;
  scheduleCron: string | null;
  enabled: boolean;
  timeoutSeconds: number;
  maxRetries: number;
  config: Record<string, unknown> | null;
}

export const DEFAULT_JOB_DEFINITIONS: JobDefinitionSeed[] = [
  {
    key: "calendar_sync_active_feeds",
    name: "Calendar sync — active feeds",
    description:
      "Walks every active channel_calendar_feeds row and re-fetches the iCal source. Honours sync_interval_minutes per feed.",
    jobType: "calendar_sync",
    scheduleCron: "*/30 * * * *",
    enabled: true,
    timeoutSeconds: 300,
    maxRetries: 1,
    config: { respectFeedInterval: true },
  },
  {
    key: "generate_preventive_tasks",
    name: "Generate preventive tasks",
    description:
      "Materialises tasks for every preventive_schedule whose next_due_on is today or earlier.",
    jobType: "preventive_tasks",
    scheduleCron: "0 5 * * *",
    enabled: true,
    timeoutSeconds: 120,
    maxRetries: 1,
    config: null,
  },
  {
    key: "bridge_pending_material_usage",
    name: "Bridge pending material usage to finance",
    description:
      "Walks pending task_material_usage rows and creates expense_lines where chargeable. Respects locked statement periods.",
    jobType: "finance_bridge",
    scheduleCron: "0 */3 * * *",
    enabled: true,
    timeoutSeconds: 180,
    maxRetries: 1,
    config: null,
  },
  {
    key: "scan_low_stock",
    name: "Scan for low-stock items",
    description:
      "Lists items below their reorder_point and queues a daily low_stock_alert notification (deduped per day).",
    jobType: "low_stock_scan",
    scheduleCron: "0 7 * * *",
    enabled: true,
    timeoutSeconds: 60,
    maxRetries: 1,
    config: null,
  },
  {
    key: "notification_digest_internal",
    name: "Internal notification digest",
    description:
      "Aggregates queued notifications into a daily internal-staff summary. Disabled until v8 ships providers.",
    jobType: "notification_digest",
    scheduleCron: "0 8 * * *",
    enabled: false,
    timeoutSeconds: 60,
    maxRetries: 0,
    config: null,
  },
];

export function findJobDefinition(key: string): JobDefinitionSeed | undefined {
  return DEFAULT_JOB_DEFINITIONS.find((d) => d.key === key);
}
