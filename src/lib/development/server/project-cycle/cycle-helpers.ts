/**
 * Stage 5.B.2 — Pure Project Cycle Intelligence helpers.
 *
 * No I/O, no `import "server-only"`. Runtime testable.
 *
 * Three composable helpers:
 *   - computePayrollRunway:  cash on hand → runway months → risk level
 *   - predictTeamIdle:       active projects → when each role idles
 *   - computeProjectCycleAdvisory: orchestrates above + decision tree
 *
 * All amounts are USD-minor (cents) as `number` (BigInt-coerced where
 * the call site needs precision). Decision logic is *deterministic* —
 * same inputs always produce same recommendation. The AI agent (when
 * configured) only generates the *narrative* text on top of the
 * deterministic decision.
 */

// ----------------------------------------------------------------------------
// computePayrollRunway
// ----------------------------------------------------------------------------

export interface PayrollRunwayInput {
  cashOnHand: number;
  monthlyPayrollCommitment: number;
  monthlyOtherFixedCosts: number;
  /** Inflows by month, in order, starting with month 0. */
  expectedInflowsByMonth: number[];
}

export type RunwayRiskLevel = "safe" | "watch" | "concerning" | "critical";

export interface PayrollRunwayOutput {
  runwayMonths: number;
  cashAt30Days: number;
  cashAt60Days: number;
  cashAt90Days: number;
  riskLevel: RunwayRiskLevel;
}

export function computePayrollRunway(
  input: PayrollRunwayInput,
): PayrollRunwayOutput {
  for (const [k, v] of [
    ["cashOnHand", input.cashOnHand],
    ["monthlyPayrollCommitment", input.monthlyPayrollCommitment],
    ["monthlyOtherFixedCosts", input.monthlyOtherFixedCosts],
  ] as const) {
    if (!Number.isFinite(v)) {
      throw new Error(`payroll-runway: ${k} not finite`);
    }
  }
  if (input.monthlyPayrollCommitment < 0 || input.monthlyOtherFixedCosts < 0) {
    throw new Error("payroll-runway: monthly commitments must be >= 0");
  }

  const monthlyBurn =
    input.monthlyPayrollCommitment + input.monthlyOtherFixedCosts;

  // Walk month by month until cash goes negative or we hit 60 months.
  let cash = input.cashOnHand;
  let runwayMonths = 0;
  const monthlyCash: number[] = [];
  const MAX_MONTHS = 60;
  for (let i = 0; i < MAX_MONTHS; i++) {
    const inflow = input.expectedInflowsByMonth[i] ?? 0;
    cash = cash + inflow - monthlyBurn;
    monthlyCash.push(cash);
    if (cash < 0) break;
    runwayMonths = i + 1;
  }
  if (runwayMonths === MAX_MONTHS) runwayMonths = MAX_MONTHS;

  const cashAt30Days = monthlyCash[0] ?? input.cashOnHand;
  const cashAt60Days = monthlyCash[1] ?? cashAt30Days;
  const cashAt90Days = monthlyCash[2] ?? cashAt60Days;

  let riskLevel: RunwayRiskLevel;
  if (runwayMonths >= 12) riskLevel = "safe";
  else if (runwayMonths >= 6) riskLevel = "watch";
  else if (runwayMonths >= 3) riskLevel = "concerning";
  else riskLevel = "critical";

  return {
    runwayMonths,
    cashAt30Days,
    cashAt60Days,
    cashAt90Days,
    riskLevel,
  };
}

// ----------------------------------------------------------------------------
// predictTeamIdle
// ----------------------------------------------------------------------------

export interface PredictTeamIdleInput {
  activeProjects: Array<{
    progressPct: number;
    expectedCompletionDate: Date;
    monthlyTeamHours: number;
  }>;
  teamTotalCapacity: number;
  currentDate: Date;
}

