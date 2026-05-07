# Vercel Cron Checklist — Arconique Management OS

This checklist documents every cron route currently implemented under
`src/app/api/cron/*`, the matching job key in
`src/features/jobs/actions.ts`, the suggested schedule, the env
variables it depends on, and whether it's safe in staging /
production.

**Authentication**

Every route below uses `handleCronJobRequest(request, "<jobKey>")`,
which:

1. Reads the `Authorization: Bearer <CRON_SECRET>` header.
2. Refuses (`401`) when the secret is missing or wrong.
3. Falls through to the dispatch table in
   `src/features/jobs/actions.ts`, which acquires a lock from
   `job_locks` (Prompt 111) before running.

In production, `CRON_SECRET` MUST be set; the env validator (Prompt 113)
fails fatal if it is missing.  Do **not** set
`ALLOW_DEV_CRON_WITHOUT_SECRET=1` in production.

## Routes

| Route | Job key | Suggested schedule | Required env | Idempotency | Safe in staging | Enabled in production |
|---|---|---|---|---|---|---|
| `/api/cron/calendar-sync` | `calendar_sync_active_feeds` | `*/30 * * * *` | `CRON_SECRET`, `DATABASE_URL` | Re-runs are no-ops via feed `last_synced_at` | ✓ | ✓ |
| `/api/cron/preventive-tasks` | `generate_preventive_tasks` | `0 5 * * *` | `CRON_SECRET`, `DATABASE_URL` | Tasks idempotent by `(schedule_id, due_date)` | ✓ | ✓ |
| `/api/cron/material-usage-bridge` | `bridge_pending_material_usage` | `0 6 * * *` | `CRON_SECRET`, `DATABASE_URL` | Bridge rows UNIQUE per task / movement | ✓ | ✓ |
| `/api/cron/low-stock-scan` | `scan_low_stock` | `*/15 * * * *` | `CRON_SECRET`, `DATABASE_URL` | Always recomputes; no inserts on no-change | ✓ | ✓ |
| `/api/cron/notifications-deliver` | `deliver_pending_notifications` | `*/2 * * * *` | `CRON_SECRET`, `DATABASE_URL`, optional `RESEND_API_KEY` / Twilio creds | `FOR UPDATE SKIP LOCKED` (Prompt 111); idempotent per `dedupe_key` | ✓ | ✓ |
| `/api/cron/notifications-digest` | `notification_digest_internal` | `0 7,16 * * *` | `CRON_SECRET`, `DATABASE_URL` | Digest insert dedup by `(role, day)` | ✓ | ✓ |
| `/api/cron/ai-operations-summary` | `ai_operations_summary_refresh` | `0 4 * * *` | `CRON_SECRET`, `DATABASE_URL`; live AI requires `ANTHROPIC_API_KEY` + `AI_DRY_RUN=0` | Summaries upsert per `(scope, day)` | ✓ | ✓ (dry-run-friendly) |
| `/api/cron/guest-request-attachments-cleanup` | `guest_request_attachment_cleanup` | `0 3 * * *` | `CRON_SECRET`, `DATABASE_URL`, Supabase service role | Cleanup deletes via signed-URL provider; idempotent | ✓ | ✓ |
| `/api/cron/guest-journey` | `guest_journey_due_rules` | `*/15 * * * *` | `CRON_SECRET`, `DATABASE_URL` | Rules dedup by `(rule_id, target_id, day)` | ✓ | ✓ |
| `/api/cron/guest-review-requests` | `guest_review_requests` | `0 8 * * *` | `CRON_SECRET`, `DATABASE_URL` | Insert dedup by `(booking_id, requested_at::date)` | ✓ | ✓ |
| `/api/cron/owner-visible-events-rebuild` | `owner_visible_events_rebuild` | `0 3 * * *` | `CRON_SECRET`, `DATABASE_URL` | Wipe + reinsert per owner per window | ✓ | ✓ |
| `/api/cron/direct-booking-expiry` | `direct_booking_hold_expiry` | `*/5 * * * *` | `CRON_SECRET`, `DATABASE_URL` | Sweep is idempotent | ✓ | ✓ |
| `/api/cron/direct-booking-deposit-expiry` | `direct_booking_deposit_expiry` | `*/5 * * * *` | `CRON_SECRET`, `DATABASE_URL` | Sweep is idempotent | ✓ | ✓ |
| `/api/cron/owner-booking-projection-rebuild` | `owner_booking_projection_rebuild` | `0 4 * * *` | `CRON_SECRET`, `DATABASE_URL` | Wipe + reinsert per owner per window | ✓ | ✓ |
| `/api/cron/statement-transparency-rebuild` | `statement_transparency_rebuild` | `0 5 * * *` | `CRON_SECRET`, `DATABASE_URL` | Wipe + reinsert per statement; warnings upsert by `(type, source_id)` | ✓ | ✓ |
| `/api/cron/dev-os-pricing-apply` | `dev_os_pricing_apply` | `0 2 * * *` | `CRON_SECRET`, `DATABASE_URL` | One snapshot per villa/day per trigger | ✓ | ✓ |
| `/api/cron/dev-os-reservation-expiry` | `dev_os_reservation_expiry` | `*/15 * * * *` | `CRON_SECRET`, `DATABASE_URL` | Status filter only walks pre-expiry rows | ✓ | ✓ |
| `/api/cron/dev-os-milestone-pre-invoice` | `dev_os_milestone_pre_invoice` | `0 3 * * *` | `CRON_SECRET`, `DATABASE_URL` | Walks `pending` rows only; transitions to `pre_invoiced` | ✓ | ✓ |
| `/api/cron/dev-os-milestone-invoice` | `dev_os_milestone_invoice` | `0 3 * * *` | `CRON_SECRET`, `DATABASE_URL` | Walks `pending` / `pre_invoiced` rows only | ✓ | ✓ |
| `/api/cron/dev-os-milestone-overdue` | `dev_os_milestone_overdue` | `0 4 * * *` | `CRON_SECRET`, `DATABASE_URL` | Walks `invoiced` rows only; cutoff = due + grace | ✓ | ✓ |
| `/api/cron/dev-os-late-fee-accrual` | `dev_os_late_fee_accrual` | `0 5 * * *` | `CRON_SECRET`, `DATABASE_URL` | Unique index `(milestone, date_trunc('day', accrued_at))` | ✓ | ✓ |
| `/api/cron/dev-os-notification-dispatch` | `dev_os_notification_dispatch` | `*/30 * * * *` | `CRON_SECRET`, `DATABASE_URL`, `RESEND_API_KEY` (optional — falls to dry-run) | Per `(rule, entity)` 24h dedup window in delivery log | ✓ | ✓ (dry-run-friendly via `EMAIL_DRY_RUN`) |
| `/api/cron/dev-os-overdue-drawdown` | `dev_os_overdue_drawdown` | `0 6 * * *` | `CRON_SECRET`, `DATABASE_URL` | UPDATE WHERE status='requested' — re-runs are no-ops | ✓ | ✓ |
| `/api/cron/dev-os-fx-snapshot` | `dev_os_fx_snapshot` | `0 1 * * *` | `CRON_SECRET`, `DATABASE_URL` | UNIQUE on `snapshot_date`; rolls forward if absent | ✓ | ✓ |
| `/api/cron/dev-os-balance-alert` | `dev_os_balance_alert` | `0 */4 * * *` | `CRON_SECRET`, `DATABASE_URL` | 24h cooldown via `last_balance_alert_at` per account | ✓ | ✓ |
| `/api/cron/dev-os-self-sustaining-check` | `dev_os_self_sustaining_check` | `0 7 * * *` | `CRON_SECRET`, `DATABASE_URL` | Notification only fires on state transition | ✓ | ✓ |
| `/api/cron/dev-os-balance-reconciliation` | `dev_os_balance_reconciliation` | `0 8 * * *` | `CRON_SECRET`, `DATABASE_URL` | Pure read + alert; no mutations on this path | ✓ | ✓ |
| `/api/cron/dev-os-overdue-delivery` | `dev_os_overdue_delivery` | `0 9 * * *` | `CRON_SECRET`, `DATABASE_URL` | Per-PO 24h cooldown via delivery_log dedup | ✓ | ✓ |
| `/api/cron/dev-os-missing-site-report` | `dev_os_missing_site_report` | `0 19 * * *` | `CRON_SECRET`, `DATABASE_URL` | Per-(project, day) — 14d activity filter excludes dormant projects | ✓ | ✓ |
| `/api/cron/dev-os-safety-escalation` | `dev_os_safety_escalation` | `0 */6 * * *` | `CRON_SECRET`, `DATABASE_URL` | Per-incident 24h cooldown; only severe/fatal open >24h | ✓ | ✓ |
| `/api/cron/dev-os-photo-analyst` | `dev_os_photo_analyst` | `*/15 * * * *` | `CRON_SECRET`, `DATABASE_URL`, `ANTHROPIC_API_KEY` (live), `SUPABASE_SERVICE_ROLE_KEY` (live) | Photos analyzed once (`ai_analyzed_at IS NOT NULL` filter); per-tick budget gate stops loop on cap | ✓ | ✓ |
| `/api/cron/dev-os-vendor-performance` | `dev_os_vendor_performance` | `0 2 * * *` | `CRON_SECRET`, `DATABASE_URL` | Pure recompute — re-running rewrites identical numbers when source data is unchanged | ✓ | ✓ |
| `/api/cron/dev-os-construction-supervisor` | `dev_os_construction_supervisor` | `*/30 * * * *` | `CRON_SECRET`, `DATABASE_URL`, `ANTHROPIC_API_KEY` (live) | Partial-unique active-analysis index prevents duplicate work; budget gate stops loop on cap | ✓ | ✓ |
| `/api/cron/dev-os-distribution-preview` | `dev_os_distribution_preview` | `0 10 * * 1` | `CRON_SECRET`, `DATABASE_URL`, `ANTHROPIC_API_KEY` (live) | Partial-unique active-suggestion index + 30-day cooldown gate before provider call | ✓ | ✓ |
| `/api/cron/dev-os-document-extraction` | `dev_os_document_extraction` | `*/30 * * * *` | `CRON_SECRET`, `DATABASE_URL`, `ANTHROPIC_API_KEY` (live), `SUPABASE_SERVICE_ROLE_KEY` (live) | Partial-unique active-extraction index; vision-only for image MIMEs | ✓ | ✓ |
| `/api/cron/dev-os-whatsapp-inbound-processor` | `dev_os_whatsapp_inbound_processor` | `*/2 * * * *` | `CRON_SECRET`, `DATABASE_URL`, `ANTHROPIC_API_KEY` (live), `TWILIO_ACCOUNT_SID` (live) | Picks up `status='received'` rows the webhook persisted; processed rows naturally drop on next tick | ✓ | ✓ |
| `/api/cron/dev-os-tax-classification-reminder` | `dev_os_tax_classification_reminder` | `0 9 * * *` | `CRON_SECRET`, `DATABASE_URL` | Pure read + warn — flags `unclassified` txns older than 7 days | ✓ | ✓ |
| `/api/cron/dev-os-permit-expiry-alert` | `dev_os_permit_expiry_alert` | `0 9 * * *` | `CRON_SECRET`, `DATABASE_URL` | Pure read + warn — buckets at 30/60/90 days | ✓ | ✓ |
| `/api/cron/dev-os-land-installment-due` | `dev_os_land_installment_due` | `0 9 * * *` | `CRON_SECRET`, `DATABASE_URL` | Pure read + warn — 14d horizon + overdue split | ✓ | ✓ |
| `/api/cron/dev-os-tax-period-report` | `dev_os_tax_period_report` | `0 2 1 * *` | `CRON_SECRET`, `DATABASE_URL` | Idempotent UPSERT on (tax_type, period_start, period_end); operator finalises manually | ✓ | ✓ |
| `/api/cron/dev-os-purchase-request-expiry` | `dev_os_purchase_request_expiry` | `0 18 * * *` | `CRON_SECRET`, `DATABASE_URL` | Pure read + warn — flags PRs past required_by_date | ✓ | ✓ |
| `/api/cron/dev-os-wallet-recompute` | `dev_os_wallet_recompute` | `0 3 * * *` | `CRON_SECRET`, `DATABASE_URL` | Recomputes economic_balance + residual_inventory_value per investor wallet (Stage 4.B.2) | ✓ | ✓ |
| `/api/cron/dev-os-buyer-progress-reminder` | `dev_os_buyer_progress_reminder` | `0 9 * * 1` | `CRON_SECRET`, `DATABASE_URL` | Pure read + warn — projects with stale (>30d) buyer progress reports (Stage 4.B.3) | ✓ | ✓ |
| `/api/cron/dev-os-investor-request-escalation` | `dev_os_investor_request_escalation` | `0 9 * * *` | `CRON_SECRET`, `DATABASE_URL` | Pure read + warn — investor portal requests stuck in submitted/under_review > 5 days (Stage 4.B.3) | ✓ | ✓ |
| `/api/cron/dev-os-critical-path-recompute` | `dev_os_critical_path_recompute` | `30 3 * * *` | `CRON_SECRET`, `DATABASE_URL` | CPM recompute per project: cycle-check → forward+backward pass → update is_on_critical_path / early/late dates / float (Stage 4.C.2) | ✓ | ✓ |
| `/api/cron/dev-os-qa-qc-deadline-alert` | `dev_os_qa_qc_deadline_alert` | `0 9 * * *` | `CRON_SECRET`, `DATABASE_URL` | Pure read + warn — QA/QC issues within 7d of deadline or overdue (Stage 4.C.1) | ✓ | ✓ |
| `/api/cron/dev-os-risk-elevation-alert` | `dev_os_risk_elevation_alert` | `0 9 * * 1` | `CRON_SECRET`, `DATABASE_URL` | Pure read + warn — risks with score ≥ 15 not yet closed (Stage 4.C.3) | ✓ | ✓ |
| `/api/cron/dev-os-inventory-low-stock-alert` | `dev_os_inventory_low_stock_alert` | `0 9 * * *` | `CRON_SECRET`, `DATABASE_URL` | Pure read + warn — items at or below reorder point per (item × location) (Stage 4.C.1) | ✓ | ✓ |
| `/api/cron/dev-os-project-cycle-advisory` | `dev_os_project_cycle_advisory` | `0 6 * * 1` | `CRON_SECRET`, `DATABASE_URL` | Generates one operator-reviewed PCR-YYYY-### recommendation per run; weekly cadence (Stage 5.B.2) | ✓ | ✓ |
| `/api/cron/dev-os-profitability-recompute` | `dev_os_profitability_recompute` | `0 2 * * 0` | `CRON_SECRET`, `DATABASE_URL` | Recompute scan — full per-unit allocation requires explicit operator trigger (Stage 5.B.3) | ✓ | ✓ |
| `/api/cron/dev-os-cashflow-autogenerate` | `dev_os_cashflow_autogenerate` | `0 3 1 * *` | `CRON_SECRET`, `DATABASE_URL` | Inserts one company-wide draft 12-month forecast on the 1st of each month; operator must promote to active (Stage 5.B.4) | ✓ | ✓ |
| `/api/cron/dev-os-executive-metrics-daily` | `dev_os_executive_metrics_daily` | `0 4 * * *` | `CRON_SECRET`, `DATABASE_URL` | Computes daily company-wide executive snapshot (cash, projects, sales, capital, ops, profitability, forecast). Powers dashboard widgets (Stage 5.C.1) | ✓ | ✓ |
| `/api/cron/dev-os-risk-radar-weekly` | `dev_os_risk_radar_weekly` | `0 7 * * 1` | `CRON_SECRET`, `DATABASE_URL`, `ANTHROPIC_API_KEY` (optional — falls to rule-based only) | Runs rule-based risk pattern detection + optional AI augmentation; deduped against open alerts (Stage 5.C.3) | ✓ | ✓ |
| `/api/cron/dev-os-executive-digest-monthly` | `dev_os_executive_digest_monthly` | `0 6 1 * *` | `CRON_SECRET`, `DATABASE_URL` | Generates monthly executive digest as draft for CEO review; UNIQUE digest_code prevents duplicates (Stage 5.C.3) | ✓ | ✓ |
| `/api/cron/dev-os-daily-construction-digest` | `dev_os_daily_construction_digest` | `0 22 * * *` | `CRON_SECRET`, `DATABASE_URL`, `ANTHROPIC_API_KEY` (optional — falls to dry-run) | Per-project end-of-day construction digest (Stage 5.D.4) | ✓ | ✓ |
| `/api/cron/dev-os-weekly-construction-plan` | `dev_os_weekly_construction_plan` | `0 18 * * 0` | `CRON_SECRET`, `DATABASE_URL`, `ANTHROPIC_API_KEY` (optional) | Per-project Sunday-evening forward weekly plan (Stage 5.D.4) | ✓ | ✓ |
| `/api/cron/dev-os-ai-memory-aggregator` | `dev_os_ai_memory_aggregator` | `0 2 * * *` | `CRON_SECRET`, `DATABASE_URL` | Refreshes last_observed_at on stale memory items; idempotent (Stage 5.D.1) | ✓ | ✓ |
| `/api/cron/dev-os-content-publish-scheduler` | `dev_os_content_publish_scheduler` | `0 * * * *` | `CRON_SECRET`, `DATABASE_URL` | Marks `content_pieces` published when scheduled_publish_at <= now() (Stage 5.E.2) | ✓ | ✓ |
| `/api/cron/dev-os-manager-performance-recompute` | `dev_os_manager_performance_recompute` | `0 4 * * 1` | `CRON_SECRET`, `DATABASE_URL` | Weekly per-manager performance snapshot upsert (Stage 5.E.3) | ✓ | ✓ |
| `/api/cron/dev-os-missed-followup-detector` | `dev_os_missed_followup_detector` | `0 9 * * *` | `CRON_SECRET`, `DATABASE_URL` | Creates risk_radar_alerts for sales threads idle > 5 days; idempotent via UNIQUE alert_code (Stage 5.E.3) | ✓ | ✓ |
| `/api/cron/dev-os-baseline-variance-recompute` | `dev_os_baseline_variance_recompute` | `0 3 * * *` | `CRON_SECRET`, `DATABASE_URL` | Refreshes variance_status for every active baseline (Stage 5.H.2) | ✓ | ✓ |
| `/api/cron/dev-os-resource-conflict-detector` | `dev_os_resource_conflict_detector` | `0 4 * * *` | `CRON_SECRET`, `DATABASE_URL` | Scans next 30 days for over-allocations; emits risk_radar_alerts; idempotent via UNIQUE alert_code (Stage 5.H.3) | ✓ | ✓ |
| `/api/cron/dev-os-productivity-aggregation` | `dev_os_productivity_aggregation` | `0 5 * * *` | `CRON_SECRET`, `DATABASE_URL` | Refreshes per-trade productivity aggregations from last 30 days (Stage 5.H.3) | ✓ | ✓ |
| `/api/cron/dev-os-push-notification-dispatch` | `dev_os_push_notification_dispatch` | `*/5 * * * *` | `CRON_SECRET`, `DATABASE_URL`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (optional — falls to dry-run) | Dispatches pending notification_dispatch_log rows via web-push (Stage 5.I) | ✓ | ✓ |
| `/api/cron/dev-os-failed-subscriptions-cleanup` | `dev_os_failed_subscriptions_cleanup` | `0 2 * * *` | `CRON_SECRET`, `DATABASE_URL` | Marks push subscriptions inactive after >5 consecutive failures (Stage 5.I) | ✓ | ✓ |
| `/api/cron/dev-os-offline-queue-stats` | `dev_os_offline_queue_stats` | `0 6 * * *` | `CRON_SECRET`, `DATABASE_URL` | Aggregates offline queue stats + prunes completed/duplicate/rejected rows older than 90 days (Stage 5.I) | ✓ | ✓ |
| `/api/cron/dev-os-webhook-delivery` | `dev_os_webhook_delivery` | `*/2 * * * *` | `CRON_SECRET`, `DATABASE_URL` | Picks pending/retrying `webhook_delivery_log` rows past `next_retry_at` and dispatches each with HMAC-SHA256 signing; auto-disables subscriptions after 10 consecutive failures (Stage 5.J) | ✓ | ✓ |
| `/api/cron/dev-os-api-log-cleanup` | `dev_os_api_log_cleanup` | `0 3 * * *` | `CRON_SECRET`, `DATABASE_URL` | Prunes `api_request_log` rows older than 90 days (already aggregated into `usage_metrics`) (Stage 5.J) | ✓ | ✓ |
| `/api/cron/dev-os-usage-metrics-aggregation` | `dev_os_usage_metrics_aggregation` | `0 4 * * *` | `CRON_SECRET`, `DATABASE_URL` | Computes today's `daily_summary` row in `usage_metrics` for every active organization; idempotent UPSERT on `(org, period, type)` (Stage 5.J) | ✓ | ✓ |
| `/api/cron/dev-os-data-export-processor` | `dev_os_data_export_processor` | `*/10 * * * *` | `CRON_SECRET`, `DATABASE_URL` | Processes pending `data_export_requests` rows + clears download URLs whose 7-day TTL has passed (Stage 5.J) | ✓ | ✓ |
| `/api/cron/dev-os-rate-limit-cleanup` | `dev_os_rate_limit_cleanup` | `0 5 * * *` | `CRON_SECRET`, `DATABASE_URL` | Drops `rate_limit_buckets` rows whose `window_start` is more than 24h old (Stage 5.J) | ✓ | ✓ |
| `/api/cron/dev-os-bulk-import-processor` | `dev_os_bulk_import_processor` | `*/2 * * * *` | `CRON_SECRET`, `DATABASE_URL` | Picks `bulk_import_jobs` in `ready` state (or stuck `processing` >10min) and runs ONE 1000-row batch each per cron firing. Idempotent on `processed_rows` resume. (Stage 6.P0.7) | ✓ | ✓ |
| `/api/cron/channel-inventory-sync` | `channel_inventory_sync` | `*/15 * * * *` | `CRON_SECRET`, `DATABASE_URL`, `STAY_LINK_KMS_SECRET` | Pushes current availability to every active channel connection. One bad connection doesn't abort the batch. DryRun providers no-op with `apiCallsCount=0`. (Stage 6.P1.G) | ✓ | ✓ |
| `/api/cron/channel-rates-sync` | `channel_rates_sync` | `*/30 * * * *` | `CRON_SECRET`, `DATABASE_URL`, `STAY_LINK_KMS_SECRET` | Pushes per-day rates to active channel connections. Skips connections with no rates configured. (Stage 6.P1.G) | ✓ | ✓ |
| `/api/cron/channel-reservations-pull` | `channel_reservations_pull` | `*/5 * * * *` | `CRON_SECRET`, `DATABASE_URL`, `STAY_LINK_KMS_SECRET` | Pulls modified-since reservations from each active connection and feeds through `handleIncomingReservation`. Webhook fallback. (Stage 6.P1.G) | ✓ | ✓ |
| `/api/cron/channel-conflict-detector` | `channel_conflict_detector` | `0 * * * *` | `CRON_SECRET`, `DATABASE_URL` | Hourly sweep over recent channel reservations to flag overlaps the per-reservation pipeline missed. Surfaces on `/development-os/channels/conflicts`. (Stage 6.P1.G) | ✓ | ✓ |
| `/api/cron/channel-commission-reconciliation` | `channel_commission_reconciliation` | `0 2 * * *` | `CRON_SECRET`, `DATABASE_URL` | Daily auto-reconcile (invoice + payment both true) + flag stale (>30d) commission records for bookkeeper attention. (Stage 6.P1.G) | ✓ | ✓ |
| `/api/cron/messaging-inbound-poll` | `messaging_inbound_poll` | `*/5 * * * *` | `CRON_SECRET`, `DATABASE_URL`, `STAY_LINK_KMS_SECRET` | Bootstrap no-op shell. Webhook channels (WhatsApp, Telegram, IG, Messenger) push in real time. Reserved for Gmail pull-mode + future IMAP. (Stage 6.P2.F) | ✓ | ✓ |
| `/api/cron/messaging-status-sync` | `messaging_status_sync` | `*/15 * * * *` | `CRON_SECRET`, `DATABASE_URL` | Reconciles outbound `conversation_messages` rows stuck in `queued/sending/sent` for >24h to `failed` so the inbox UI never shows an indefinite "sending" pill. (Stage 6.P2.F) | ✓ | ✓ |
| `/api/cron/messaging-auto-response-evaluator` | `messaging_auto_response_evaluator` | `* * * * *` | `CRON_SECRET`, `DATABASE_URL` | Evaluates time-based auto-response rules (`after_hours`, `no_response_timeout`). Inbound-driven rules already fire from the service layer. (Stage 6.P2.F) | ✓ | ✓ |
| `/api/cron/messaging-cleanup` | `messaging_cleanup` | `0 3 * * *` | `CRON_SECRET`, `DATABASE_URL` | Auto-archives `conversation_threads` inactive >90 days. Reversible via inbox UI. (Stage 6.P2.F) | ✓ | ✓ |
| `/api/cron/run-all` | `(dispatcher)` | manual / on-demand | `CRON_SECRET`, `DATABASE_URL` | Iterates the dispatch table; per-job locks apply | ✓ | not scheduled by default |

