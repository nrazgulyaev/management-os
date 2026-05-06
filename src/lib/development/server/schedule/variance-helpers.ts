/**
 * Stage 5.H.2 — Pure schedule baseline + variance helpers.
 *
 * No I/O, no `import "server-only"`. Runtime testable.
 */

export type VarianceStatus =
  | "ahead_of_schedule"
  | "on_schedule"
  | "minor_delay"
  | "moderate_delay"
  | "major_delay"
  | "critical_delay";

export type VarianceSeverity = "low" | "medium" | "high" | "critical";

export interface VarianceClassification {
  status: VarianceStatus;
  severity: VarianceSeverity;
}

export function classifyVariance(daysVariance: number): VarianceClassification {
  if (daysVariance < 0) {
    return { status: "ahead_of_schedule", severity: "low" };
  }
  if (daysVariance === 0) {
    return { status: "on_schedule", severity: "low" };
  }
  if (daysVariance <= 3) {
    return { status: "minor_delay", severity: "low" };
  }
  if (daysVariance <= 7) {
    return { status: "moderate_delay", severity: "medium" };
  }
  if (daysVariance <= 14) {
    return { status: "major_delay", severity: "high" };
  }
  return { status: "critical_delay", severity: "critical" };
}

export interface ProjectScheduleHealthInput {
  totalTasks: number;
  taskVariances: Array<{
    isCriticalPath: boolean;
    finishVarianceDays: number;
    status: string;
  }>;
}

export type OverallScheduleHealth =
  | "on_track"
  | "minor_concerns"
  | "at_risk"
  | "severely_delayed";

export interface ProjectScheduleHealthOutput {
  overallHealth: OverallScheduleHealth;
  criticalPathSlippage: number;
  delayedTasksCount: number;
  delayedCriticalTasksCount: number;
  averageDelayDays: number;
  schedulePerformanceIndex: number;
}

/**
 * Compute project-level schedule health from per-task variances.
 * SPI = baseline duration / current duration; here we approximate via
 * (1 - avgDelay/30) clamped to a sensible band so > 1 = ahead, 1 = on,
 * < 1 = behind. Caller can substitute a real EVM SPI when available.
 */
export function computeProjectScheduleHealth(
  input: ProjectScheduleHealthInput,
): ProjectScheduleHealthOutput {
  if (input.totalTasks === 0) {
    return {
      overallHealth: "on_track",
      criticalPathSlippage: 0,
      delayedTasksCount: 0,
      delayedCriticalTasksCount: 0,
      averageDelayDays: 0,
      schedulePerformanceIndex: 1,
    };
  }
  const delayed = input.taskVariances.filter((t) => t.finishVarianceDays > 0);
  const delayedCritical = delayed.filter((t) => t.isCriticalPath);
  const criticalSlippage =
    delayedCritical.length > 0
      ? Math.max(...delayedCritical.map((t) => t.finishVarianceDays))
      : 0;
  const averageDelay =
    delayed.length > 0
      ? delayed.reduce((a, t) => a + t.finishVarianceDays, 0) / delayed.length
      : 0;

  let overall: OverallScheduleHealth;
  if (criticalSlippage >= 15) overall = "severely_delayed";
  else if (criticalSlippage >= 8) overall = "at_risk";
  else if (criticalSlippage >= 1 || delayed.length / input.totalTasks > 0.3) {
    overall = "minor_concerns";
  } else {
    overall = "on_track";
  }

  // SPI proxy: 1.0 - (averageDelay/30); clamp to [0, 1.5].
  const spi = Math.max(0, Math.min(1.5, 1 - averageDelay / 30));

  return {
    overallHealth: overall,
    criticalPathSlippage: criticalSlippage,
    delayedTasksCount: delayed.length,
    delayedCriticalTasksCount: delayedCritical.length,
    averageDelayDays: averageDelay,
    schedulePerformanceIndex: spi,
  };
}

export interface SlipPatternInput {
  computedAt: Date;
  criticalPathSlippage: number;
}

export interface SlipPatternOutput {
  trendDirection: "improving" | "stable" | "worsening";
  weeklySlipRate: number;
  forecastFinishDelay: number;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function detectScheduleSlipPattern(
  variances: SlipPatternInput[],
): SlipPatternOutput {
  if (variances.length < 2) {
    return {
      trendDirection: "stable",
      weeklySlipRate: 0,
      forecastFinishDelay:
        variances.length > 0 ? variances[0].criticalPathSlippage : 0,
    };
  }
  const sorted = [...variances].sort(
    (a, b) => a.computedAt.getTime() - b.computedAt.getTime(),
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const totalSlip = last.criticalPathSlippage - first.criticalPathSlippage;
  const weeks =
    (last.computedAt.getTime() - first.computedAt.getTime()) / WEEK_MS;
  const weeklySlipRate = weeks > 0 ? totalSlip / weeks : 0;

  let trend: SlipPatternOutput["trendDirection"];
  if (weeklySlipRate > 0.5) trend = "worsening";
  else if (weeklySlipRate < -0.5) trend = "improving";
  else trend = "stable";

  // Forecast: project the rate forward 4 weeks.
  const forecastFinishDelay = Math.max(
    0,
    last.criticalPathSlippage + weeklySlipRate * 4,
  );
  return {
    trendDirection: trend,
    weeklySlipRate,
    forecastFinishDelay,
  };
}
