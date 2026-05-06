/**
 * Stage 5.C — Pure rule-based risk pattern detection.
 *
 * No I/O, no `import "server-only"`. Runtime testable.
 *
 * Each rule takes a typed input array and emits zero or more
 * `DetectedAlert` objects. Cron job concatenates all rules and
 * deduplicates against existing open alerts.
 */

export type AlertCategory =
  | "cash_flow"
  | "budget_overrun"
  | "schedule_delay"
  | "quality_issue"
  | "investor_relations"
  | "sales_pipeline"
  | "compliance"
  | "team_capacity"
  | "data_health"
  | "vendor_performance"
  | "safety"
  | "tax"
  | "other";

export type Severity = "info" | "low" | "medium" | "high" | "critical";

export interface DetectedAlert {
  detectionMethod: string;
  category: AlertCategory;
  severity: Severity;
  title: string;
  description: string;
  detectedPattern: string;
  affectedEntities: Record<string, unknown>;
  supportingData: Record<string, unknown>;
  recommendedAction: string;
  /** Stable identity key — used to dedupe against existing alerts. */
  dedupeKey: string;
}

// ----------------------------------------------------------------------------
// Rule 1: Invoice without matching PO
// ----------------------------------------------------------------------------

export interface InvoiceForRule {
  invoiceId: string;
  invoiceNumber: string;
  amountMinor: number;
  hasPoLink: boolean;
  receivedAt: Date;
}

export function ruleInvoiceWithoutPo(
  invoices: InvoiceForRule[],
): DetectedAlert[] {
  return invoices
    .filter((i) => !i.hasPoLink)
    .map((i) => ({
      detectionMethod: "rule:invoice-without-po",
      category: "data_health" as AlertCategory,
      severity: i.amountMinor >= 100_000_00 ? ("medium" as Severity) : "low",
      title: `Invoice ${i.invoiceNumber} has no PO link`,
      description:
        "An invoice was received but is not linked to any purchase order. Reconcile to a PO or flag as outside-PR spend.",
      detectedPattern: "invoice-without-po",
      affectedEntities: { invoiceIds: [i.invoiceId] },
      supportingData: {
        amountMinor: i.amountMinor,
        receivedAt: i.receivedAt.toISOString(),
      },
      recommendedAction:
        "Open the invoice → match it to the originating purchase order, or add it to procurement as out-of-band.",
      dedupeKey: `invoice-without-po:${i.invoiceId}`,
    }));
}

// ----------------------------------------------------------------------------
// Rule 2: Transaction without tax classification
// ----------------------------------------------------------------------------

export interface TransactionForRule {
  transactionId: string;
  amountMinor: number;
  ageDays: number;
  hasTaxClassification: boolean;
}

export function ruleTransactionMissingTax(
  transactions: TransactionForRule[],
  ageThresholdDays = 7,
): DetectedAlert[] {
  const stale = transactions.filter(
    (t) => !t.hasTaxClassification && t.ageDays >= ageThresholdDays,
  );
  if (stale.length === 0) return [];
  const totalMinor = stale.reduce((acc, t) => acc + t.amountMinor, 0);
  const sev: Severity =
    stale.length > 50 ? "high" : stale.length > 20 ? "medium" : "low";
  return [
    {
      detectionMethod: "rule:transaction-missing-tax",
      category: "tax",
      severity: sev,
      title: `${stale.length} transactions missing tax classification`,
      description: `${stale.length} transactions older than ${ageThresholdDays} days are still unclassified for tax purposes.`,
      detectedPattern: "transaction-missing-tax",
      affectedEntities: { transactionIds: stale.map((t) => t.transactionId) },
      supportingData: {
        count: stale.length,
        totalAmountMinor: totalMinor,
        thresholdDays: ageThresholdDays,
      },
      recommendedAction:
        "Open Tax → unclassified queue and bulk-classify by vendor pattern.",
      dedupeKey: `transaction-missing-tax:bulk:${stale.length}`,
    },
  ];
}

// ----------------------------------------------------------------------------
// Rule 3: Purchase request without delivery
// ----------------------------------------------------------------------------

export interface PurchaseRequestForRule {
  prId: string;
  prCode: string;
  daysSinceApproved: number;
  hasDelivery: boolean;
  expectedLeadTimeDays: number;
}

