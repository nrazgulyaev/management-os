"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { staff, payrollRuns } from "@/lib/db/schema/payroll";
import { expenseLines } from "@/lib/db/schema/finance";
import { villas, projects } from "@/lib/db/schema/projects";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { findLockingPeriod } from "@/features/finance/validation";
import {
  createStaffSchema,
  updateStaffSchema,
  setStaffActiveSchema,
  runPayrollSchema,
} from "./schema";
import type { ActionResult } from "@/features/projects/actions";

const nullable = (v: string | undefined) => (v && v !== "" ? v : null);

// Payroll posts finance expense lines, so it is gated by the same money
// permission the manual expense form uses (finance.write). This keeps the
// role grants honest — no invented permission with no backing role.
async function ensurePayrollWrite() {
  await requirePermission("finance.write");
}

/**
 * Validate that an optional villa/project target actually belongs to the
 * caller's org. villas have no org column — they inherit it via their project
 * — so we resolve the villa's project and check that project's org. Returns an
 * error message string on a cross-org/missing target, or null when clean.
 */
async function assertTargetInOrg(
  db: NonNullable<ReturnType<typeof getDb>>,
  organizationId: string,
  scope: string,
  villaId: string | null,
  projectId: string | null,
): Promise<string | null> {
  if (scope === "villa") {
    if (!villaId) return "Choose a villa for villa-scoped staff.";
    const [row] = await db
      .select({ orgId: projects.organizationId })
      .from(villas)
      .innerJoin(projects, eq(projects.id, villas.projectId))
      .where(eq(villas.id, villaId))
      .limit(1);
    if (!row || row.orgId !== organizationId) return "Villa not found.";
  }
  if (scope === "project_pool") {
    if (!projectId) return "Choose a project for project-pool staff.";
    const [row] = await db
      .select({ orgId: projects.organizationId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!row || row.orgId !== organizationId) return "Project not found.";
  }
  return null;
}

// -----------------------------------------------------------------------------
// Staff CRUD
// -----------------------------------------------------------------------------
export async function createStaffAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await ensurePayrollWrite();
  const parsed = createStaffSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: "Please review the form.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const organizationId = await requireOrgId();
  const d = parsed.data;
  const villaId = nullable(d.villaId);
  const projectId = nullable(d.projectId);
  const targetErr = await assertTargetInOrg(db, organizationId, d.allocationScope, villaId, projectId);
  if (targetErr) return { ok: false, error: targetErr };
  const me = await getCurrentAppUser();
  const [row] = await db
    .insert(staff)
    .values({
      organizationId,
      fullName: d.fullName,
      roleLabel: d.roleLabel,
      monthlyRateMinor: d.monthlyRateMinor,
      currency: d.currency,
      allocationScope: d.allocationScope,
      // Only keep the target relevant to the chosen scope.
      villaId: d.allocationScope === "villa" ? villaId : null,
      projectId: d.allocationScope === "project_pool" ? projectId : null,
      notes: nullable(d.notes),
      createdBy: me?.id ?? null,
    })
    .returning({ id: staff.id });
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "payroll.staff.create",
    entityType: "staff",
    entityId: row.id,
    after: { ...d, monthlyRateMinor: d.monthlyRateMinor.toString() },
  });
  revalidatePath("/dashboard/payroll");
  redirect("/dashboard/payroll");
}

export async function updateStaffAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await ensurePayrollWrite();
  const parsed = updateStaffSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: "Please review the form.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const organizationId = await requireOrgId();
  const d = parsed.data;
  // Org-scoped existence check kills the cross-tenant IDOR.
  const [before] = await db
    .select()
    .from(staff)
    .where(and(eq(staff.id, d.id), eq(staff.organizationId, organizationId)))
    .limit(1);
  if (!before) return { ok: false, error: "Staff member not found." };
  const villaId = nullable(d.villaId);
  const projectId = nullable(d.projectId);
  const targetErr = await assertTargetInOrg(db, organizationId, d.allocationScope, villaId, projectId);
  if (targetErr) return { ok: false, error: targetErr };
  const me = await getCurrentAppUser();
  await db
    .update(staff)
    .set({
      fullName: d.fullName,
      roleLabel: d.roleLabel,
      monthlyRateMinor: d.monthlyRateMinor,
      currency: d.currency,
      allocationScope: d.allocationScope,
      villaId: d.allocationScope === "villa" ? villaId : null,
      projectId: d.allocationScope === "project_pool" ? projectId : null,
      active: d.active,
      notes: nullable(d.notes),
      updatedAt: new Date(),
    })
    .where(and(eq(staff.id, d.id), eq(staff.organizationId, organizationId)));
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "payroll.staff.update",
    entityType: "staff",
    entityId: d.id,
    before: { ...before, monthlyRateMinor: before.monthlyRateMinor.toString() },
    after: { ...d, monthlyRateMinor: d.monthlyRateMinor.toString() },
  });
  revalidatePath("/dashboard/payroll");
  redirect("/dashboard/payroll");
}

