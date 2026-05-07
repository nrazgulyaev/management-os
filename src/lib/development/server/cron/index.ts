/**
 * Dev OS cron jobs — Stage 2.2.B Cp2.
 *
 * Each runner returns a `JobOutcome` and is idempotent. They wire into
 * the existing Management OS cron pipeline via the `executeJob`
 * dispatcher in `src/features/jobs/actions.ts`. Each is also reachable
 * over HTTP at `/api/cron/dev-os-<key>/route.ts`.
 *
 * Runners do NOT call `withJobRun` themselves — the dispatcher wraps
 * them.
 */

export { runDevOsPricingApply } from "./pricing-apply-job";
export { runDevOsReservationExpiry } from "./reservation-expiry-job";
export { runDevOsMilestonePreInvoice } from "./milestone-pre-invoice-job";
export { runDevOsMilestoneInvoice } from "./milestone-invoice-job";
export { runDevOsMilestoneOverdue } from "./milestone-overdue-job";
export { runDevOsLateFeeAccrual } from "./late-fee-accrual-job";
export { runDevOsNotificationDispatch } from "./notification-dispatch-job";
export { runDevOsOverdueDrawdown } from "./overdue-drawdown-job";
export { runDevOsFxSnapshot } from "./fx-snapshot-job";
export { runDevOsBalanceAlert } from "./balance-alert-job";
export { runDevOsSelfSustainingCheck } from "./self-sustaining-check-job";
export { runDevOsBalanceReconciliation } from "./balance-reconciliation-job";
export { runDevOsOverdueDelivery } from "./overdue-delivery-job";
export { runDevOsMissingSiteReport } from "./missing-site-report-job";
export { runDevOsSafetyEscalation } from "./safety-escalation-job";
export { runDevOsPhotoAnalyst } from "./photo-analyst-job";
export { runDevOsVendorPerformance } from "./vendor-performance-job";
export { runDevOsConstructionSupervisor } from "./construction-supervisor-job";
export { runDevOsDistributionPreview } from "./distribution-preview-job";
export { runDevOsDocumentExtraction } from "./document-extraction-job";
export { runDevOsWhatsappInboundProcessor } from "./whatsapp-inbound-processor-job";
export { runDevOsTaxClassificationReminder } from "./tax-classification-reminder-job";
export { runDevOsPermitExpiryAlert } from "./permit-expiry-alert-job";
export { runDevOsLandInstallmentDue } from "./land-installment-due-job";
export { runDevOsTaxPeriodReport } from "./tax-period-report-job";
export { runDevOsPurchaseRequestExpiry } from "./purchase-request-expiry-job";
export { runDevOsWalletRecompute } from "./wallet-recompute-job";
export { runDevOsBuyerProgressReminder } from "./buyer-progress-reminder-job";
export { runDevOsInvestorRequestEscalation } from "./investor-request-escalation-job";
export { runDevOsCriticalPathRecompute } from "./critical-path-recompute-job";
export { runDevOsQaQcDeadlineAlert } from "./qa-qc-deadline-alert-job";
export { runDevOsRiskElevationAlert } from "./risk-elevation-alert-job";
export { runDevOsInventoryLowStockAlert } from "./inventory-low-stock-alert-job";
export { runDevOsProjectCycleAdvisory } from "./project-cycle-advisory-job";
export { runDevOsProfitabilityRecompute } from "./profitability-recompute-job";
export { runDevOsCashflowAutoGenerate } from "./cashflow-autogenerate-job";
export { runDevOsExecutiveMetricsDaily } from "./executive-metrics-daily-job";
export { runDevOsRiskRadarWeekly } from "./risk-radar-weekly-job";
export { runDevOsExecutiveDigestMonthly } from "./executive-digest-monthly-job";
export { runDevOsDailyConstructionDigest } from "./daily-construction-digest-job";
export { runDevOsWeeklyConstructionPlan } from "./weekly-construction-plan-job";
export { runDevOsAiMemoryAggregator } from "./ai-memory-aggregator-job";
export { runDevOsContentPublishScheduler } from "./content-publish-scheduler-job";
export { runDevOsManagerPerformanceRecompute } from "./manager-performance-recompute-job";
export { runDevOsMissedFollowupDetector } from "./missed-followup-detector-job";
export { runDevOsBaselineVarianceRecompute } from "./baseline-variance-recompute-job";
export { runDevOsResourceConflictDetector } from "./resource-conflict-detector-job";
export { runDevOsProductivityAggregation } from "./productivity-aggregation-job";
export { runDevOsPushNotificationDispatch } from "./push-notification-dispatch-job";
export { runDevOsFailedSubscriptionsCleanup } from "./failed-subscriptions-cleanup-job";
export { runDevOsOfflineQueueStats } from "./offline-queue-stats-job";
export { runDevOsWebhookDelivery } from "./webhook-delivery-job";
export { runDevOsApiLogCleanup } from "./api-log-cleanup-job";
export { runDevOsUsageMetricsAggregation } from "./usage-metrics-aggregation-job";
export { runDevOsDataExportProcessor } from "./data-export-processor-job";
export { runDevOsRateLimitCleanup } from "./rate-limit-cleanup-job";
export { runDevOsBulkImportProcessor } from "./bulk-import-processor-job";
// Stage 6.P1.G — channel manager cron handlers
export { runChannelInventorySync } from "./channel-inventory-sync-job";
export { runChannelRatesSync } from "./channel-rates-sync-job";
export { runChannelReservationsPull } from "./channel-reservations-pull-job";
export { runChannelConflictDetector } from "./channel-conflict-detector-job";
export { runChannelCommissionReconciliation } from "./channel-commission-reconciliation-job";
// Stage 6.P2.F — unified messaging cron handlers
export { runMessagingInboundPoll } from "./messaging-inbound-poll-job";
export { runMessagingStatusSync } from "./messaging-status-sync-job";
export { runMessagingAutoResponseEvaluator } from "./messaging-auto-response-evaluator-job";
export { runMessagingCleanup } from "./messaging-cleanup-job";
// Stage 6.P3.G — banking + payments cron handlers
export { runBankAccountSync } from "./bank-account-sync-job";
export { runReconciliationEngine } from "./reconciliation-engine-job";
export { runStripeEventPoller } from "./stripe-event-poller-job";
export { runPaymentStatusSync } from "./payment-status-sync-job";
export { runPeriodCloseReminder } from "./period-close-reminder-job";
// Stage 6.P4.F — marketing cron handlers
export { runMarketingCampaignsSync } from "./marketing-campaigns-sync-job";
export { runMarketingMetricsSync } from "./marketing-metrics-sync-job";
export { runAttributionEngine } from "./attribution-engine-job";
export { runUtmTouchpointCleanup } from "./utm-touchpoint-cleanup-job";
// Stage 6.P5 — Google Workspace
export { runGoogleWorkspaceHealthCheck } from "./google-workspace-health-check-job";
// Stage 6.P6-CATCHUP — AI org-quota crons
export { runAiAggregateDaily } from "./ai-aggregate-daily-job";
export { runAiPeriodRollover } from "./ai-period-rollover-job";
export { runAiWarnThresholds } from "./ai-warn-thresholds-job";
export { runAiStripeSync } from "./ai-stripe-sync-job";
// Stage 7.C — subscription lifecycle crons
export { runSubscriptionWarnExpiry } from "./subscription-warn-expiry-job";
export { runSubscriptionAttemptRenewal } from "./subscription-attempt-renewal-job";
export { runSubscriptionAdvanceLifecycle } from "./subscription-advance-lifecycle-job";
export { runSubscriptionArchiveExpired } from "./subscription-archive-expired-job";
export { runSubscriptionPurgeArchived } from "./subscription-purge-archived-job";

