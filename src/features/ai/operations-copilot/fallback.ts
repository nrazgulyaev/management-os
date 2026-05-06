/**
 * Deterministic fallback summary. Pure — no DB, no `server-only` import.
 * Drives:
 *   • the dashboard render when ANTHROPIC_API_KEY is missing or
 *     AI_DRY_RUN=1
 *   • the safe path when the model errors / returns invalid JSON
 *
 * The fallback never surprises operators: every claim it makes is a
 * direct readout of the snapshot we already have on screen.
 */

import type { CopilotResponse, OperationsSnapshot, RiskLevel } from "./types";

const HIGH_RISK_THRESHOLD = {
  conflicts: 3,
  failedJobs: 2,
  lowStock: 8,
};

const ELEVATED_THRESHOLD = {
  conflicts: 1,
  failedJobs: 1,
  lowStock: 3,
  overdue: 5,
};

export function computeFallbackRiskLevel(
  snapshot: OperationsSnapshot,
): RiskLevel {
  const m = snapshot.metrics;
  if (
    m.bookingConflicts >= HIGH_RISK_THRESHOLD.conflicts ||
    m.failedJobsLast24h >= HIGH_RISK_THRESHOLD.failedJobs ||
    m.lowStockItems >= HIGH_RISK_THRESHOLD.lowStock
  ) {
    return "high";
  }
  if (
    m.bookingConflicts >= ELEVATED_THRESHOLD.conflicts ||
    m.failedJobsLast24h >= ELEVATED_THRESHOLD.failedJobs ||
    m.lowStockItems >= ELEVATED_THRESHOLD.lowStock ||
    m.overdueTasks >= ELEVATED_THRESHOLD.overdue
  ) {
    return "elevated";
  }
  return "normal";
}

export function deterministicFallbackSummary(
  snapshot: OperationsSnapshot,
): CopilotResponse {
  const m = snapshot.metrics;
  const riskLevel = computeFallbackRiskLevel(snapshot);

  const highlights: CopilotResponse["highlights"] = [
    {
      title: `Open tasks: ${m.openTasks}`,
      detail: `${m.overdueTasks} flagged urgent or overdue. Today's check-ins: ${m.todaysCheckins}, check-outs: ${m.todaysCheckouts}.`,
      source: "getOperationsMetrics",
    },
    {
      title: `Queued notifications: ${m.queuedNotifications}`,
      detail: "Worker drains every minute via /api/cron.",
      source: "notification_queue",
    },
  ];

  const risks: CopilotResponse["risks"] = [];
  if (m.bookingConflicts > 0) {
    risks.push({
      title: `${m.bookingConflicts} unresolved booking conflict${m.bookingConflicts === 1 ? "" : "s"}`,
      detail:
        snapshot.conflicts
          .slice(0, 3)
          .map((c) => c.detail)
          .join("; ") || "See bookings/conflicts.",
      source: `listBookingConflicts(${snapshot.conflicts.length})`,
    });
  }
  if (m.failedJobsLast24h > 0) {
    risks.push({
      title: `${m.failedJobsLast24h} failed job${m.failedJobsLast24h === 1 ? "" : "s"} in 24h`,
      detail:
        snapshot.jobRuns
          .filter((j) => j.status === "failed")
          .slice(0, 3)
          .map((j) => j.jobKey)
          .join(", ") || "See /dashboard/operations/jobs.",
      source: `listJobRuns(failed)`,
    });
  }
  if (m.lowStockItems > 0) {
    risks.push({
      title: `${m.lowStockItems} item${m.lowStockItems === 1 ? "" : "s"} below par`,
      detail:
        snapshot.lowStock
          .slice(0, 3)
          .map((i) => `${i.itemName} (${i.onHand}/${i.parLevel})`)
          .join("; ") || "See inventory.",
      source: `listLowStockItems(${snapshot.lowStock.length})`,
    });
  }

  const recommendedActions: CopilotResponse["recommendedActions"] = [];
  if (m.bookingConflicts > 0) {
    recommendedActions.push({
      title: "Triage booking conflicts",
      detail: "Review each unresolved conflict and choose the channel of record.",
      source: "/dashboard/operations/conflicts",
    });
  }
  if (m.failedJobsLast24h > 0) {
    recommendedActions.push({
      title: "Investigate failed jobs",
      detail: "Open the jobs board and re-run any expected to recover.",
      source: "/dashboard/jobs",
    });
  }
  if (m.lowStockItems > 0) {
    recommendedActions.push({
      title: "Replenish low-stock items",
      detail: "Generate a draft purchase order or restock from a sister property.",
      source: "/dashboard/inventory",
    });
  }
  if (recommendedActions.length === 0) {
    recommendedActions.push({
      title: "No same-day actions required",
      detail: "Operations metrics are within normal ranges.",
      source: "fallback",
    });
  }

  const title =
    riskLevel === "high"
      ? "Operations briefing — same-day action required"
      : riskLevel === "elevated"
        ? "Operations briefing — review needed"
        : "Operations briefing — steady state";

  const executiveSummary = [
    `Risk level: ${riskLevel}.`,
    `${m.openTasks} open tasks (${m.overdueTasks} urgent).`,
    `Today: ${m.todaysCheckins} check-ins, ${m.todaysCheckouts} check-outs.`,
    `${m.bookingConflicts} unresolved booking conflicts.`,
    `${m.lowStockItems} items below par.`,
    `${m.failedJobsLast24h} failed background jobs in the last 24h.`,
    `${m.queuedNotifications} notifications waiting to send.`,
  ].join(" ");

  return {
    title,
    executiveSummary,
    riskLevel,
    highlights,
    risks,
    recommendedActions,
  };
}