export async function setStaffActiveAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await ensurePayrollWrite();
  const parsed = setStaffActiveSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();
  const [before] = await db
    .select({ active: staff.active })
    .from(staff)
    .where(and(eq(staff.id, parsed.data.id), eq(staff.organizationId, organizationId)))
    .limit(1);
  if (!before) return { ok: false, error: "Staff member not found." };
  await db
    .update(staff)
    .set({ active: parsed.data.active, updatedAt: new Date() })
    .where(and(eq(staff.id, parsed.data.id), eq(staff.organizationId, organizationId)));
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: parsed.data.active ? "payroll.staff.activate" : "payroll.staff.deactivate",
    entityType: "staff",
    entityId: parsed.data.id,
    before: { active: before.active },
    after: { active: parsed.data.active },
  });
  revalidatePath("/dashboard/payroll");
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Run payroll for a month — posts one expense line per active staff member
// through the SAME pipeline finance uses, so the cost flows into owner
// statements / project costs exactly like a manual expense. Idempotent per
// (org, month): a second run is a no-op (the unique index + pre-check).
// -----------------------------------------------------------------------------
export async function runPayrollAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await ensurePayrollWrite();
  const parsed = runPayrollSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Pick a valid month." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();

  // Normalise to the first day of the month, derive a label + expense date.
  const periodMonth = parsed.data.periodMonth.slice(0, 7) + "-01";
  const monthDate = new Date(periodMonth + "T00:00:00Z");
  const label = monthDate.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  // Post the cost on the last day of the month so it lands inside that
  // statement period (period-lock is checked below).
  const expenseDate = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0))
    .toISOString()
    .slice(0, 10);

  // Idempotency: refuse if this org already ran payroll for the month.
  const [existing] = await db
    .select({ id: payrollRuns.id })
    .from(payrollRuns)
    .where(and(eq(payrollRuns.organizationId, organizationId), eq(payrollRuns.periodMonth, periodMonth)))
    .limit(1);
  if (existing) {
    return { ok: false, error: `Payroll for ${label} has already been posted.` };
  }

  // Refuse if the target period is closed/locked (same guard manual expenses use).
  const lock = await findLockingPeriod(db, expenseDate);
  if (lock) {
    return { ok: false, error: `Period "${lock.label}" is ${lock.status}. Cannot post payroll into it.` };
  }

  const activeStaff = await db
    .select()
    .from(staff)
    .where(and(eq(staff.organizationId, organizationId), eq(staff.active, true)));
  if (activeStaff.length === 0) {
    return { ok: false, error: "No active staff to pay. Add staff with a monthly rate first." };
  }

  // Insert the run first (its unique index is the hard idempotency line), then
  // post the expense lines pointing back at it. Done atomically.
  let runId = "";
  let totalMinor = 0n;
  let expenseCount = 0;
  const runCurrency = activeStaff[0].currency;
  try {
    await db.transaction(async (tx) => {
      const [run] = await tx
        .insert(payrollRuns)
        .values({
          organizationId,
          periodMonth,
          label,
          currency: runCurrency,
          status: "posted",
          postedBy: me?.id ?? null,
        })
        .returning({ id: payrollRuns.id });
      runId = run.id;

      for (const member of activeStaff) {
        // Map the staff allocation scope to the expense_lines scope/target.
        // company-scope → 'company' (owner-absorbed, not owner-chargeable).
        const isCompany = member.allocationScope === "company";
        const allocationScope =
          member.allocationScope === "villa"
            ? "villa"
            : member.allocationScope === "project_pool"
              ? "project_pool"
              : "company";
        await tx.insert(expenseLines).values({
          villaId: member.allocationScope === "villa" ? member.villaId : null,
          projectId: member.allocationScope === "project_pool" ? member.projectId : null,
          bookingId: null,
          expenseType: "staff_allocation",
          description: `Payroll · ${member.fullName} · ${member.roleLabel} · ${label}`,
          amountMinor: member.monthlyRateMinor,
          currency: member.currency,
          expenseDate,
          allocationScope,
          capitalized: false,
          // Company-absorbed staff are not charged to owners; villa/project
          // staff are, so they flow into the relevant owner statements.
          ownerChargeable: !isCompany,
          status: "posted",
          payrollRunId: run.id,
          staffId: member.id,
          createdBy: me?.id ?? null,
        });
        totalMinor += member.monthlyRateMinor;
        expenseCount += 1;
      }

      await tx
        .update(payrollRuns)
        .set({ totalMinor, staffCount: activeStaff.length, expenseCount })
        .where(and(eq(payrollRuns.id, run.id), eq(payrollRuns.organizationId, organizationId)));

      await recordAuditEvent(
        {
          actorUserId: me?.id ?? null,
          action: "payroll.run.post",
          entityType: "payroll_run",
          entityId: run.id,
          after: {
            periodMonth,
            label,
            staffCount: activeStaff.length,
            expenseCount,
            totalMinor: totalMinor.toString(),
            currency: runCurrency,
          },
        },
        { tx },
      );
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Payroll run failed.";
    // The unique index can still race two clicks — surface it cleanly.
    return {
      ok: false,
      error: msg.includes("payroll_runs_org_period_unique")
        ? `Payroll for ${label} has already been posted.`
        : msg,
    };
  }

  void runId;
  revalidatePath("/dashboard/payroll");
  revalidatePath("/dashboard/finance");
  revalidatePath("/dashboard/finance/expenses");
  return { ok: true, redirectTo: "/dashboard/payroll" };
}