export function rulePrWithoutDelivery(
  prs: PurchaseRequestForRule[],
): DetectedAlert[] {
  return prs
    .filter((p) => !p.hasDelivery && p.daysSinceApproved > p.expectedLeadTimeDays)
    .map((p) => ({
      detectionMethod: "rule:pr-without-delivery",
      category: "vendor_performance" as AlertCategory,
      severity:
        p.daysSinceApproved > p.expectedLeadTimeDays * 2
          ? ("high" as Severity)
          : "medium",
      title: `PR ${p.prCode} has no delivery (lead time exceeded)`,
      description: `Approved purchase request is ${p.daysSinceApproved} days old; expected lead time was ${p.expectedLeadTimeDays} days.`,
      detectedPattern: "pr-without-delivery",
      affectedEntities: { purchaseRequestIds: [p.prId] },
      supportingData: {
        daysSinceApproved: p.daysSinceApproved,
        expectedLeadTimeDays: p.expectedLeadTimeDays,
        overshoot: p.daysSinceApproved - p.expectedLeadTimeDays,
      },
      recommendedAction:
        "Contact the vendor; if no delivery within 7 days, re-issue to alternate supplier.",
      dedupeKey: `pr-without-delivery:${p.prId}`,
    }));
}

// ----------------------------------------------------------------------------
// Rule 4: Hot lead without follow-up
// ----------------------------------------------------------------------------

export interface HotLeadForRule {
  leadId: string;
  leadName: string;
  daysSinceLastFollowup: number;
  followupThresholdDays: number;
}

export function ruleHotLeadStale(leads: HotLeadForRule[]): DetectedAlert[] {
  return leads
    .filter((l) => l.daysSinceLastFollowup > l.followupThresholdDays)
    .map((l) => ({
      detectionMethod: "rule:hot-lead-stale",
      category: "sales_pipeline" as AlertCategory,
      severity:
        l.daysSinceLastFollowup > l.followupThresholdDays * 2
          ? ("high" as Severity)
          : "medium",
      title: `Hot lead ${l.leadName} not followed up in ${l.daysSinceLastFollowup} days`,
      description:
        "A hot lead has not been contacted recently. High-intent leads cool quickly without engagement.",
      detectedPattern: "hot-lead-stale",
      affectedEntities: { leadIds: [l.leadId] },
      supportingData: {
        daysSinceLastFollowup: l.daysSinceLastFollowup,
        threshold: l.followupThresholdDays,
      },
      recommendedAction:
        "Reach out today; log the contact in the CRM to reset the timer.",
      dedupeKey: `hot-lead-stale:${l.leadId}`,
    }));
}

// ----------------------------------------------------------------------------
// Rule 5: Schedule task overdue (critical path)
// ----------------------------------------------------------------------------

export interface ScheduleTaskForRule {
  taskId: string;
  taskName: string;
  daysOverdue: number;
  isOnCriticalPath: boolean;
  projectId: string;
}

export function ruleScheduleTaskOverdue(
  tasks: ScheduleTaskForRule[],
): DetectedAlert[] {
  return tasks
    .filter((t) => t.daysOverdue > 0)
    .map((t) => ({
      detectionMethod: "rule:schedule-task-overdue",
      category: "schedule_delay" as AlertCategory,
      severity: t.isOnCriticalPath
        ? t.daysOverdue > 14
          ? "critical"
          : "high"
        : t.daysOverdue > 14
          ? "medium"
          : "low",
      title: `Task "${t.taskName}" overdue by ${t.daysOverdue} days${t.isOnCriticalPath ? " (critical path)" : ""}`,
      description: t.isOnCriticalPath
        ? "A task on the critical path is overdue — project completion is now at risk."
        : "A scheduled task is overdue; review owner assignment.",
      detectedPattern: "schedule-task-overdue",
      affectedEntities: {
        taskIds: [t.taskId],
        projectIds: [t.projectId],
      },
      supportingData: {
        daysOverdue: t.daysOverdue,
        isOnCriticalPath: t.isOnCriticalPath,
      },
      recommendedAction: t.isOnCriticalPath
        ? "Re-baseline the schedule or add resources immediately."
        : "Reassign or unblock dependencies.",
      dedupeKey: `schedule-task-overdue:${t.taskId}`,
    }));
}