export type DevOsJobKey =
  | "dev_os_pricing_apply"
  | "dev_os_reservation_expiry"
  | "dev_os_milestone_pre_invoice"
  | "dev_os_milestone_invoice"
  | "dev_os_milestone_overdue"
  | "dev_os_late_fee_accrual"
  | "dev_os_notification_dispatch"
  | "dev_os_overdue_drawdown"
  | "dev_os_fx_snapshot"
  | "dev_os_balance_alert"
  | "dev_os_self_sustaining_check"
  | "dev_os_balance_reconciliation"
  | "dev_os_overdue_delivery"
  | "dev_os_missing_site_report"
  | "dev_os_safety_escalation"
  | "dev_os_photo_analyst"
  | "dev_os_vendor_performance"
  | "dev_os_construction_supervisor"
  | "dev_os_distribution_preview"
  | "dev_os_document_extraction"
  | "dev_os_whatsapp_inbound_processor"
  | "dev_os_tax_classification_reminder"
  | "dev_os_permit_expiry_alert"
  | "dev_os_land_installment_due"
  | "dev_os_tax_period_report"
  | "dev_os_purchase_request_expiry"
  | "dev_os_wallet_recompute"
  | "dev_os_buyer_progress_reminder"
  | "dev_os_investor_request_escalation"
  | "dev_os_critical_path_recompute"
  | "dev_os_qa_qc_deadline_alert"
  | "dev_os_risk_elevation_alert"
  | "dev_os_inventory_low_stock_alert"
  | "dev_os_project_cycle_advisory"
  | "dev_os_profitability_recompute"
  | "dev_os_cashflow_autogenerate"
  | "dev_os_executive_metrics_daily"
  | "dev_os_risk_radar_weekly"
  | "dev_os_executive_digest_monthly"
  | "dev_os_daily_construction_digest"
  | "dev_os_weekly_construction_plan"
  | "dev_os_ai_memory_aggregator"
  | "dev_os_content_publish_scheduler"
  | "dev_os_manager_performance_recompute"
  | "dev_os_missed_followup_detector"
  | "dev_os_baseline_variance_recompute"
  | "dev_os_resource_conflict_detector"
  | "dev_os_productivity_aggregation"
  | "dev_os_push_notification_dispatch"
  | "dev_os_failed_subscriptions_cleanup"
  | "dev_os_offline_queue_stats"
  | "dev_os_webhook_delivery"
  | "dev_os_api_log_cleanup"
  | "dev_os_usage_metrics_aggregation"
  | "dev_os_data_export_processor"
  | "dev_os_rate_limit_cleanup"
  | "dev_os_bulk_import_processor"
  // Stage 6.P1.G — channel manager
  | "channel_inventory_sync"
  | "channel_rates_sync"
  | "channel_reservations_pull"
  | "channel_conflict_detector"
  | "channel_commission_reconciliation"
  // Stage 6.P2.F — unified messaging
  | "messaging_inbound_poll"
  | "messaging_status_sync"
  | "messaging_auto_response_evaluator"
  | "messaging_cleanup"
  // Stage 6.P3.G — banking + payments
  | "bank_account_sync"
  | "reconciliation_engine"
  | "stripe_event_poller"
  | "payment_status_sync"
  | "period_close_reminder"
  // Stage 6.P4.F — marketing
  | "marketing_campaigns_sync"
  | "marketing_metrics_sync"
  | "attribution_engine"
  | "utm_touchpoint_cleanup"
  // Stage 6.P5 — Google Workspace
  | "google_workspace_health_check"
  // Stage 6.P6-CATCHUP — AI quotas
  | "ai_aggregate_daily"
  | "ai_period_rollover"
  | "ai_warn_thresholds"
  | "ai_stripe_sync"
  // Stage 7.C — subscription lifecycle
  | "subscription_warn_expiry"
  | "subscription_attempt_renewal"
  | "subscription_advance_lifecycle"
  | "subscription_archive_expired"
  | "subscription_purge_archived";