## Vercel setup

Vercel reads cron schedules from `vercel.json` at the repo root.
Create one if you haven't:

```json
{
  "crons": [
    { "path": "/api/cron/calendar-sync", "schedule": "*/30 * * * *" },
    { "path": "/api/cron/preventive-tasks", "schedule": "0 5 * * *" },
    { "path": "/api/cron/material-usage-bridge", "schedule": "0 6 * * *" },
    { "path": "/api/cron/low-stock-scan", "schedule": "*/15 * * * *" },
    { "path": "/api/cron/notifications-deliver", "schedule": "*/2 * * * *" },
    { "path": "/api/cron/notifications-digest", "schedule": "0 7,16 * * *" },
    { "path": "/api/cron/ai-operations-summary", "schedule": "0 4 * * *" },
    { "path": "/api/cron/guest-request-attachments-cleanup", "schedule": "0 3 * * *" },
    { "path": "/api/cron/guest-journey", "schedule": "*/15 * * * *" },
    { "path": "/api/cron/guest-review-requests", "schedule": "0 8 * * *" },
    { "path": "/api/cron/owner-visible-events-rebuild", "schedule": "0 3 * * *" },
    { "path": "/api/cron/direct-booking-expiry", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/direct-booking-deposit-expiry", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/owner-booking-projection-rebuild", "schedule": "0 4 * * *" },
    { "path": "/api/cron/statement-transparency-rebuild", "schedule": "0 5 * * *" },
    { "path": "/api/cron/dev-os-pricing-apply", "schedule": "0 2 * * *" },
    { "path": "/api/cron/dev-os-reservation-expiry", "schedule": "*/15 * * * *" },
    { "path": "/api/cron/dev-os-milestone-pre-invoice", "schedule": "0 3 * * *" },
    { "path": "/api/cron/dev-os-milestone-invoice", "schedule": "0 3 * * *" },
    { "path": "/api/cron/dev-os-milestone-overdue", "schedule": "0 4 * * *" },
    { "path": "/api/cron/dev-os-late-fee-accrual", "schedule": "0 5 * * *" },
    { "path": "/api/cron/dev-os-notification-dispatch", "schedule": "*/30 * * * *" },
    { "path": "/api/cron/dev-os-overdue-drawdown", "schedule": "0 6 * * *" },
    { "path": "/api/cron/dev-os-fx-snapshot", "schedule": "0 1 * * *" },
    { "path": "/api/cron/dev-os-balance-alert", "schedule": "0 */4 * * *" },
    { "path": "/api/cron/dev-os-self-sustaining-check", "schedule": "0 7 * * *" },
    { "path": "/api/cron/dev-os-balance-reconciliation", "schedule": "0 8 * * *" },
    { "path": "/api/cron/dev-os-overdue-delivery", "schedule": "0 9 * * *" },
    { "path": "/api/cron/dev-os-missing-site-report", "schedule": "0 19 * * *" },
    { "path": "/api/cron/dev-os-safety-escalation", "schedule": "0 */6 * * *" },
    { "path": "/api/cron/dev-os-photo-analyst", "schedule": "*/15 * * * *" },
    { "path": "/api/cron/dev-os-vendor-performance", "schedule": "0 2 * * *" },
    { "path": "/api/cron/dev-os-construction-supervisor", "schedule": "*/30 * * * *" },
    { "path": "/api/cron/dev-os-distribution-preview", "schedule": "0 10 * * 1" },
    { "path": "/api/cron/dev-os-document-extraction", "schedule": "*/30 * * * *" },
    { "path": "/api/cron/dev-os-whatsapp-inbound-processor", "schedule": "*/2 * * * *" },
    { "path": "/api/cron/dev-os-tax-classification-reminder", "schedule": "0 9 * * *" },
    { "path": "/api/cron/dev-os-permit-expiry-alert", "schedule": "0 9 * * *" },
    { "path": "/api/cron/dev-os-land-installment-due", "schedule": "0 9 * * *" },
    { "path": "/api/cron/dev-os-tax-period-report", "schedule": "0 2 1 * *" },
    { "path": "/api/cron/dev-os-purchase-request-expiry", "schedule": "0 18 * * *" },
    { "path": "/api/cron/dev-os-wallet-recompute", "schedule": "0 3 * * *" },
    { "path": "/api/cron/dev-os-buyer-progress-reminder", "schedule": "0 9 * * 1" },
    { "path": "/api/cron/dev-os-investor-request-escalation", "schedule": "0 9 * * *" },
    { "path": "/api/cron/dev-os-critical-path-recompute", "schedule": "30 3 * * *" },
    { "path": "/api/cron/dev-os-qa-qc-deadline-alert", "schedule": "0 9 * * *" },
    { "path": "/api/cron/dev-os-risk-elevation-alert", "schedule": "0 9 * * 1" },
    { "path": "/api/cron/dev-os-inventory-low-stock-alert", "schedule": "0 9 * * *" },
    { "path": "/api/cron/dev-os-project-cycle-advisory", "schedule": "0 6 * * 1" },
    { "path": "/api/cron/dev-os-profitability-recompute", "schedule": "0 2 * * 0" },
    { "path": "/api/cron/dev-os-cashflow-autogenerate", "schedule": "0 3 1 * *" },
    { "path": "/api/cron/dev-os-executive-metrics-daily", "schedule": "0 4 * * *" },
    { "path": "/api/cron/dev-os-risk-radar-weekly", "schedule": "0 7 * * 1" },
    { "path": "/api/cron/dev-os-executive-digest-monthly", "schedule": "0 6 1 * *" },
    { "path": "/api/cron/dev-os-daily-construction-digest", "schedule": "0 22 * * *" },
    { "path": "/api/cron/dev-os-weekly-construction-plan", "schedule": "0 18 * * 0" },
    { "path": "/api/cron/dev-os-ai-memory-aggregator", "schedule": "0 2 * * *" },
    { "path": "/api/cron/dev-os-content-publish-scheduler", "schedule": "0 * * * *" },
    { "path": "/api/cron/dev-os-manager-performance-recompute", "schedule": "0 4 * * 1" },
    { "path": "/api/cron/dev-os-missed-followup-detector", "schedule": "0 9 * * *" },
    { "path": "/api/cron/dev-os-baseline-variance-recompute", "schedule": "0 3 * * *" },
    { "path": "/api/cron/dev-os-resource-conflict-detector", "schedule": "0 4 * * *" },
    { "path": "/api/cron/dev-os-productivity-aggregation", "schedule": "0 5 * * *" },
    { "path": "/api/cron/dev-os-push-notification-dispatch", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/dev-os-failed-subscriptions-cleanup", "schedule": "0 2 * * *" },
    { "path": "/api/cron/dev-os-offline-queue-stats", "schedule": "0 6 * * *" },
    { "path": "/api/cron/dev-os-webhook-delivery", "schedule": "*/2 * * * *" },
    { "path": "/api/cron/dev-os-api-log-cleanup", "schedule": "0 3 * * *" },
    { "path": "/api/cron/dev-os-usage-metrics-aggregation", "schedule": "0 4 * * *" },
    { "path": "/api/cron/dev-os-data-export-processor", "schedule": "*/10 * * * *" },
    { "path": "/api/cron/dev-os-rate-limit-cleanup", "schedule": "0 5 * * *" },
    { "path": "/api/cron/dev-os-bulk-import-processor", "schedule": "*/2 * * * *" },
    { "path": "/api/cron/channel-inventory-sync", "schedule": "*/15 * * * *" },
    { "path": "/api/cron/channel-rates-sync", "schedule": "*/30 * * * *" },
    { "path": "/api/cron/channel-reservations-pull", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/channel-conflict-detector", "schedule": "0 * * * *" },
    { "path": "/api/cron/channel-commission-reconciliation", "schedule": "0 2 * * *" },
    { "path": "/api/cron/messaging-inbound-poll", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/messaging-status-sync", "schedule": "*/15 * * * *" },
    { "path": "/api/cron/messaging-auto-response-evaluator", "schedule": "* * * * *" },
    { "path": "/api/cron/messaging-cleanup", "schedule": "0 3 * * *" }
  ]
}
```