// ----------------------------------------------------------------------------
// Rule 6: Cash gap predicted within N days
// ----------------------------------------------------------------------------

export interface CashGapForRule {
  /** Forecast id (cashflow_forecasts.id) for traceability. */
  forecastId: string;
  /** Days from today until first cash gap. */
  daysUntilGap: number;
  gapAmountMinor: number;
}

export function ruleCashGapForecast(
  gaps: CashGapForRule[],
  horizonDays = 60,
): DetectedAlert[] {
  return gaps
    .filter((g) => g.daysUntilGap >= 0 && g.daysUntilGap <= horizonDays)
    .map((g) => {
      const sev: Severity =
        g.daysUntilGap < 14
          ? "critical"
          : g.daysUntilGap < 30
            ? "high"
            : "medium";
      return {
        detectionMethod: "rule:cash-gap-forecast",
        category: "cash_flow" as AlertCategory,
        severity: sev,
        title: `Cash gap predicted in ${g.daysUntilGap} days`,
        description: `The active cashflow forecast projects a cash shortfall of ${(g.gapAmountMinor / 100).toLocaleString()} starting in ${g.daysUntilGap} days.`,
        detectedPattern: "cash-gap-forecast",
        affectedEntities: { forecastIds: [g.forecastId] },
        supportingData: {
          daysUntilGap: g.daysUntilGap,
          gapAmountMinor: g.gapAmountMinor,
        },
        recommendedAction:
          "Trigger investor capital call OR accelerate buyer milestone billing.",
        dedupeKey: `cash-gap-forecast:${g.forecastId}`,
      };
    });
}

// ----------------------------------------------------------------------------
// Rule 7: Budget overrun
// ----------------------------------------------------------------------------

export interface BudgetForRule {
  projectId: string;
  projectName: string;
  burnPct: number;
  progressPct: number;
}

export function ruleBudgetOverrun(
  projects: BudgetForRule[],
): DetectedAlert[] {
  return projects
    .filter((p) => p.burnPct - p.progressPct >= 10)
    .map((p) => {
      const overrun = p.burnPct - p.progressPct;
      const sev: Severity =
        overrun >= 30 ? "critical" : overrun >= 20 ? "high" : "medium";
      return {
        detectionMethod: "rule:budget-overrun",
        category: "budget_overrun" as AlertCategory,
        severity: sev,
        title: `${p.projectName}: budget burn ${p.burnPct.toFixed(0)}% vs progress ${p.progressPct.toFixed(0)}%`,
        description: `Budget consumption is outpacing physical progress by ${overrun.toFixed(0)} percentage points.`,
        detectedPattern: "budget-overrun",
        affectedEntities: { projectIds: [p.projectId] },
        supportingData: {
          burnPct: p.burnPct,
          progressPct: p.progressPct,
          overshootPct: overrun,
        },
        recommendedAction:
          "Investigate cost overruns by category; review change orders and outstanding invoices.",
        dedupeKey: `budget-overrun:${p.projectId}`,
      };
    });
}

// ----------------------------------------------------------------------------
// Aggregator + dedupe
// ----------------------------------------------------------------------------

/**
 * Filter out alerts whose `dedupeKey` already appears in the open set.
 * Caller passes the dedupeKeys of currently-open alerts; this returns
 * only the *new* alerts to insert.
 */
export function dedupeAgainstOpen(
  detected: DetectedAlert[],
  openDedupeKeys: Set<string>,
): DetectedAlert[] {
  return detected.filter((d) => !openDedupeKeys.has(d.dedupeKey));
}

/**
 * Identify a recurring pattern: same dedupe key seen 3+ times in last 90 days.
 */
export function detectRecurringPatterns(
  history: Array<{ dedupeKey: string; resolvedAt: Date | null }>,
  thresholdCount = 3,
): string[] {
  const counts = new Map<string, number>();
  for (const h of history) {
    counts.set(h.dedupeKey, (counts.get(h.dedupeKey) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, c]) => c >= thresholdCount)
    .map(([k]) => k);
}