export const DEV_OS_JOB_KEYS: DevOsJobKey[] = [
  "dev_os_pricing_apply",
  "dev_os_reservation_expiry",
  "dev_os_milestone_pre_invoice",
  "dev_os_milestone_invoice",
  "dev_os_milestone_overdue",
  "dev_os_late_fee_accrual",
  "dev_os_notification_dispatch",
  "dev_os_overdue_drawdown",
  "dev_os_fx_snapshot",
  "dev_os_balance_alert",
  "dev_os_self_sustaining_check",
  "dev_os_balance_reconciliation",
  "dev_os_overdue_delivery",
  "dev_os_missing_site_report",
  "dev_os_safety_escalation",
  "dev_os_photo_analyst",
  "dev_os_vendor_performance",
  "dev_os_construction_supervisor",
  "dev_os_distribution_preview",
  "dev_os_document_extraction",
  "dev_os_whatsapp_inbound_processor",
  "dev_os_tax_classification_reminder",
  "dev_os_permit_expiry_alert",
  "dev_os_land_installment_due",
  "dev_os_tax_period_report",
  "dev_os_purchase_request_expiry",
  "dev_os_wallet_recompute",
  "dev_os_buyer_progress_reminder",
  "dev_os_investor_request_escalation",
  "dev_os_critical_path_recompute",
  "dev_os_qa_qc_deadline_alert",
  "dev_os_risk_elevation_alert",
  "dev_os_inventory_low_stock_alert",
  "dev_os_project_cycle_advisory",
  "dev_os_profitability_recompute",
  "dev_os_cashflow_autogenerate",
  "dev_os_executive_metrics_daily",
  "dev_os_risk_radar_weekly",
  "dev_os_executive_digest_monthly",
  "dev_os_daily_construction_digest",
  "dev_os_weekly_construction_plan",
  "dev_os_ai_memory_aggregator",
  "dev_os_content_publish_scheduler",
  "dev_os_manager_performance_recompute",
  "dev_os_missed_followup_detector",
  "dev_os_baseline_variance_recompute",
  "dev_os_resource_conflict_detector",
  "dev_os_productivity_aggregation",
  "dev_os_push_notification_dispatch",
  "dev_os_failed_subscriptions_cleanup",
  "dev_os_offline_queue_stats",
  "dev_os_webhook_delivery",
  "dev_os_api_log_cleanup",
  "dev_os_usage_metrics_aggregation",
  "dev_os_data_export_processor",
  "dev_os_rate_limit_cleanup",
  "dev_os_bulk_import_processor",
  "channel_inventory_sync",
  "channel_rates_sync",
  "channel_reservations_pull",
  "channel_conflict_detector",
  "channel_commission_reconciliation",
  "messaging_inbound_poll",
  "messaging_status_sync",
  "messaging_auto_response_evaluator",
  "messaging_cleanup",
  "bank_account_sync",
  "reconciliation_engine",
  "stripe_event_poller",
  "payment_status_sync",
  "period_close_reminder",
  "marketing_campaigns_sync",
  "marketing_metrics_sync",
  "attribution_engine",
  "utm_touchpoint_cleanup",
  "google_workspace_health_check",
  "ai_aggregate_daily",
  "ai_period_rollover",
  "ai_warn_thresholds",
  "ai_stripe_sync",
  "subscription_warn_expiry",
  "subscription_attempt_renewal",
  "subscription_advance_lifecycle",
  "subscription_archive_expired",
  "subscription_purge_archived",
];
