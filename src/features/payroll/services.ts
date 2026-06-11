import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  staff,
  staffAssignments,
  payrollRuns,
  type Staff,
  type PayrollRun,
} from "@/lib/db/schema/payroll";
import { villas, projects } from "@/lib/db/schema/projects";
import { expenseLines } from "@/lib/db/schema/finance";
import { requireOrgId } from "@/features/auth/require-org";

export interface StaffRow extends Staff {
  villaCode: string | null;
  projectName: string | null;
  /** Count of ACTIVE assignments (multi-target). */
  assignmentCount: number;
  /** Sum of active assignment weights — drives per_villa_fixed cost. */
  assignmentWeight: number;
  /** Computed monthly cost in minor units, per comp_mode. */
  monthlyCostMinor: bigint;
}

/**
 * Computed monthly cost for a staff member, in minor units, per comp_mode:
 *   salaried        → monthly_rate_minor
 *   per_villa_fixed → per_villa_rate_minor × sum(active assignment weights)
 *   per_service     → 0 (ad-hoc; never posted in the monthly run)
 * Shared by the roster table + the header KPI so the page never disagrees with
 * what `runPayrollAction` actually posts.
 */
export function computeMonthlyCostMinor(
  member: Pick<Staff, "compMode" | "monthlyRateMinor" | "perVillaRateMinor">,
  activeAssignmentWeight: number,
): bigint {
  if (member.compMode === "salaried") return member.monthlyRateMinor;
  if (member.compMode === "per_villa_fixed") {
    const rate = member.perVillaRateMinor ?? 0n;
    // weight is a numeric(8,3); round the product to whole minor units.
    return BigInt(Math.round(Number(rate) * activeAssignmentWeight));
  }
  return 0n; // per_service
}

/** All staff for the caller's org (active + inactive), newest rates first. */
export async function listStaff(): Promise<StaffRow[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const rows = await db
    .select({
      s: staff,
      villaCode: villas.unitCode,
      projectName: projects.name,
      assignmentCount: sql<number>`(
        select count(*)::int from ${staffAssignments}
        where ${staffAssignments.staffId} = ${staff.id}
          and ${staffAssignments.organizationId} = ${staff.organizationId}
          and ${staffAssignments.active} = true
      )`,
      assignmentWeight: sql<string>`(
        select coalesce(sum(${staffAssignments.weight}), 0) from ${staffAssignments}
        where ${staffAssignments.staffId} = ${staff.id}
          and ${staffAssignments.organizationId} = ${staff.organizationId}
          and ${staffAssignments.active} = true
      )`,
    })
    .from(staff)
    .leftJoin(villas, eq(villas.id, staff.villaId))
    .leftJoin(projects, eq(projects.id, staff.projectId))
    .where(eq(staff.organizationId, organizationId))
    .orderBy(desc(staff.active), desc(staff.createdAt));
  return rows.map((r) => {
    const weight = Number(r.assignmentWeight ?? "0");
    return {
      ...r.s,
      villaCode: r.villaCode ?? null,
      projectName: r.projectName ?? null,
      assignmentCount: r.assignmentCount ?? 0,
      assignmentWeight: weight,
      monthlyCostMinor: computeMonthlyCostMinor(r.s, weight),
    };
  });
}

export interface StaffAssignmentRow {
  id: string;
  villaId: string | null;
  projectId: string | null;
  weight: number;
  active: boolean;
  villaCode: string | null;
  projectName: string | null;
}

/** Active+inactive assignments for one staff member, org-scoped (for the editor). */
export async function listStaffAssignments(staffId: string): Promise<StaffAssignmentRow[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const rows = await db
    .select({
      id: staffAssignments.id,
      villaId: staffAssignments.villaId,
      projectId: staffAssignments.projectId,
      weight: staffAssignments.weight,
      active: staffAssignments.active,
      villaCode: villas.unitCode,
      projectName: projects.name,
    })
    .from(staffAssignments)
    .leftJoin(villas, eq(villas.id, staffAssignments.villaId))
    .leftJoin(projects, eq(projects.id, staffAssignments.projectId))
    .where(
      and(
        eq(staffAssignments.staffId, staffId),
        eq(staffAssignments.organizationId, organizationId),
      ),
    )
    .orderBy(desc(staffAssignments.active), desc(staffAssignments.createdAt));
  return rows.map((r) => ({
    id: r.id,
    villaId: r.villaId ?? null,
    projectId: r.projectId ?? null,
    weight: Number(r.weight ?? "1"),
    active: r.active,
    villaCode: r.villaCode ?? null,
    projectName: r.projectName ?? null,
  }));
}

/** A single staff member, org-scoped (cross-org id → null). */
export async function getStaffById(id: string): Promise<Staff | null> {
  const db = getDb();
  if (!db) return null;
  const organizationId = await requireOrgId();
  const [row] = await db
    .select()
    .from(staff)
    .where(and(eq(staff.id, id), eq(staff.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

export interface PayrollRunRow extends PayrollRun {
  postedByName: string | null;
}

/** Payroll-run history for the caller's org, newest month first. */
export async function listPayrollRuns(): Promise<PayrollRun[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  return db
    .select()
    .from(payrollRuns)
    .where(eq(payrollRuns.organizationId, organizationId))
    .orderBy(desc(payrollRuns.periodMonth));
}

/** Aggregate counters for the page header KPIs (org-scoped). */
export async function getPayrollSummary(): Promise<{
  activeStaffCount: number;
  monthlyRunRateMinor: bigint;
  currency: string | null;
  runCount: number;
}> {
  const db = getDb();
  if (!db) {
    return { activeStaffCount: 0, monthlyRunRateMinor: 0n, currency: null, runCount: 0 };
  }
  const organizationId = await requireOrgId();
  // The header "monthly run rate" must match what a run actually posts, so it
  // is the sum of the COMPUTED per-comp_mode cost (salaried + per_villa_fixed;
  // per_service contributes 0). Reuse listStaff so the math lives in one place.
  const roster = await listStaff();
  const active = roster.filter((s) => s.active);
  const monthlyRunRateMinor = active.reduce((acc, s) => acc + s.monthlyCostMinor, 0n);
  const currency = active.find((s) => s.currency)?.currency ?? null;
  const [runs] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(payrollRuns)
    .where(eq(payrollRuns.organizationId, organizationId));
  return {
    activeStaffCount: active.length,
    monthlyRunRateMinor,
    currency,
    runCount: runs?.c ?? 0,
  };
}

/** Expense lines a given run generated — for the run-history drill-down. */
export async function listRunExpenseLines(runId: string): Promise<
  {
    id: string;
    description: string;
    amountMinor: bigint;
    currency: string;
    allocationScope: string;
    costBearer: string;
  }[]
> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  // The run is org-scoped; only return its lines if the run belongs to the org.
  const [run] = await db
    .select({ id: payrollRuns.id })
    .from(payrollRuns)
    .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.organizationId, organizationId)))
    .limit(1);
  if (!run) return [];
  const rows = await db
    .select({
      id: expenseLines.id,
      description: expenseLines.description,
      amountMinor: expenseLines.amountMinor,
      currency: expenseLines.currency,
      allocationScope: expenseLines.allocationScope,
      costBearer: expenseLines.costBearer,
    })
    .from(expenseLines)
    .where(eq(expenseLines.payrollRunId, runId))
    .orderBy(desc(expenseLines.amountMinor));
  return rows.map((r) => ({ ...r, amountMinor: BigInt(r.amountMinor) }));
}
