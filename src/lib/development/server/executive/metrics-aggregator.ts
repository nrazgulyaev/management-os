/**
 * Stage 5.C — Executive metrics aggregation (pure helpers).
 *
 * No I/O, no `import "server-only"`. Runtime testable.
 *
 * These helpers take pre-fetched arrays and return a fully-shaped
 * `ExecutiveMetricsSnapshot`-compatible object. Cron jobs and on-demand
 * actions wire these together with the read queries.
 */

export interface BankAccountInput {
  accountId: string;
  accountName: string;
  balanceMinor: number;
  currency: string;
}

export interface ProjectStatusInput {
  projectId: string;
  status: "on_track" | "at_risk" | "delayed" | "completed" | "paused";
}

export interface ReceivableInput {
  amountMinor: number;
  /** Days past due. Negative means not yet due. */
  daysOverdue: number;
}

export interface PayableInput {
  amountMinor: number;
  /** Days until due. Negative means overdue. */
  daysUntilDue: number;
}

export interface PipelineLeadInput {
  status: "lead" | "hot" | "qualified" | "reservation" | "contract";
  estimatedValueMinor: number;
}

export interface InvestorCommitmentInput {
  committedMinor: number;
  drawnMinor: number;
}

export interface FxRate {
  /** Source currency (e.g., USD). */
  from: string;
  /** Target currency (e.g., IDR). */
  to: string;
  /** Multiplier — 1 unit `from` = `rate` units `to`. */
  rate: number;
}

// ---------------------------------------------------------------------------
// Cash position
// ---------------------------------------------------------------------------

export interface CashPositionOutput {
  totalCashOnHandMinor: number;
  cashByAccount: Array<{
    accountId: string;
    name: string;
    balanceMinor: number;
    currency: string;
  }>;
  cashInIdrEquivalentMinor: number;
}

export function computeCashPosition(
  accounts: BankAccountInput[],
  baseCurrency: string,
  fxRates: FxRate[],
): CashPositionOutput {
  const cashByAccount = accounts.map((a) => ({
    accountId: a.accountId,
    name: a.accountName,
    balanceMinor: a.balanceMinor,
    currency: a.currency,
  }));
  const totalCashOnHandMinor = accounts.reduce(
    (acc, a) => acc + a.balanceMinor,
    0,
  );
  const cashInIdrEquivalentMinor = accounts.reduce((acc, a) => {
    if (a.currency === baseCurrency) return acc + a.balanceMinor;
    const rate = fxRates.find(
      (r) => r.from === a.currency && r.to === baseCurrency,
    );
    return acc + Math.round(a.balanceMinor * (rate?.rate ?? 0));
  }, 0);
  return {
    totalCashOnHandMinor,
    cashByAccount,
    cashInIdrEquivalentMinor,
  };
}

// ---------------------------------------------------------------------------
// Receivables aging
// ---------------------------------------------------------------------------

export interface ReceivablesAgingOutput {
  totalReceivablesMinor: number;
  aging: {
    current: number;
    days_1_30: number;
    days_31_60: number;
    days_61_90: number;
    days_over_90: number;
  };
}

export function computeReceivablesAging(
  receivables: ReceivableInput[],
): ReceivablesAgingOutput {
  const aging = {
    current: 0,
    days_1_30: 0,
    days_31_60: 0,
    days_61_90: 0,
    days_over_90: 0,
  };
  let total = 0;
  for (const r of receivables) {
    total += r.amountMinor;
    if (r.daysOverdue <= 0) aging.current += r.amountMinor;
    else if (r.daysOverdue <= 30) aging.days_1_30 += r.amountMinor;
    else if (r.daysOverdue <= 60) aging.days_31_60 += r.amountMinor;
    else if (r.daysOverdue <= 90) aging.days_61_90 += r.amountMinor;
    else aging.days_over_90 += r.amountMinor;
  }
  return { totalReceivablesMinor: total, aging };
}

// ---------------------------------------------------------------------------
// Payables bucketing
// ---------------------------------------------------------------------------

export interface PayablesBucketsOutput {
  totalPayablesMinor: number;
  payablesDueNext30DaysMinor: number;
  payablesOverdueMinor: number;
}

