/**
 * Stage 5.D — AI Weekly Construction Plan pure helpers.
 */

export interface WeeklyPlanInput {
  weekStart: Date;
  projectName: string;
  criticalPathTasksNext4Weeks: Array<{
    taskName: string;
    earliestStart: Date;
    isOnCriticalPath: boolean;
    blockedBy?: string;
  }>;
  resourceUtilizationByRole: Array<{ role: string; utilizationPct: number }>;
  pendingMaterialDeliveries: Array<{
    material: string;
    expectedAt: Date;
    isCritical: boolean;
  }>;
}

export interface WeeklyPlanOutput {
  weekLabel: string;
  criticalPathPriorities: string[];
  crewAllocationRecommendations: string[];
  materialBlockers: string[];
  riskAreas: string[];
  recommendedAdjustments: string[];
}

const DAY = 24 * 60 * 60 * 1000;

export function buildWeeklyPlan(input: WeeklyPlanInput): WeeklyPlanOutput {
  const weekEnd = new Date(input.weekStart.getTime() + 7 * DAY);
  const weekLabel = `Week of ${input.weekStart.toISOString().slice(0, 10)}`;

  // Critical path priorities — anything starting in this week + on CP.
  const thisWeek = input.criticalPathTasksNext4Weeks
    .filter(
      (t) =>
        t.earliestStart >= input.weekStart && t.earliestStart < weekEnd,
    )
    .sort((a, b) => a.earliestStart.getTime() - b.earliestStart.getTime());

  const criticalPathPriorities = thisWeek
    .filter((t) => t.isOnCriticalPath)
    .map(
      (t) =>
        `${t.taskName} (start ${t.earliestStart.toISOString().slice(0, 10)})${t.blockedBy ? ` — blocked by ${t.blockedBy}` : ""}`,
    );

  const crewAllocationRecommendations: string[] = [];
  for (const r of input.resourceUtilizationByRole) {
    if (r.utilizationPct > 95) {
      crewAllocationRecommendations.push(
        `${r.role} at ${r.utilizationPct.toFixed(0)}% — consider augmenting headcount.`,
      );
    } else if (r.utilizationPct < 40) {
      crewAllocationRecommendations.push(
        `${r.role} at ${r.utilizationPct.toFixed(0)}% — reallocate to in-progress projects.`,
      );
    }
  }
  if (crewAllocationRecommendations.length === 0) {
    crewAllocationRecommendations.push(
      "Resource utilisation balanced across roles.",
    );
  }

  const materialBlockers = input.pendingMaterialDeliveries
    .filter((d) => d.isCritical && d.expectedAt < weekEnd)
    .map(
      (d) =>
        `${d.material} due ${d.expectedAt.toISOString().slice(0, 10)} — confirm with supplier.`,
    );

  const riskAreas: string[] = [];
  if (criticalPathPriorities.some((p) => /blocked by/.test(p))) {
    riskAreas.push("Critical-path task blocked — prioritise unblocking this week.");
  }
  if (materialBlockers.length > 0) {
    riskAreas.push(
      `${materialBlockers.length} critical material delivery item(s) at risk.`,
    );
  }

  const recommendedAdjustments: string[] = [];
  if (criticalPathPriorities.length === 0) {
    recommendedAdjustments.push(
      "No critical-path tasks scheduled this week — opportunity for catch-up on slack tasks.",
    );
  } else {
    recommendedAdjustments.push(
      `${criticalPathPriorities.length} critical-path task(s) this week — ensure daily standups cover each.`,
    );
  }

  return {
    weekLabel,
    criticalPathPriorities,
    crewAllocationRecommendations,
    materialBlockers,
    riskAreas,
    recommendedAdjustments,
  };
}
