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
  | "notification_digest"
  | "notification_delivery"
  | "ai_summary"
  | "attachment_cleanup"
  | "guest_journey"
  | "owner_intelligence"
  | "booking_lifecycle"
  // Packet C PR 3 — statement-preparer cron.
  | "statement_preparer"
  // phase-2a PR 3 — maintenance SLA breach scan.
  | "sla_scan";

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
    key: "deliver_pending_notifications",
    name: "Deliver pending notifications",
    description:
      "Worker job: walks queued notifications and dispatches via in-app / email / SMS / WhatsApp providers. Honours preferences + quiet hours. Defaults to dry-run when external provider env is absent.",
    jobType: "notification_delivery",
    scheduleCron: "*/10 * * * *",
    enabled: true,
    timeoutSeconds: 240,
    maxRetries: 1,
    config: null,
  },
  {
    key: "notification_digest_internal",
    name: "Internal notification digest",
    description:
      "Builds a daily snapshot (conflicts, failed jobs, urgent tasks, low stock, pending bridge) and queues one in-app digest per internal role.",
    jobType: "notification_digest",
    scheduleCron: "0 8 * * *",
    enabled: true,
    timeoutSeconds: 60,
    maxRetries: 0,
    config: null,
  },
  {
    // v8B — AI Operations Co-pilot daily refresh. DISABLED by default
    // because (a) it depends on ANTHROPIC_API_KEY and (b) operators
    // typically want to opt-in to spending tokens on a cadence. The
    // dashboard exposes a manual refresh button; this job is for
    // organisations that want a fresh briefing waiting at 06:00 local.
    key: "ai_operations_summary_refresh",
    name: "AI Operations Co-pilot — daily refresh",
    description:
      "Generates the daily Operations Co-pilot briefing. Disabled by default; falls back to deterministic summary if AI is dry-run or the model errors. Excluded from /api/cron/run-all unless enabled.",
    jobType: "ai_summary",
    scheduleCron: "0 6 * * *",
    enabled: false,
    timeoutSeconds: 60,
    maxRetries: 0,
    config: null,
  },
  {
    // v9L — sweeps stale `pending` rows in
    // `guest_ai_handoff_reply_attachments` after a 24h grace window.
    // Storage objects are deleted (best-effort) and the row flips to
    // `upload_status='deleted'` with `deleted_reason='stale_pending'`.
    key: "guest_request_attachment_cleanup",
    name: "Guest request attachments — cleanup stale pending",
    description:
      "Sweeps guest concierge attachments stuck in `pending` status for >24h. Deletes the storage object (best-effort) and marks the row deleted with reason `stale_pending`.",
    jobType: "attachment_cleanup",
    scheduleCron: "0 4 * * *",
    enabled: true,
    timeoutSeconds: 120,
    maxRetries: 0,
    config: null,
  },
  {
    // Prompt 102 — walks pending journey runs that are due now and
    // dispatches them. Idempotent via the (booking, rule) unique
    // index; safe to run frequently.
    key: "guest_journey_due_rules",
    name: "Guest journey — run due rules",
    description:
      "Walks pending guest_journey_runs whose scheduled_for <= now and dispatches them (suggestion + notification + journey event). Idempotent.",
    jobType: "guest_journey",
    scheduleCron: "*/15 * * * *",
    enabled: true,
    timeoutSeconds: 120,
    maxRetries: 1,
    config: null,
  },
  {
    // Prompt 102 — daily sweep over recent checkouts to create the
    // post-stay review request for each (one row per booking +
    // channel combination, deduped by the unique index).
    key: "guest_review_requests",
    name: "Guest journey — post-stay review requests",
    description:
      "Sweeps recent checkouts (last 14d) without a review request and creates one. Channel routed by booking distribution channel.",
    jobType: "guest_journey",
    scheduleCron: "0 10 * * *",
    enabled: true,
    timeoutSeconds: 120,
    maxRetries: 0,
    config: null,
  },
  {
    // Prompt 102 — nightly rebuild of owner_visible_events. Replaces
    // the Prompt 101 stub.
    key: "owner_visible_events_rebuild",
    name: "Owner intelligence — rebuild owner-visible events",
    description:
      "Rebuilds the owner_visible_events projection (-90d .. +120d) from canonical sources. Owner-safe by construction.",
    jobType: "owner_intelligence",
    scheduleCron: "0 3 * * *",
    enabled: true,
    timeoutSeconds: 240,
    maxRetries: 0,
    config: null,
  },
  {
    // Prompt 105 — sweep expired direct-booking holds + linked
    // submitted requests; release internal_hold blocks.
    key: "direct_booking_hold_expiry",
    name: "Direct booking — hold expiry sweep",
    description:
      "Walks active direct_booking_holds whose expires_at < now and expires them. Releases linked internal_hold calendar blocks and expires linked submitted/under_review requests.",
    jobType: "booking_lifecycle",
    scheduleCron: "*/5 * * * *",
    enabled: true,
    timeoutSeconds: 60,
    maxRetries: 1,
    config: null,
  },
  {
    // Prompt 107 — expire pending deposits; cascade to linked
    // requests + holds; release internal_hold blocks.
    key: "direct_booking_deposit_expiry",
    name: "Direct booking — deposit expiry sweep",
    description:
      "Walks pending / requires_action direct_booking_deposits whose expires_at < now and expires them. Cascades to linked submitted/under_review/approved requests and active holds.",
    jobType: "booking_lifecycle",
    scheduleCron: "*/5 * * * *",
    enabled: true,
    timeoutSeconds: 60,
    maxRetries: 1,
    config: null,
  },
  {
    // Prompt 110 — statement transparency layer rebuild.
    key: "statement_transparency_rebuild",
    name: "Finance — statement transparency rebuild",
    description:
      "Rebuilds statement_source_groups, statement_source_group_lines, statement_reconciliation_warnings, and statement_explanation_snapshots for recent statements (period_end within last 120 days, status draft/issued/approved).",
    jobType: "owner_intelligence",
    scheduleCron: "0 5 * * *",
    enabled: true,
    timeoutSeconds: 300,
    maxRetries: 0,
    config: null,
  },
  {
    // Prompt 108 — owner-safe booking projection.  Rebuilds
    // owner_booking_summaries / breakdowns / monthly source mix
    // every night across the rolling window.
    key: "owner_booking_projection_rebuild",
    name: "Owner intelligence — owner booking projection rebuild",
    description:
      "Rebuilds owner_booking_summaries, owner_booking_revenue_breakdowns, and owner_revenue_source_monthly across the rolling window (-90d .. +365d). Owner-safe by construction.",
    jobType: "owner_intelligence",
    scheduleCron: "0 4 * * *",
    enabled: true,
    timeoutSeconds: 300,
    maxRetries: 0,
    config: null,
  },
  {
    // Packet C PR 3 — statement-preparer cron. 1st of month, 06:00 UTC.
    // Walks active owners × prior month, fires the statement-preparer
    // agent for any missing (owner, period) pairs. Agent body itself is
    // a stub awaiting Phase 2.5+ implementation; the cron + walk are in.
    key: "statement_preparer_monthly",
    name: "Statement preparer — monthly",
    description:
      "1st-of-month walk over active owners; logs missing statements for the prior period and (once the agent body lands) fires the statement-preparer agent.",
    jobType: "statement_preparer",
    scheduleCron: "0 6 1 * *",
    enabled: true,
    timeoutSeconds: 600,
    maxRetries: 1,
    config: null,
  },
  {
    // phase-2a PR 3 — maintenance SLA breach scan. Route:
    // /api/cron/maintenance-sla-scan. Walks open maintenance tickets,
    // recomputes computeSlaStatus against the p0-p3 target windows, and
    // logs an sla_breaches row (deduped per open breach) for each past
    // its target. Idempotent; safe at any cadence.
    key: "maintenance_sla_scan",
    name: "Maintenance SLA breach scan",
    description:
      "Scans open maintenance tickets and logs an sla_breaches row (deduped per open breach) for any past its severity SLA target (p0 2h / p1 8h / p2 48h / p3 14d).",
    jobType: "sla_scan",
    scheduleCron: "*/30 * * * *",
    enabled: true,
    timeoutSeconds: 120,
    maxRetries: 1,
    config: null,
  },
];

export function findJobDefinition(key: string): JobDefinitionSeed | undefined {
  return DEFAULT_JOB_DEFINITIONS.find((d) => d.key === key);
}
