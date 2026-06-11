import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { staff, payrollRuns, type Staff, type PayrollRun } from "@/lib/db/schema/payroll";
import { villas, projects } from "@/lib/db/schema/projects";
import { expenseLines } from "@/lib/db/schema/finance";
import { requireOrgId } from "@/features/auth/require-org";

export interface StaffRow extends Staff {
  villaCode: string | null;
  projectName: string | null;
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
    })
    .from(staff)
    .leftJoin(villas, eq(villas.id, staff.villaId))
    .leftJoin(projects, eq(projects.id, staff.projectId))
    .where(eq(staff.organizationId, organizationId))
    .orderBy(desc(staff.active), desc(staff.createdAt));
  return rows.map((r) => ({
    ...r.s,
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
  const [agg] = await db
    .select({
      activeStaffCount: sql<number>`count(*)::int`,
      monthlyRunRateMinor: sql<string>`coalesce(sum(${staff.monthlyRateMinor}), 0)`,
      currency: sql<string | null>`max(${staff.currency})`,
    })
    .from(staff)
    .where(and(eq(staff.organizationId, organizationId), eq(staff.active, true)));
  const [runs] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(payrollRuns)
    .where(eq(payrollRuns.organizationId, organizationId));
  return {
    activeStaffCount: agg?.activeStaffCount ?? 0,
    monthlyRunRateMinor: BigInt(agg?.monthlyRunRateMinor ?? "0"),
    currency: agg?.currency ?? null,
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
    })
    .from(expenseLines)
    .where(eq(expenseLines.payrollRunId, runId))
    .orderBy(desc(expenseLines.amountMinor));
  return rows.map((r) => ({ ...r, amountMinor: BigInt(r.amountMinor) }));
}
