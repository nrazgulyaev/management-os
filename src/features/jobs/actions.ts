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
import { runNotificationDeliveryJob } from "./notification-delivery-job";
import { runNotificationDigestJob } from "./notification-digest-job";
import { runAiOperationsSummaryJob } from "./ai-operations-summary-job";
import { runGuestRequestAttachmentCleanupJob } from "./guest-request-attachment-cleanup-job";
import { runGuestJourneyDueRulesJob } from "./guest-journey-due-rules-job";
import { runGuestReviewRequestsJob } from "./guest-review-requests-job";
import { runOwnerVisibleEventsRebuildJob } from "./owner-visible-events-rebuild-job";
import { runDirectBookingHoldExpiryJob } from "./direct-booking-hold-expiry-job";
import { runDirectBookingDepositExpiryJob } from "./direct-booking-deposit-expiry-job";
import { runOwnerBookingProjectionRebuildJob } from "./owner-booking-projection-rebuild-job";
import { runStatementTransparencyRebuildJob } from "./statement-transparency-rebuild-job";
import {
  runDevOsBalanceAlert,
  runDevOsBalanceReconciliation,
  runDevOsFxSnapshot,
  runDevOsLateFeeAccrual,
  runDevOsMilestoneInvoice,
  runDevOsMilestoneOverdue,
  runDevOsMilestonePreInvoice,
  runDevOsMissingSiteReport,
  runDevOsNotificationDispatch,
  runDevOsOverdueDelivery,
  runDevOsOverdueDrawdown,
  runDevOsConstructionSupervisor,
  runDevOsDistributionPreview,
  runDevOsDocumentExtraction,
  runDevOsPhotoAnalyst,
  runDevOsPricingApply,
  runDevOsReservationExpiry,
  runDevOsSafetyEscalation,
  runDevOsSelfSustainingCheck,
  runDevOsVendorPerformance,
  runDevOsWhatsappInboundProcessor,
  runDevOsTaxClassificationReminder,
  runDevOsPermitExpiryAlert,
  runDevOsLandInstallmentDue,
  runDevOsTaxPeriodReport,
  runDevOsPurchaseRequestExpiry,
  runDevOsWalletRecompute,
  runDevOsBuyerProgressReminder,
  runDevOsInvestorRequestEscalation,
  runDevOsCriticalPathRecompute,
  runDevOsQaQcDeadlineAlert,
  runDevOsRiskElevationAlert,
  runDevOsInventoryLowStockAlert,
  runDevOsProjectCycleAdvisory,
  runDevOsProfitabilityRecompute,
  runDevOsCashflowAutoGenerate,
  runDevOsExecutiveMetricsDaily,
  runDevOsRiskRadarWeekly,
  runDevOsExecutiveDigestMonthly,
  runDevOsDailyConstructionDigest,
  runDevOsWeeklyConstructionPlan,
  runDevOsAiMemoryAggregator,
  runDevOsContentPublishScheduler,
  runDevOsManagerPerformanceRecompute,
  runDevOsMissedFollowupDetector,
  runDevOsBaselineVarianceRecompute,
  runDevOsResourceConflictDetector,
  runDevOsProductivityAggregation,
  runDevOsPushNotificationDispatch,
  runDevOsFailedSubscriptionsCleanup,
  runDevOsOfflineQueueStats,
  runDevOsWebhookDelivery,
  runDevOsApiLogCleanup,
  runDevOsUsageMetricsAggregation,
  runDevOsDataExportProcessor,
  runDevOsRateLimitCleanup,
  runDevOsBulkImportProcessor,
} from "@/lib/development/server/cron";
import { ensureDefaultJobDefinitions } from "./services";
import { acquireJobLock, releaseJobLock } from "./locks";
import { recordSecurityEvent } from "@/features/security-baseline/security-events";
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
  "deliver_pending_notifications",
  "notification_digest_internal",
  "ai_operations_summary_refresh",
  "guest_request_attachment_cleanup",
  "guest_journey_due_rules",
  "guest_review_requests",
  "owner_visible_events_rebuild",
  "direct_booking_hold_expiry",
  "direct_booking_deposit_expiry",
  "owner_booking_projection_rebuild",
  "statement_transparency_rebuild",
  // Development OS · Stage 2.2.B Checkpoint 2
  "dev_os_pricing_apply",
  "dev_os_reservation_expiry",
  "dev_os_milestone_pre_invoice",
  "dev_os_milestone_invoice",
  "dev_os_milestone_overdue",
  "dev_os_late_fee_accrual",
  "dev_os_notification_dispatch",
  // Development OS · Stage 2.3.B
  "dev_os_overdue_drawdown",
  "dev_os_fx_snapshot",
  "dev_os_balance_alert",
  "dev_os_self_sustaining_check",
  "dev_os_balance_reconciliation",
  // Development OS · Stage 2.4
  "dev_os_overdue_delivery",
  "dev_os_missing_site_report",
  "dev_os_safety_escalation",
  // Development OS · Stage 3.A
  "dev_os_photo_analyst",
  // Development OS · Stage 3.B
  "dev_os_vendor_performance",
  "dev_os_construction_supervisor",
  // Development OS · Stage 3.C
  "dev_os_distribution_preview",
  "dev_os_document_extraction",
  // Development OS · Stage 3.D
  "dev_os_whatsapp_inbound_processor",
  // Development OS · Stage 4.A
  "dev_os_tax_classification_reminder",
  "dev_os_permit_expiry_alert",
  "dev_os_land_installment_due",
  "dev_os_tax_period_report",
  "dev_os_purchase_request_expiry",
  // Development OS · Stage 4.B
  "dev_os_wallet_recompute",
  "dev_os_buyer_progress_reminder",
  "dev_os_investor_request_escalation",
  // Development OS · Stage 4.C
  "dev_os_critical_path_recompute",
  "dev_os_qa_qc_deadline_alert",
  "dev_os_risk_elevation_alert",
  "dev_os_inventory_low_stock_alert",
  // Development OS · Stage 5.B
  "dev_os_project_cycle_advisory",
  "dev_os_profitability_recompute",
  "dev_os_cashflow_autogenerate",
  // Development OS · Stage 5.C
  "dev_os_executive_metrics_daily",
  "dev_os_risk_radar_weekly",
  "dev_os_executive_digest_monthly",
  // Development OS · Stage 5.D
  "dev_os_daily_construction_digest",
  "dev_os_weekly_construction_plan",
  "dev_os_ai_memory_aggregator",
  // Development OS · Stage 5.E
  "dev_os_content_publish_scheduler",
  "dev_os_manager_performance_recompute",
  "dev_os_missed_followup_detector",
  // Development OS · Stage 5.H
  "dev_os_baseline_variance_recompute",
  "dev_os_resource_conflict_detector",
  "dev_os_productivity_aggregation",
  // Development OS · Stage 5.I
  "dev_os_push_notification_dispatch",
  "dev_os_failed_subscriptions_cleanup",
  "dev_os_offline_queue_stats",
  // Development OS · Stage 5.J
  "dev_os_webhook_delivery",
  "dev_os_api_log_cleanup",
  "dev_os_usage_metrics_aggregation",
  "dev_os_data_export_processor",
  "dev_os_rate_limit_cleanup",
  // Development OS · Stage 6.P0.7
  "dev_os_bulk_import_processor",
]);

