import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import type { JobOutcome, JobRunHandle } from "@/features/jobs/runner";
import {
  computeProjectCycleAdvisory,
  type ProjectCycleInput,
} from "../project-cycle/cycle-helpers";
import { projectCycleRecommendations } from "@/lib/db/schema/project-cycle";
import { getOrganizationByCode } from "../organizations/organization-queries";

/**
 * Stage 5.B.2 — Project Cycle Advisory (Monday 06:00).
 *
 * Builds a deterministic context snapshot from current DB state:
 *   - cash on hand (sum of dev_bank_accounts current balances in USD)
 *   - active projects + completion estimates
 *   - latest team capacity tracking row per role
 *   - latest payroll period as monthly commitment
 *
 * Calls the pure deterministic decision tree to generate a recommendation,
 * persists it as `unreviewed` for operator review.
 *
 * **Operator review required — no auto-action ever.**
 */
export async function runDevOsProjectCycleAdvisory(
  handle: JobRunHandle,
): Promise<JobOutcome> {
  const db = getDb();
  if (!db) {
    return {
      status: "failed",
      summary: "Database is not configured.",
      metrics: { generated: 0 },
      error: "DB unavailable",
    };
  }

  // Build the context snapshot.
  const cashRow = await db.execute<{ cash: string }>(sql`
    SELECT COALESCE(SUM(current_balance_usd_minor), 0)::text AS cash
      FROM dev_bank_accounts
     WHERE is_active = TRUE
  `);
  const cashOnHand = Number(
    rowsOf<{ cash: string }>(cashRow)[0]?.cash ?? "0",
  );

  // Active projects with their completion estimates.
  const projectsRows = await db.execute<{
    id: string;
    expected_completion: string | null;
    progress_pct: string;
    monthly_burn: string;
  }>(sql`
    SELECT
      p.id::text,
      p.expected_handover::text AS expected_completion,
      p.construction_progress_pct::text AS progress_pct,
      0::text AS monthly_burn
    FROM projects p
    WHERE p.status IN ('planning', 'under_construction', 'active')
    LIMIT 20
  `);
  const projectRows =
    rowsOf<{
        id: string;
        expected_completion: string | null;
        progress_pct: string;
        monthly_burn: string;
      }>(projectsRows);

  const now = new Date();
  const oneYearFromNow = new Date(
    now.getFullYear() + 1,
    now.getMonth(),
    now.getDate(),
  );
  const activeProjects = projectRows.map((r) => ({
    projectId: r.id,
    progressPercentage: Number(r.progress_pct),
    expectedCompletionDate: r.expected_completion
      ? new Date(r.expected_completion)
      : oneYearFromNow,
    monthlyBurnRate: Number(r.monthly_burn),
    monthlyTeamHours: 160, // placeholder — refined when capacity tracking added
  }));

  // Latest team capacity per role.
  const capacityRows = await db.execute<{
    role: string;
    total_capacity: string;
    utilized: string;
  }>(sql`
    SELECT DISTINCT ON (role_type)
      role_type AS role,
      total_capacity_hours::text AS total_capacity,
      utilized_hours::text AS utilized
    FROM team_capacity_tracking
    ORDER BY role_type, tracking_period_end DESC
  `);
  const teamRoles = (
    rowsOf<{ role: string; total_capacity: string; utilized: string }>(capacityRows)
  ).map((r) => ({
    role: r.role,
    totalCapacity: Number(r.total_capacity),
    utilizedCapacity: Number(r.utilized),
  }));

  // Latest payroll commitment.
  const payrollRows = rowsOf<{ amount: string; headcount: string }>(
    await db.execute<{ amount: string; headcount: string }>(sql`
      SELECT total_payroll_amount_minor::text AS amount,
             total_headcount::text AS headcount
        FROM payroll_periods
       ORDER BY period_start DESC
       LIMIT 1
    `),
  );
  const monthlyPayroll = Number(payrollRows[0]?.amount ?? "0");

  const context: ProjectCycleInput = {
    currentDate: now,
    cashOnHand,
    receivablesNext30Days: 0,
    payablesNext30Days: 0,
    monthlyPayrollCommitment: monthlyPayroll,
    monthlyOtherFixedCosts: monthlyPayroll * 0.3, // rough heuristic
    expectedInflowsByMonth: [],
    activeProjects,
    teamRoles,
    unsoldUnits: 0,
    cashFromExpectedSales: 0,
  };

  const advisory = computeProjectCycleAdvisory(context);

  // TENANCY — company-wide cron with no session/project; anchor the
  // recommendation row to the platform default org (mirrors migration 0151
  // backfill + the sibling cashflow-autogenerate cron). Without this the row
  // lands `organization_id = NULL` and is invisible to every org-scoped
  // reader (orphaned), or worse leaks across tenants on an unscoped read.
  const defaultOrg = await getOrganizationByCode("ARCONIQUE_DEFAULT");
  if (!defaultOrg) {
    return {
      status: "failed",
      summary: "No ARCONIQUE_DEFAULT org — cannot scope the recommendation.",
      metrics: { generated: 0 },
      error: "default org missing",
    };
  }

  const countRows = rowsOf<{ count: string }>(
    await db.execute<{ count: string }>(sql`
      SELECT COUNT(*)::text AS count FROM project_cycle_recommendations
    `),
  );
  const year = new Date().getFullYear();
  const seq = String(Number(countRows[0]?.count ?? "0") + 1).padStart(3, "0");
  const code = `PCR-${year}-${seq}`;

  await db.insert(projectCycleRecommendations).values({
    organizationId: defaultOrg.id,
    recommendationCode: code,
    generatedForDate: now.toISOString().slice(0, 10),
    generatedByAgent: "project_cycle_intelligence_cron",
    contextSnapshot: {
      currentDate: context.currentDate.toISOString(),
      cashOnHand: context.cashOnHand,
      activeProjectCount: activeProjects.length,
      teamRoleCount: teamRoles.length,
      monthlyPayroll,
    },
    recommendedAction: advisory.recommendedAction,
    recommendedTiming: advisory.recommendedTiming,
    aiReasoning: advisory.reasoning,
    supportingMetrics: advisory.supportingMetrics,
    confidenceLevel: advisory.confidenceLevel,
    operatorStatus: "unreviewed",
  });

  await handle.event(
    "info",
    `cycle advisory ${code}: ${advisory.recommendedAction}`,
    { code, action: advisory.recommendedAction },
  );

  return {
    status: "success",
    summary: `Generated cycle advisory ${code} (${advisory.recommendedAction}).`,
    metrics: {
      generated: 1,
      activeProjects: activeProjects.length,
      teamRoles: teamRoles.length,
    },
  };
}