export interface PredictTeamIdleOutput {
  predictedIdleStartDate: Date | null;
  predictedIdleHoursPerWeek: number;
  weeksUntilIdle: number | null;
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

export function predictTeamIdle(
  input: PredictTeamIdleInput,
): PredictTeamIdleOutput {
  if (input.teamTotalCapacity <= 0) {
    return {
      predictedIdleStartDate: null,
      predictedIdleHoursPerWeek: 0,
      weeksUntilIdle: null,
    };
  }

  // Current utilization from active projects (monthly hours → weekly).
  const currentMonthlyHours = input.activeProjects.reduce(
    (acc, p) => acc + p.monthlyTeamHours,
    0,
  );
  const currentWeeklyHours = currentMonthlyHours / 4.33;
  const currentlyIdle = Math.max(input.teamTotalCapacity - currentWeeklyHours, 0);

  if (input.activeProjects.length === 0) {
    // No active projects — fully idle today.
    return {
      predictedIdleStartDate: input.currentDate,
      predictedIdleHoursPerWeek: input.teamTotalCapacity,
      weeksUntilIdle: 0,
    };
  }

  if (currentlyIdle > input.teamTotalCapacity * 0.2) {
    // Already more than 20% idle — call it now.
    return {
      predictedIdleStartDate: input.currentDate,
      predictedIdleHoursPerWeek: currentlyIdle,
      weeksUntilIdle: 0,
    };
  }

  // Sort projects by expected completion date ascending. The earliest-
  // completing project's date is when the team starts having idle capacity.
  const sorted = [...input.activeProjects].sort(
    (a, b) =>
      a.expectedCompletionDate.getTime() - b.expectedCompletionDate.getTime(),
  );
  const earliestCompletion = sorted[0].expectedCompletionDate;
  const weeksUntilIdle = Math.max(
    0,
    Math.round(
      (earliestCompletion.getTime() - input.currentDate.getTime()) / MS_PER_WEEK,
    ),
  );
  const releasedMonthlyHours = sorted[0].monthlyTeamHours;
  const predictedIdleHoursPerWeek = currentlyIdle + releasedMonthlyHours / 4.33;

  return {
    predictedIdleStartDate: earliestCompletion,
    predictedIdleHoursPerWeek,
    weeksUntilIdle,
  };
}

// ----------------------------------------------------------------------------
// computeProjectCycleAdvisory — orchestrator
// ----------------------------------------------------------------------------

export interface ProjectCycleInput {
  currentDate: Date;
  cashOnHand: number;
  receivablesNext30Days: number;
  payablesNext30Days: number;
  monthlyPayrollCommitment: number;
  monthlyOtherFixedCosts: number;
  expectedInflowsByMonth: number[];
  activeProjects: Array<{
    projectId: string;
    progressPercentage: number;
    expectedCompletionDate: Date;
    monthlyBurnRate: number;
    monthlyTeamHours: number;
  }>;
  teamRoles: Array<{
    role: string;
    totalCapacity: number;
    utilizedCapacity: number;
  }>;
  unsoldUnits: number;
  cashFromExpectedSales: number;
}

export type RecommendedAction =
  | "start_new_project_now"
  | "start_new_project_in_X_weeks"
  | "pause_team_capacity"
  | "reduce_team_size"
  | "increase_team_size"
  | "continue_current_pace"
  | "reallocate_capacity";

export interface ProjectCycleOutput {
  payrollRunwayWeeks: number;
  payrollRunwayRisk: RunwayRiskLevel;
  teamUtilizationPercentage: number;
  idleCapacityPercentage: number;
  roleUtilization: Array<{
    role: string;
    utilizationPct: number;
    daysUntilFreeForNewProject: number;
  }>;
  recommendedAction: RecommendedAction;
  recommendedTiming: string;
  reasoning: string;
  supportingMetrics: Record<string, number>;
  confidenceLevel: "low" | "medium" | "high";
}

export function computeProjectCycleAdvisory(
  input: ProjectCycleInput,
): ProjectCycleOutput {
  // Step 1 — payroll runway.
  const runway = computePayrollRunway({
    cashOnHand: input.cashOnHand,
    monthlyPayrollCommitment: input.monthlyPayrollCommitment,
    monthlyOtherFixedCosts: input.monthlyOtherFixedCosts,
    expectedInflowsByMonth: input.expectedInflowsByMonth,
  });
  const payrollRunwayWeeks = Math.round(runway.runwayMonths * 4.33);

  // Step 2 — utilization.
  const totalCapacity = input.teamRoles.reduce(
    (acc, r) => acc + r.totalCapacity,
    0,
  );
  const totalUtilized = input.teamRoles.reduce(
    (acc, r) => acc + r.utilizedCapacity,
    0,
  );
  const teamUtilizationPercentage =
    totalCapacity > 0 ? (totalUtilized / totalCapacity) * 100 : 0;
  const idleCapacityPercentage = Math.max(0, 100 - teamUtilizationPercentage);

  // Step 3 — per-role breakdown + days-until-free.
  const idlePrediction = predictTeamIdle({
    activeProjects: input.activeProjects.map((p) => ({
      progressPct: p.progressPercentage,
      expectedCompletionDate: p.expectedCompletionDate,
      monthlyTeamHours: p.monthlyTeamHours,
    })),
    teamTotalCapacity: totalCapacity,
    currentDate: input.currentDate,
  });
  const daysUntilFree =
    idlePrediction.weeksUntilIdle != null
      ? idlePrediction.weeksUntilIdle * 7
      : 0;
  const roleUtilization = input.teamRoles.map((r) => ({
    role: r.role,
    utilizationPct:
      r.totalCapacity > 0 ? (r.utilizedCapacity / r.totalCapacity) * 100 : 0,
    daysUntilFreeForNewProject: daysUntilFree,
  }));

  // Step 4 — decision tree (deterministic).
  let recommendedAction: RecommendedAction;
  let recommendedTiming: string;
  let reasoningLines: string[] = [];
  let confidenceLevel: "low" | "medium" | "high" = "high";

  if (runway.riskLevel === "critical") {
    recommendedAction = "pause_team_capacity";
    recommendedTiming = "immediately";
    reasoningLines = [
      `### Critical cash position`,
      `Payroll runway is **${runway.runwayMonths.toFixed(1)} months** at current burn (≈ ${payrollRunwayWeeks} weeks). Risk level: ${runway.riskLevel}.`,
      `Recommend pausing capacity expansion and prioritising distribution execution / capital call until runway returns above 6 months.`,
    ];
  } else if (runway.riskLevel === "concerning") {
    recommendedAction = "continue_current_pace";
    recommendedTiming = "review weekly";
    reasoningLines = [
      `### Concerning cash position`,
      `Runway is **${runway.runwayMonths.toFixed(1)} months** — within the 3–6 month "watch carefully" band.`,
      `Hold current pace; do not commit to a new project until runway re-stabilises above 9 months.`,
    ];
    confidenceLevel = "medium";
  } else if (
    teamUtilizationPercentage < 60 &&
    runway.riskLevel === "safe"
  ) {
    recommendedAction = "start_new_project_now";
    recommendedTiming = "this quarter";
    reasoningLines = [
      `### Idle capacity + healthy cash`,
      `Team utilization is **${teamUtilizationPercentage.toFixed(0)}%** with ${idleCapacityPercentage.toFixed(0)}% idle. Runway ${runway.runwayMonths.toFixed(1)} months (${runway.riskLevel}).`,
      `Now is the right time to start a new project — team can absorb the load without hiring.`,
    ];
  } else if (
    idlePrediction.weeksUntilIdle != null &&
    idlePrediction.weeksUntilIdle < 12 &&
    runway.riskLevel === "safe"
  ) {
    recommendedAction = "start_new_project_in_X_weeks";
    recommendedTiming = `${idlePrediction.weeksUntilIdle} weeks`;
    reasoningLines = [
      `### Pipeline timing window`,
      `Team will free up ${idlePrediction.predictedIdleHoursPerWeek.toFixed(0)} hrs/week starting in ${idlePrediction.weeksUntilIdle} weeks (project completion).`,
      `Begin land acquisition + design now so construction lines up with capacity release.`,
    ];
  } else if (teamUtilizationPercentage > 95) {
    recommendedAction = "increase_team_size";
    recommendedTiming = "next month";
    reasoningLines = [
      `### Team at capacity`,
      `Utilization at **${teamUtilizationPercentage.toFixed(0)}%** is unsustainable — burnout + execution risk.`,
      `Consider hiring 1–2 in the most stretched role(s) before committing to additional scope.`,
    ];
    confidenceLevel = "medium";
  } else {
    recommendedAction = "continue_current_pace";
    recommendedTiming = "review next quarter";
    reasoningLines = [
      `### Steady state`,
      `Runway ${runway.runwayMonths.toFixed(1)} months (${runway.riskLevel}); utilization ${teamUtilizationPercentage.toFixed(0)}%.`,
      `No structural change indicated. Re-evaluate on the next monthly cron run.`,
    ];
    confidenceLevel = "medium";
  }

  return {
    payrollRunwayWeeks,
    payrollRunwayRisk: runway.riskLevel,
    teamUtilizationPercentage,
    idleCapacityPercentage,
    roleUtilization,
    recommendedAction,
    recommendedTiming,
    reasoning: reasoningLines.join("\n"),
    supportingMetrics: {
      payrollRunwayMonths: runway.runwayMonths,
      cashAt30Days: runway.cashAt30Days,
      cashAt60Days: runway.cashAt60Days,
      cashAt90Days: runway.cashAt90Days,
      teamUtilizationPercentage,
      idleCapacityPercentage,
      activeProjectCount: input.activeProjects.length,
      unsoldUnits: input.unsoldUnits,
      cashFromExpectedSales: input.cashFromExpectedSales,
    },
    confidenceLevel,
  };
}