export function computePayablesBuckets(
  payables: PayableInput[],
): PayablesBucketsOutput {
  let total = 0;
  let due30 = 0;
  let overdue = 0;
  for (const p of payables) {
    total += p.amountMinor;
    if (p.daysUntilDue < 0) overdue += p.amountMinor;
    else if (p.daysUntilDue <= 30) due30 += p.amountMinor;
  }
  return {
    totalPayablesMinor: total,
    payablesDueNext30DaysMinor: due30,
    payablesOverdueMinor: overdue,
  };
}

// ---------------------------------------------------------------------------
// Project status counts
// ---------------------------------------------------------------------------

export interface ProjectStatusCountsOutput {
  activeProjectsCount: number;
  projectsOnTrack: number;
  projectsAtRisk: number;
  projectsDelayed: number;
}

export function computeProjectStatusCounts(
  projects: ProjectStatusInput[],
): ProjectStatusCountsOutput {
  let onTrack = 0;
  let atRisk = 0;
  let delayed = 0;
  let active = 0;
  for (const p of projects) {
    if (p.status === "completed" || p.status === "paused") continue;
    active++;
    if (p.status === "on_track") onTrack++;
    else if (p.status === "at_risk") atRisk++;
    else if (p.status === "delayed") delayed++;
  }
  return {
    activeProjectsCount: active,
    projectsOnTrack: onTrack,
    projectsAtRisk: atRisk,
    projectsDelayed: delayed,
  };
}

// ---------------------------------------------------------------------------
// Pipeline aggregation
// ---------------------------------------------------------------------------

export interface PipelineOutput {
  activeLeadsCount: number;
  hotLeadsCount: number;
  reservationsCount: number;
  totalPipelineValueMinor: number;
}

export function computePipeline(leads: PipelineLeadInput[]): PipelineOutput {
  let activeLeads = 0;
  let hotLeads = 0;
  let reservations = 0;
  let totalValue = 0;
  for (const l of leads) {
    totalValue += l.estimatedValueMinor;
    if (l.status === "lead" || l.status === "hot" || l.status === "qualified") {
      activeLeads++;
    }
    if (l.status === "hot") hotLeads++;
    if (l.status === "reservation") reservations++;
  }
  return {
    activeLeadsCount: activeLeads,
    hotLeadsCount: hotLeads,
    reservationsCount: reservations,
    totalPipelineValueMinor: totalValue,
  };
}

// ---------------------------------------------------------------------------
// Investor capital aggregation
// ---------------------------------------------------------------------------

export interface InvestorCapitalOutput {
  totalCommittedCapitalMinor: number;
  totalDrawnCapitalMinor: number;
  availableCapitalMinor: number;
  drawnPercentage: number;
}

export function computeInvestorCapital(
  commitments: InvestorCommitmentInput[],
): InvestorCapitalOutput {
  let committed = 0;
  let drawn = 0;
  for (const c of commitments) {
    committed += c.committedMinor;
    drawn += c.drawnMinor;
  }
  const available = committed - drawn;
  const drawnPct = committed > 0 ? (drawn / committed) * 100 : 0;
  return {
    totalCommittedCapitalMinor: committed,
    totalDrawnCapitalMinor: drawn,
    availableCapitalMinor: available,
    drawnPercentage: drawnPct,
  };
}

// ---------------------------------------------------------------------------
// Budget burn
// ---------------------------------------------------------------------------

export interface BudgetBurnOutput {
  totalCommittedBudgetMinor: number;
  totalActualSpendMinor: number;
  budgetBurnPercentage: number;
  remainingBudgetMinor: number;
}

export function computeBudgetBurn(input: {
  committedBudgetMinor: number;
  actualSpendMinor: number;
}): BudgetBurnOutput {
  if (
    !Number.isFinite(input.committedBudgetMinor) ||
    !Number.isFinite(input.actualSpendMinor)
  ) {
    throw new Error("budget-burn: inputs must be finite");
  }
  const pct =
    input.committedBudgetMinor > 0
      ? (input.actualSpendMinor / input.committedBudgetMinor) * 100
      : 0;
  return {
    totalCommittedBudgetMinor: input.committedBudgetMinor,
    totalActualSpendMinor: input.actualSpendMinor,
    budgetBurnPercentage: pct,
    remainingBudgetMinor: input.committedBudgetMinor - input.actualSpendMinor,
  };
}