export type JobKey =
  | "calendar_sync_active_feeds"
  | "generate_preventive_tasks"
  | "bridge_pending_material_usage"
  | "scan_low_stock"
  | "deliver_pending_notifications"
  | "notification_digest_internal"
  | "ai_operations_summary_refresh"
  | "guest_request_attachment_cleanup"
  | "guest_journey_due_rules"
  | "guest_review_requests"
  | "owner_visible_events_rebuild"
  | "direct_booking_hold_expiry"
  | "direct_booking_deposit_expiry"
  | "owner_booking_projection_rebuild"
  | "statement_transparency_rebuild"
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
  | "dev_os_bulk_import_processor";

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
  // Prompt 111 — acquire a job lock before the run starts. Manual
  // dashboard runs and cron-triggered runs both flow through here, so
  // both are protected.  When the lock is held, return a clean
  // skipped outcome instead of error.
  const lockOutcome = await acquireJobLock(
    jobKey,
    600,
    triggerType === "manual" ? `manual:${createdBy ?? "unknown"}` : `cron:${jobKey}`,
  );
  if (!lockOutcome.ok) {
    if (lockOutcome.reason === "no_db") {
      // DB unavailable — fall through to withJobRun, which will also
      // observe the missing DB and emit a console-only run.
    } else {
      await recordSecurityEvent({
        eventType: "job_lock_skipped",
        metadata: {
          jobKey,
          lockedBy: lockOutcome.lockedBy,
          expiresAt: lockOutcome.expiresAt
            ? lockOutcome.expiresAt.toISOString()
            : null,
        },
      });
      return {
        jobRunId: null,
        outcome: {
          status: "skipped",
          summary: `skipped — already locked by ${lockOutcome.lockedBy}`,
          metrics: {
            jobKey,
            lockedBy: lockOutcome.lockedBy,
            reason: "skipped_locked",
          },
        },
      };
    }
  }
  if (lockOutcome.ok) {
    await recordSecurityEvent({
      eventType: "job_lock_acquired",
      metadata: { jobKey, lockedBy: lockOutcome.handle.lockedBy },
    });
  }
  try {
    return await withJobRun(jobKey, triggerType, createdBy, async (handle) => {
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
      case "deliver_pending_notifications":
        return runNotificationDeliveryJob(handle);
      case "notification_digest_internal":
        return runNotificationDigestJob(handle);
      case "ai_operations_summary_refresh":
        return runAiOperationsSummaryJob(handle);
      case "guest_request_attachment_cleanup":
        return runGuestRequestAttachmentCleanupJob(handle);
      case "guest_journey_due_rules":
        return runGuestJourneyDueRulesJob(handle);
      case "guest_review_requests":
        return runGuestReviewRequestsJob(handle);
      case "owner_visible_events_rebuild":
        return runOwnerVisibleEventsRebuildJob(handle);
      case "direct_booking_hold_expiry":
        return runDirectBookingHoldExpiryJob(handle);
      case "direct_booking_deposit_expiry":
        return runDirectBookingDepositExpiryJob(handle);
      case "owner_booking_projection_rebuild":
        return runOwnerBookingProjectionRebuildJob(handle);
      case "statement_transparency_rebuild":
        return runStatementTransparencyRebuildJob(handle);
      case "dev_os_pricing_apply":
        return runDevOsPricingApply(handle);
      case "dev_os_reservation_expiry":
        return runDevOsReservationExpiry(handle);
      case "dev_os_milestone_pre_invoice":
        return runDevOsMilestonePreInvoice(handle);
      case "dev_os_milestone_invoice":
        return runDevOsMilestoneInvoice(handle);
      case "dev_os_milestone_overdue":
        return runDevOsMilestoneOverdue(handle);
      case "dev_os_late_fee_accrual":
        return runDevOsLateFeeAccrual(handle);
      case "dev_os_notification_dispatch":
        return runDevOsNotificationDispatch(handle);
      case "dev_os_overdue_drawdown":
        return runDevOsOverdueDrawdown(handle);
      case "dev_os_fx_snapshot":
        return runDevOsFxSnapshot(handle);
      case "dev_os_balance_alert":
        return runDevOsBalanceAlert(handle);
      case "dev_os_self_sustaining_check":
        return runDevOsSelfSustainingCheck(handle);
      case "dev_os_balance_reconciliation":
        return runDevOsBalanceReconciliation(handle);
      case "dev_os_overdue_delivery":
        return runDevOsOverdueDelivery(handle);
      case "dev_os_missing_site_report":
        return runDevOsMissingSiteReport(handle);
      case "dev_os_safety_escalation":
        return runDevOsSafetyEscalation(handle);
      case "dev_os_photo_analyst":
        return runDevOsPhotoAnalyst(handle);
      case "dev_os_vendor_performance":
        return runDevOsVendorPerformance(handle);
      case "dev_os_construction_supervisor":
        return runDevOsConstructionSupervisor(handle);
      case "dev_os_distribution_preview":
        return runDevOsDistributionPreview(handle);
      case "dev_os_document_extraction":
        return runDevOsDocumentExtraction(handle);
      case "dev_os_whatsapp_inbound_processor":
        return runDevOsWhatsappInboundProcessor(handle);
      case "dev_os_tax_classification_reminder":
        return runDevOsTaxClassificationReminder(handle);
      case "dev_os_permit_expiry_alert":
        return runDevOsPermitExpiryAlert(handle);
      case "dev_os_land_installment_due":
        return runDevOsLandInstallmentDue(handle);
      case "dev_os_tax_period_report":
        return runDevOsTaxPeriodReport(handle);
      case "dev_os_purchase_request_expiry":
        return runDevOsPurchaseRequestExpiry(handle);
      case "dev_os_wallet_recompute":
        return runDevOsWalletRecompute(handle);
      case "dev_os_buyer_progress_reminder":
        return runDevOsBuyerProgressReminder(handle);
      case "dev_os_investor_request_escalation":
        return runDevOsInvestorRequestEscalation(handle);
      case "dev_os_critical_path_recompute":
        return runDevOsCriticalPathRecompute(handle);
      case "dev_os_qa_qc_deadline_alert":
        return runDevOsQaQcDeadlineAlert(handle);
      case "dev_os_risk_elevation_alert":
        return runDevOsRiskElevationAlert(handle);
      case "dev_os_inventory_low_stock_alert":
        return runDevOsInventoryLowStockAlert(handle);
      case "dev_os_project_cycle_advisory":
        return runDevOsProjectCycleAdvisory(handle);
      case "dev_os_profitability_recompute":
        return runDevOsProfitabilityRecompute(handle);
      case "dev_os_cashflow_autogenerate":
        return runDevOsCashflowAutoGenerate(handle);
      case "dev_os_executive_metrics_daily":
        return runDevOsExecutiveMetricsDaily(handle);
      case "dev_os_risk_radar_weekly":
        return runDevOsRiskRadarWeekly(handle);
      case "dev_os_executive_digest_monthly":
        return runDevOsExecutiveDigestMonthly(handle);
      case "dev_os_daily_construction_digest":
        return runDevOsDailyConstructionDigest(handle);
      case "dev_os_weekly_construction_plan":
        return runDevOsWeeklyConstructionPlan(handle);
      case "dev_os_ai_memory_aggregator":
        return runDevOsAiMemoryAggregator(handle);
      case "dev_os_content_publish_scheduler":
        return runDevOsContentPublishScheduler(handle);
      case "dev_os_manager_performance_recompute":
        return runDevOsManagerPerformanceRecompute(handle);
      case "dev_os_missed_followup_detector":
        return runDevOsMissedFollowupDetector(handle);
      case "dev_os_baseline_variance_recompute":
        return runDevOsBaselineVarianceRecompute(handle);
      case "dev_os_resource_conflict_detector":
        return runDevOsResourceConflictDetector(handle);
      case "dev_os_productivity_aggregation":
        return runDevOsProductivityAggregation(handle);
      case "dev_os_push_notification_dispatch":
        return runDevOsPushNotificationDispatch(handle);
      case "dev_os_failed_subscriptions_cleanup":
        return runDevOsFailedSubscriptionsCleanup(handle);
      case "dev_os_offline_queue_stats":
        return runDevOsOfflineQueueStats(handle);
      case "dev_os_webhook_delivery":
        return runDevOsWebhookDelivery(handle);
      case "dev_os_api_log_cleanup":
        return runDevOsApiLogCleanup(handle);
      case "dev_os_usage_metrics_aggregation":
        return runDevOsUsageMetricsAggregation(handle);
      case "dev_os_data_export_processor":
        return runDevOsDataExportProcessor(handle);
      case "dev_os_rate_limit_cleanup":
        return runDevOsRateLimitCleanup(handle);
      case "dev_os_bulk_import_processor":
        return runDevOsBulkImportProcessor(handle);
      default:
        // unreachable — KNOWN_JOBS keeps us honest
        throw new Error(`Unhandled job key: ${jobKey}`);
    }
  });
  } finally {
    if (lockOutcome.ok) {
      await releaseJobLock(jobKey, lockOutcome.handle.lockId);
      await recordSecurityEvent({
        eventType: "job_lock_released",
        metadata: { jobKey },
      });
    }
  }
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
    "deliver_pending_notifications",
    "notification_digest_internal",
    "guest_request_attachment_cleanup",
    "direct_booking_hold_expiry",
    "direct_booking_deposit_expiry",
    "owner_booking_projection_rebuild",
    "statement_transparency_rebuild",
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
