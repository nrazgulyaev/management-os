/**
 * Stage 5.C — Executive digest pure helpers.
 *
 * No I/O, no `import "server-only"`. Runtime testable.
 */

export interface DigestContext {
  periodLabel: string;
  periodStart: Date;
  periodEnd: Date;
  snapshot: {
    totalCashOnHandMinor: number;
    activeProjectsCount: number;
    projectsOnTrack: number;
    projectsAtRisk: number;
    projectsDelayed: number;
    activeLeadsCount: number;
    contractsSignedThisMonth: number;
    totalCommittedCapitalMinor: number;
    totalDrawnCapitalMinor: number;
    openQaQcIssues: number;
    criticalQaQcIssues: number;
    highRiskItemsCount: number;
    payrollRunwayWeeks: number;
  };
  baseCurrency: string;
}

export interface DigestSections {
  executiveSummary: string;
  cashPosition: string;
  projectProgress: string;
  sales: string;
  investor: string;
  operations: string;
  risks: string;
  keyWins: string[];
  keyConcerns: string[];
  recommendedActions: string[];
}

function fmt(amountMinor: number, currency: string): string {
  const major = amountMinor / 100;
  if (currency === "IDR") {
    if (Math.abs(major) >= 1e9) return `Rp ${(major / 1e9).toFixed(1)}B`;
    if (Math.abs(major) >= 1e6) return `Rp ${(major / 1e6).toFixed(0)}M`;
    return `Rp ${major.toFixed(0)}`;
  }
  return `${currency} ${major.toLocaleString()}`;
}

/**
 * Deterministic digest skeleton. AI agent (when configured) overlays
 * narrative on top of these sections; without AI this is the fully
 * usable draft.
 */
export function buildDigestSkeleton(ctx: DigestContext): DigestSections {
  const s = ctx.snapshot;
  const c = ctx.baseCurrency;

  const cashPosition = `### Cash position\n- Cash on hand: **${fmt(s.totalCashOnHandMinor, c)}**\n- Payroll runway: **${s.payrollRunwayWeeks.toFixed(0)} weeks**`;
  const projectProgress = `### Projects\n- Active: **${s.activeProjectsCount}**\n- On track: ${s.projectsOnTrack}\n- At risk: ${s.projectsAtRisk}\n- Delayed: ${s.projectsDelayed}`;
  const sales = `### Sales\n- Active leads: **${s.activeLeadsCount}**\n- Contracts signed this period: **${s.contractsSignedThisMonth}**`;
  const investor = `### Investor capital\n- Committed: ${fmt(s.totalCommittedCapitalMinor, c)}\n- Drawn: ${fmt(s.totalDrawnCapitalMinor, c)}\n- Available: ${fmt(s.totalCommittedCapitalMinor - s.totalDrawnCapitalMinor, c)}`;
  const operations = `### Operations\n- Open QA/QC: ${s.openQaQcIssues} (critical: ${s.criticalQaQcIssues})\n- High-risk items: ${s.highRiskItemsCount}`;

  const risksLines: string[] = [];
  if (s.criticalQaQcIssues > 0) {
    risksLines.push(`- ${s.criticalQaQcIssues} critical QA/QC issue(s) open`);
  }
  if (s.highRiskItemsCount > 0) {
    risksLines.push(`- ${s.highRiskItemsCount} high-risk item(s) flagged`);
  }
  if (s.payrollRunwayWeeks < 26) {
    risksLines.push(`- Payroll runway under 6 months (${s.payrollRunwayWeeks.toFixed(0)} weeks)`);
  }
  if (risksLines.length === 0) risksLines.push("- No critical risks open this period.");
  const risks = `### Risks\n${risksLines.join("\n")}`;

  const keyWins: string[] = [];
  if (s.contractsSignedThisMonth > 0) {
    keyWins.push(`${s.contractsSignedThisMonth} contract(s) signed`);
  }
  if (s.projectsOnTrack > s.projectsAtRisk + s.projectsDelayed) {
    keyWins.push(`Majority of projects (${s.projectsOnTrack}/${s.activeProjectsCount}) on track`);
  }

  const keyConcerns: string[] = [];
  if (s.projectsDelayed > 0) keyConcerns.push(`${s.projectsDelayed} project(s) delayed`);
  if (s.criticalQaQcIssues > 0) keyConcerns.push(`${s.criticalQaQcIssues} critical QA/QC issue(s) unresolved`);
  if (s.payrollRunwayWeeks < 26) keyConcerns.push(`Payroll runway under 6 months`);

  const recommendedActions: string[] = [];
  if (s.criticalQaQcIssues > 0) recommendedActions.push("Resolve critical QA/QC issues before next inspection.");
  if (s.payrollRunwayWeeks < 26) recommendedActions.push("Initiate capital call or accelerate buyer milestone billing.");
  if (s.activeLeadsCount === 0) recommendedActions.push("Refresh lead generation — pipeline is empty.");

  const executiveSummary = [
    `## ${ctx.periodLabel} executive summary`,
    `Cash position: ${fmt(s.totalCashOnHandMinor, c)}; runway ${s.payrollRunwayWeeks.toFixed(0)} weeks.`,
    `Active projects: ${s.activeProjectsCount} (${s.projectsOnTrack} on track, ${s.projectsAtRisk} at risk, ${s.projectsDelayed} delayed).`,
    `Sales: ${s.contractsSignedThisMonth} contract(s) signed this period; ${s.activeLeadsCount} active leads.`,
    keyConcerns.length === 0
      ? "No major concerns flagged this period."
      : `Concerns: ${keyConcerns.join("; ")}.`,
  ].join("\n\n");

  return {
    executiveSummary,
    cashPosition,
    projectProgress,
    sales,
    investor,
    operations,
    risks,
    keyWins,
    keyConcerns,
    recommendedActions,
  };
}

export function nextDigestCode(periodStart: Date): string {
  const yyyy = periodStart.getUTCFullYear();
  const mm = String(periodStart.getUTCMonth() + 1).padStart(2, "0");
  return `DIGEST-${yyyy}-${mm}`;
}
