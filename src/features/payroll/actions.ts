"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  staff,
  staffAssignments,
  payrollRuns,
  orgPayrollSettings,
  payrollPayslips,
} from "@/lib/db/schema/payroll";
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
  orgPayrollSettingsSchema,
} from "./schema";
import { getOrgPayrollSettings, toStatutorySettings } from "./services";
import { computeStatutory, computeProration, prorateMinor } from "./statutory";
import type { PtkpStatus } from "@/lib/db/schema/payroll";
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

/** A single multi-target assignment row resolved + validated against the org. */
interface ResolvedAssignment {
  villaId: string | null;
  projectId: string | null;
  weight: number;
}

/**
 * Validate every submitted assignment target belongs to the caller's org
 * (cross-org villa/project = rejected, closing the IDOR). Returns the resolved
 * rows or an error message string. Each row targets exactly one villa OR one
 * project (already enforced by the zod refine).
 */
async function resolveAssignments(
  db: NonNullable<ReturnType<typeof getDb>>,
  organizationId: string,
  raw: { villaId?: string | null; projectId?: string | null; weight: number }[],
): Promise<{ rows: ResolvedAssignment[] } | { error: string }> {
  const rows: ResolvedAssignment[] = [];
  for (const a of raw) {
    const villaId = a.villaId ?? null;
    const projectId = a.projectId ?? null;
    if (villaId) {
      const [row] = await db
        .select({ orgId: projects.organizationId })
        .from(villas)
        .innerJoin(projects, eq(projects.id, villas.projectId))
        .where(eq(villas.id, villaId))
        .limit(1);
      if (!row || row.orgId !== organizationId) return { error: "An assigned villa was not found." };
    } else if (projectId) {
      const [row] = await db
        .select({ orgId: projects.organizationId })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      if (!row || row.orgId !== organizationId) return { error: "An assigned project was not found." };
    } else {
      return { error: "An assignment is missing its target." };
    }
    rows.push({ villaId, projectId, weight: a.weight });
  }
  return { rows };
}

/**
 * Replace a staff member's active assignments with the submitted set, inside a
 * transaction. Deactivates existing rows (org-scoped) and inserts the new ones.
 * We soft-deactivate rather than hard-delete so already-posted history that
 * references nothing here stays clean; the unique-per-target semantics are not
 * required by the run logic. Every write ANDs organization_id.
 */
async function replaceAssignments(
  tx: NonNullable<ReturnType<typeof getDb>>,
  organizationId: string,
  staffId: string,
  resolved: ResolvedAssignment[],
): Promise<void> {
  await tx
    .delete(staffAssignments)
    .where(
      and(
        eq(staffAssignments.staffId, staffId),
        eq(staffAssignments.organizationId, organizationId),
      ),
    );
  if (resolved.length === 0) return;
  await tx.insert(staffAssignments).values(
    resolved.map((a) => ({
      organizationId,
      staffId,
      villaId: a.villaId,
      projectId: a.projectId,
      weight: a.weight.toString(),
      active: true,
    })),
  );
}