For non-Vercel deployments (GitHub Actions cron, external scheduler),
invoke the seven Dev OS jobs in one shot via the script wrapper:

```
npx tsx scripts/cron-development-os.ts
```

or one at a time:

```
npx tsx scripts/cron-development-os.ts dev_os_late_fee_accrual
```

Vercel automatically attaches the `Authorization: Bearer <CRON_SECRET>`
header for crons defined this way; you do **not** need to wire that
yourself.

## Static check

Run `npm run check:cron` before every deployment.  The check verifies:

- every directory under `src/app/api/cron/*` has a `route.ts`,
- every route uses `handleCronJobRequest`,
- every job key is present in `KNOWN_JOBS` in `src/features/jobs/actions.ts`,
- every job key + route path appears in this checklist.

## What to do when adding a new cron route

1. Add the runner in `src/features/jobs/<jobKey>-job.ts` and register
   it in `src/features/jobs/actions.ts` (`KNOWN_JOBS`, `JobKey`,
   `executeJob`, `executeAllJobs`).
2. Add a definition entry in `src/features/jobs/definitions.ts` with
   the cron schedule.
3. Create `src/app/api/cron/<slug>/route.ts` calling
   `handleCronJobRequest(request, "<jobKey>")`.
4. Add a row to the table above with the schedule + env + idempotency
   notes.
5. Add the entry to `vercel.json`.
6. Run `npm run check:cron` — it will fail if any of the above is
   missing.