// ---------------------------------------------------------------------------
// Snapshot composition (orchestrator)
// ---------------------------------------------------------------------------

export interface ComposeSnapshotInput {
  scope: "company_wide" | "project";
  projectId: string | null;
  baseCurrency: string;
  fxRates: FxRate[];
  bankAccounts: BankAccountInput[];
  receivables: ReceivableInput[];
  payables: PayableInput[];
  taxPayableMinor: number;
  unclassifiedTransactionsCount: number;
  projects: ProjectStatusInput[];
  leads: PipelineLeadInput[];
  contractsSignedThisMonth: number;
  investorCommitments: InvestorCommitmentInput[];
  pendingDistributionMinor: number;
  pendingInvestorRequestsCount: number;
  openQaQcIssues: number;
  criticalQaQcIssues: number;
  pendingChangeOrders: number;
  highRiskItemsCount: number;
  lowStockItemsCount: number;
  budget: { committedMinor: number; actualSpendMinor: number };
  blendedMarginPercentage: number | null;
  forecast: {
    payrollRunwayWeeks: number;
    cashAt30DaysMinor: number;
    cashAt60DaysMinor: number;
    cashAt90DaysMinor: number;
    identifiedCashGapsCount: number;
  };
}

export interface ComposedSnapshot {
  scope: "company_wide" | "project";
  projectId: string | null;
  cash: CashPositionOutput;
  receivables: ReceivablesAgingOutput;
  payables: PayablesBucketsOutput;
  taxPayableMinor: number;
  unclassifiedTransactionsCount: number;
  projectCounts: ProjectStatusCountsOutput;
  pipeline: PipelineOutput;
  contractsSignedThisMonth: number;
  investorCapital: InvestorCapitalOutput;
  pendingDistributionMinor: number;
  pendingInvestorRequestsCount: number;
  openQaQcIssues: number;
  criticalQaQcIssues: number;
  pendingChangeOrders: number;
  highRiskItemsCount: number;
  lowStockItemsCount: number;
  budgetBurn: BudgetBurnOutput;
  blendedMarginPercentage: number | null;
  forecast: ComposeSnapshotInput["forecast"];
  baseCurrency: string;
  fxSnapshot: FxRate[];
}

export function composeExecutiveSnapshot(
  input: ComposeSnapshotInput,
): ComposedSnapshot {
  return {
    scope: input.scope,
    projectId: input.projectId,
    cash: computeCashPosition(
      input.bankAccounts,
      input.baseCurrency,
      input.fxRates,
    ),
    receivables: computeReceivablesAging(input.receivables),
    payables: computePayablesBuckets(input.payables),
    taxPayableMinor: input.taxPayableMinor,
    unclassifiedTransactionsCount: input.unclassifiedTransactionsCount,
    projectCounts: computeProjectStatusCounts(input.projects),
    pipeline: computePipeline(input.leads),
    contractsSignedThisMonth: input.contractsSignedThisMonth,
    investorCapital: computeInvestorCapital(input.investorCommitments),
    pendingDistributionMinor: input.pendingDistributionMinor,
    pendingInvestorRequestsCount: input.pendingInvestorRequestsCount,
    openQaQcIssues: input.openQaQcIssues,
    criticalQaQcIssues: input.criticalQaQcIssues,
    pendingChangeOrders: input.pendingChangeOrders,
    highRiskItemsCount: input.highRiskItemsCount,
    lowStockItemsCount: input.lowStockItemsCount,
    budgetBurn: computeBudgetBurn({
      committedBudgetMinor: input.budget.committedMinor,
      actualSpendMinor: input.budget.actualSpendMinor,
    }),
    blendedMarginPercentage: input.blendedMarginPercentage,
    forecast: input.forecast,
    baseCurrency: input.baseCurrency,
    fxSnapshot: input.fxRates,
  };
}