/** Money guard: the rate required by the chosen comp_mode must be > 0. */
function rateError(d: {
  compMode: string;
  monthlyRateMinor: bigint;
  perVillaRateMinor?: bigint;
}): string | null {
  if (d.compMode === "salaried" && d.monthlyRateMinor <= 0n) {
    return "Enter a monthly rate for salaried staff.";
  }
  if (d.compMode === "per_villa_fixed" && (!d.perVillaRateMinor || d.perVillaRateMinor <= 0n)) {
    return "Enter a per-villa rate for per-villa-fixed staff.";
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
  const rateErr = rateError(d);
  if (rateErr) return { ok: false, error: rateErr };
  const villaId = nullable(d.villaId);
  const projectId = nullable(d.projectId);
  // Fallback single-target only matters when there are no multi-target rows.
  if (d.assignments.length === 0) {
    const targetErr = await assertTargetInOrg(db, organizationId, d.allocationScope, villaId, projectId);
    if (targetErr) return { ok: false, error: targetErr };
  }
  const resolved = await resolveAssignments(db, organizationId, d.assignments);
  if ("error" in resolved) return { ok: false, error: resolved.error };
  const me = await getCurrentAppUser();
  let newId = "";
  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(staff)
      .values({
        organizationId,
        fullName: d.fullName,
        roleLabel: d.roleLabel,
        compMode: d.compMode,
        costBearer: d.costBearer,
        monthlyRateMinor: d.monthlyRateMinor,
        perVillaRateMinor: d.compMode === "per_villa_fixed" ? d.perVillaRateMinor ?? null : null,
        currency: d.currency,
        allocationScope: d.allocationScope,
        // Only keep the fallback target relevant to the chosen scope.
        villaId: d.allocationScope === "villa" ? villaId : null,
        projectId: d.allocationScope === "project_pool" ? projectId : null,
        // Effective-dating + statutory opt-in (migration 0172).
        hiredOn: d.hiredOn ?? null,
        endedOn: d.endedOn ?? null,
        rateEffectiveFrom: d.rateEffectiveFrom ?? null,
        // Statutory only makes sense for salaried; force off otherwise.
        statutoryEnabled: d.compMode === "salaried" ? d.statutoryEnabled : false,
        ptkpStatus: d.ptkpStatus ?? null,
        noNpwp: d.noNpwp,
        notes: nullable(d.notes),
        createdBy: me?.id ?? null,
      })
      .returning({ id: staff.id });
    newId = row.id;
    await replaceAssignments(tx, organizationId, row.id, resolved.rows);
    await recordAuditEvent(
      {
        actorUserId: me?.id ?? null,
        action: "payroll.staff.create",
        entityType: "staff",
        entityId: row.id,
        after: {
          ...d,
          monthlyRateMinor: d.monthlyRateMinor.toString(),
          perVillaRateMinor: d.perVillaRateMinor?.toString() ?? null,
          assignmentCount: resolved.rows.length,
        },
      },
      { tx },
    );
  });
  void newId;
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
  const rateErr = rateError(d);
  if (rateErr) return { ok: false, error: rateErr };
  const villaId = nullable(d.villaId);
  const projectId = nullable(d.projectId);
  if (d.assignments.length === 0) {
    const targetErr = await assertTargetInOrg(db, organizationId, d.allocationScope, villaId, projectId);
    if (targetErr) return { ok: false, error: targetErr };
  }
  const resolved = await resolveAssignments(db, organizationId, d.assignments);
  if ("error" in resolved) return { ok: false, error: resolved.error };
  const me = await getCurrentAppUser();
  await db.transaction(async (tx) => {
    await tx
      .update(staff)
      .set({
        fullName: d.fullName,
        roleLabel: d.roleLabel,
        compMode: d.compMode,
        costBearer: d.costBearer,
        monthlyRateMinor: d.monthlyRateMinor,
        perVillaRateMinor: d.compMode === "per_villa_fixed" ? d.perVillaRateMinor ?? null : null,
        currency: d.currency,
        allocationScope: d.allocationScope,
        villaId: d.allocationScope === "villa" ? villaId : null,
        projectId: d.allocationScope === "project_pool" ? projectId : null,
        hiredOn: d.hiredOn ?? null,
        endedOn: d.endedOn ?? null,
        rateEffectiveFrom: d.rateEffectiveFrom ?? null,
        statutoryEnabled: d.compMode === "salaried" ? d.statutoryEnabled : false,
        ptkpStatus: d.ptkpStatus ?? null,
        noNpwp: d.noNpwp,
        active: d.active,
        notes: nullable(d.notes),
        updatedAt: new Date(),
      })
      .where(and(eq(staff.id, d.id), eq(staff.organizationId, organizationId)));
    await replaceAssignments(tx, organizationId, d.id, resolved.rows);
    await recordAuditEvent(
      {
        actorUserId: me?.id ?? null,
        action: "payroll.staff.update",
        entityType: "staff",
        entityId: d.id,
        before: {
          ...before,
          monthlyRateMinor: before.monthlyRateMinor.toString(),
          perVillaRateMinor: before.perVillaRateMinor?.toString() ?? null,
        },
        after: {
          ...d,
          monthlyRateMinor: d.monthlyRateMinor.toString(),
          perVillaRateMinor: d.perVillaRateMinor?.toString() ?? null,
          assignmentCount: resolved.rows.length,
        },
      },
      { tx },
    );
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

  // Active assignments for this org (one query), grouped by staff. Used to fan
  // out per_villa_fixed staff and to find the single target for salaried staff.
  const assignmentRows = await db
    .select({
      staffId: staffAssignments.staffId,
      villaId: staffAssignments.villaId,
      projectId: staffAssignments.projectId,
      weight: staffAssignments.weight,
    })
    .from(staffAssignments)
    .where(
      and(
        eq(staffAssignments.organizationId, organizationId),
        eq(staffAssignments.active, true),
      ),
    );
  const assignmentsByStaff = new Map<
    string,
    { villaId: string | null; projectId: string | null; weight: number }[]
  >();
  for (const a of assignmentRows) {
    const list = assignmentsByStaff.get(a.staffId) ?? [];
    list.push({ villaId: a.villaId, projectId: a.projectId, weight: Number(a.weight ?? "1") });
    assignmentsByStaff.set(a.staffId, list);
  }

  // Org statutory settings (BPJS/PPh21). When the org has never configured them
  // OR the master switch is off, this resolves to the researched defaults with
  // statutoryEnabled=false, so NOTHING statutory is computed — existing payroll
  // behaviour is byte-for-byte unchanged.
  const statutorySettings = toStatutorySettings(await getOrgPayrollSettings());

  // Build the expense-line specs deterministically per comp_mode BEFORE the
  // write, so we know up front whether there is anything to post.
  interface LineSpec {
    villaId: string | null;
    projectId: string | null;
    allocationScope: string;
    amountMinor: bigint;
    currency: string;
    description: string;
    costBearer: string;
    ownerChargeable: boolean;
    staffId: string;
  }
  // One payslip row per statutory-computed salaried staff member — the payslip
  // view source. amountMinor on the matching LineSpec === totalEmployerCostMinor.
  interface PayslipSpec {
    staffId: string;
    currency: string;
    grossMinor: bigint;
    prorationNumerator: number;
    prorationDenominator: number;
    employerJhtMinor: bigint;
    employerJkkMinor: bigint;
    employerJkmMinor: bigint;
    employerJpMinor: bigint;
    employerKesehatanMinor: bigint;
    employerContribMinor: bigint;
    employeeJhtMinor: bigint;
    employeeJpMinor: bigint;
    employeeKesehatanMinor: bigint;
    employeeBpjsMinor: bigint;
    pph21Minor: bigint;
    terCategory: string | null;
    netTakeHomeMinor: bigint;
    totalEmployerCostMinor: bigint;
  }
  const specs: LineSpec[] = [];
  const payslipSpecs: PayslipSpec[] = [];
  let paidStaffCount = 0;

  for (const member of activeStaff) {
    const bearer = member.costBearer; // owner | management | shared_pool
    // Phase-2 contract: owner & shared_pool reach the owner statement; only
    // management is absorbed by the company P&L and never reduces payout.
    const ownerChargeable = bearer === "owner" || bearer === "shared_pool";
    const assignments = assignmentsByStaff.get(member.id) ?? [];

    if (member.compMode === "per_service") {
      // Ad-hoc — posted via charges/expenses, never in the monthly run.
      continue;
    }

    // Effective-dating proration: active days in [hired, ended] ∩ this month.
    // A member not active at all in the month posts nothing.
    const proration = computeProration(periodMonth, member.hiredOn, member.endedOn);
    if (!proration.active) continue;

    if (member.compMode === "per_villa_fixed") {
      const rate = member.perVillaRateMinor ?? 0n;
      if (rate <= 0n || assignments.length === 0) continue; // nothing to fan out
      let postedAny = false;
      for (const a of assignments) {
        // ONE line per active assignment, attributed to that target. weight is
        // a numeric multiplier; round the product to whole minor units, then
        // prorate by active days. (Statutory is salaried-only — not applied here.)
        const full = BigInt(Math.round(Number(rate) * a.weight));
        const amount = prorateMinor(full, proration);
        if (amount <= 0n) continue;
        const scope = a.villaId ? "villa" : a.projectId ? "project_pool" : "company";
        specs.push({
          villaId: a.villaId,
          projectId: a.projectId,
          allocationScope: scope,
          amountMinor: amount,
          currency: member.currency,
          description: `Payroll · ${member.fullName} · ${member.roleLabel} · ${label}`,
          costBearer: bearer,
          ownerChargeable,
          staffId: member.id,
        });
        postedAny = true;
      }
      if (postedAny) paidStaffCount += 1;
      continue;
    }

    // salaried → ONE line of monthly_rate to its single target: prefer the
    // first active assignment, else the fallback allocation_scope/target.
    if (member.monthlyRateMinor <= 0n) continue;

    // Prorated gross actually earned this month.
    const grossMinor = prorateMinor(member.monthlyRateMinor, proration);
    if (grossMinor <= 0n) continue;

    // Statutory (only when org-enabled AND this staff opts in). The COST BORNE
    // by the owner/management becomes gross + employer BPJS; employee BPJS +
    // PPh21 are withheld from gross (NOT extra cost). When statutory is off the
    // posted amount stays the prorated gross — existing behaviour.
    const statutory = computeStatutory(
      grossMinor,
      member.ptkpStatus as PtkpStatus | null,
      statutorySettings,
      { noNpwp: member.noNpwp },
    );
    const statutoryOn = member.statutoryEnabled && statutorySettings.statutoryEnabled;
    const postedAmount = statutoryOn ? statutory.totalEmployerCostMinor : grossMinor;

    let villaId: string | null = null;
    let projectId: string | null = null;
    let scope: string;
    const first = assignments[0];
    if (first && (first.villaId || first.projectId)) {
      villaId = first.villaId;
      projectId = first.projectId;
      scope = first.villaId ? "villa" : "project_pool";
    } else {
      scope =
        member.allocationScope === "villa"
          ? "villa"
          : member.allocationScope === "project_pool"
            ? "project_pool"
            : "company";
      villaId = member.allocationScope === "villa" ? member.villaId : null;
      projectId = member.allocationScope === "project_pool" ? member.projectId : null;
    }
    specs.push({
      villaId,
      projectId,
      allocationScope: scope,
      amountMinor: postedAmount,
      currency: member.currency,
      description: `Payroll · ${member.fullName} · ${member.roleLabel} · ${label}`,
      costBearer: bearer,
      ownerChargeable,
      staffId: member.id,
    });
    if (statutoryOn) {
      payslipSpecs.push({
        staffId: member.id,
        currency: member.currency,
        grossMinor,
        prorationNumerator: proration.numerator,
        prorationDenominator: proration.denominator,
        employerJhtMinor: statutory.employer.jhtMinor,
        employerJkkMinor: statutory.employer.jkkMinor,
        employerJkmMinor: statutory.employer.jkmMinor,
        employerJpMinor: statutory.employer.jpMinor,
        employerKesehatanMinor: statutory.employer.kesehatanMinor,
        employerContribMinor: statutory.employerContribMinor,
        employeeJhtMinor: statutory.employee.jhtMinor,
        employeeJpMinor: statutory.employee.jpMinor,
        employeeKesehatanMinor: statutory.employee.kesehatanMinor,
        employeeBpjsMinor: statutory.employeeBpjsMinor,
        pph21Minor: statutory.pph21Minor,
        terCategory: statutory.terCategory,
        netTakeHomeMinor: statutory.netTakeHomeMinor,
        totalEmployerCostMinor: statutory.totalEmployerCostMinor,
      });
    }
    paidStaffCount += 1;
  }

  if (specs.length === 0) {
    return {
      ok: false,
      error:
        "Nothing to post for this month. Active staff are all per-service, or per-villa-fixed staff have no assignments / no rate.",
    };
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

      for (const spec of specs) {
        await tx.insert(expenseLines).values({
          villaId: spec.villaId,
          projectId: spec.projectId,
          bookingId: null,
          expenseType: "staff_allocation",
          description: spec.description,
          amountMinor: spec.amountMinor,
          currency: spec.currency,
          expenseDate,
          allocationScope: spec.allocationScope,
          capitalized: false,
          // cost_bearer (the phase-2 contract column) is stamped from the staff
          // member; owner_chargeable is derived from it (owner|shared_pool).
          costBearer: spec.costBearer,
          ownerChargeable: spec.ownerChargeable,
          status: "posted",
          payrollRunId: run.id,
          staffId: spec.staffId,
          createdBy: me?.id ?? null,
        });
        totalMinor += spec.amountMinor;
        expenseCount += 1;
      }

      // Statutory payslips (transparency only — they do NOT add money). One row
      // per statutory-computed staff member; org-scoped insert.
      for (const ps of payslipSpecs) {
        await tx.insert(payrollPayslips).values({
          organizationId,
          payrollRunId: run.id,
          staffId: ps.staffId,
          currency: ps.currency,
          grossMinor: ps.grossMinor,
          prorationNumerator: ps.prorationNumerator,
          prorationDenominator: ps.prorationDenominator,
          employerJhtMinor: ps.employerJhtMinor,
          employerJkkMinor: ps.employerJkkMinor,
          employerJkmMinor: ps.employerJkmMinor,
          employerJpMinor: ps.employerJpMinor,
          employerKesehatanMinor: ps.employerKesehatanMinor,
          employerContribMinor: ps.employerContribMinor,
          employeeJhtMinor: ps.employeeJhtMinor,
          employeeJpMinor: ps.employeeJpMinor,
          employeeKesehatanMinor: ps.employeeKesehatanMinor,
          employeeBpjsMinor: ps.employeeBpjsMinor,
          pph21Minor: ps.pph21Minor,
          terCategory: ps.terCategory,
          netTakeHomeMinor: ps.netTakeHomeMinor,
          totalEmployerCostMinor: ps.totalEmployerCostMinor,
        });
      }

      await tx
        .update(payrollRuns)
        .set({ totalMinor, staffCount: paidStaffCount, expenseCount })
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
            staffCount: paidStaffCount,
            expenseCount,
            payslipCount: payslipSpecs.length,
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

// -----------------------------------------------------------------------------
// Org BPJS / PPh21 settings — editable defaults (one row per org, upserted).
// Gated by finance.write (same money permission); org-scoped; audited.
// -----------------------------------------------------------------------------
export async function updateOrgPayrollSettingsAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await ensurePayrollWrite();
  const parsed = orgPayrollSettingsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the statutory settings.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const organizationId = await requireOrgId();
  const me = await getCurrentAppUser();
  const d = parsed.data;

  // numeric columns take strings in drizzle-orm; bigint columns take bigint.
  const values = {
    statutoryEnabled: d.statutoryEnabled,
    jhtEmployerPct: String(d.jhtEmployerPct),
    jhtEmployeePct: String(d.jhtEmployeePct),
    jkkEmployerPct: String(d.jkkEmployerPct),
    jkmEmployerPct: String(d.jkmEmployerPct),
    jpEmployerPct: String(d.jpEmployerPct),
    jpEmployeePct: String(d.jpEmployeePct),
    jpCapMinor: d.jpCapMinor,
    kesehatanEmployerPct: String(d.kesehatanEmployerPct),
    kesehatanEmployeePct: String(d.kesehatanEmployeePct),
    kesehatanCapMinor: d.kesehatanCapMinor,
    pph21Enabled: d.pph21Enabled,
    noNpwpSurchargePct: String(d.noNpwpSurchargePct),
    currency: d.currency,
    updatedBy: me?.id ?? null,
  };

  await db
    .insert(orgPayrollSettings)
    .values({ organizationId, ...values })
    .onConflictDoUpdate({
      target: orgPayrollSettings.organizationId,
      set: { ...values, updatedAt: new Date() },
    });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "payroll.settings.update",
    entityType: "org_payroll_settings",
    entityId: organizationId,
    after: { ...values, jpCapMinor: d.jpCapMinor.toString(), kesehatanCapMinor: d.kesehatanCapMinor.toString() },
  });

  revalidatePath("/dashboard/payroll");
  revalidatePath("/dashboard/payroll/settings");
  return { ok: true };
}
