import "server-only";

import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  bookingAutomationRules,
  bookingAutomationRuns,
} from "@/lib/db/schema/integrations";
import { bookings } from "@/lib/db/schema/bookings";
import { villas } from "@/lib/db/schema/projects";
import { requireOrgId } from "@/features/auth/require-org";
import {
  checklistTemplateItems,
  checklistTemplates,
  operationTaskTypes,
  operationTasks,
  taskChecklistItems,
  taskChecklists,
} from "@/lib/db/schema/operations";
import { recordAuditEvent } from "@/features/audit/services";
import { buildTaskCode } from "@/features/operations/codes";
import { templateItemRequiresPhoto } from "@/features/operations/checklists";
import { nextDailyCounter } from "@/features/operations/services";
import { DEFAULT_RULES } from "./schema";
import type { WithSource } from "@/features/types";

export interface AutomationRuleRow {
  id: string;
  ruleName: string;
  triggerEvent: string;
  taskCategory: string;
  taskTypeKey: string | null;
  checklistTemplateKey: string | null;
  titleTemplate: string;
  dueOffsetMinutes: number;
  priority: string;
  status: string;
  villaCode: string | null;
  projectId: string | null;
  createdAt: string;
}

export interface AutomationRunRow {
  id: string;
  bookingId: string;
  bookingCode: string | null;
  ruleId: string | null;
  ruleName: string | null;
  taskId: string | null;
  taskCode: string | null;
  runStatus: string;
  reason: string | null;
  createdAt: string;
}

export async function listBookingAutomationRules(): Promise<WithSource<AutomationRuleRow>[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const rows = await db
    .select({
      r: bookingAutomationRules,
      villaCode: villas.unitCode,
    })
    .from(bookingAutomationRules)
    .leftJoin(villas, eq(villas.id, bookingAutomationRules.villaId))
    // TENANCY: caller's own rules + shared NULL-org default rows. The runtime
    // writers (createBookingAutomationRuleAction, the default seeder) all stamp
    // org, BUT drizzle/seed.sql still INSERTs the two fixed-UUID default rules
    // with NO organization_id column → NULL-org rows are legitimately written
    // on every seed run. Tightening to eq(org) would hide those shared default
    // rules from all tenants on a freshly seeded DB, so the isNull tolerance is
    // intentional here. NULL-org default rules are read-only catalog rows.
    .where(
      or(
        eq(bookingAutomationRules.organizationId, organizationId),
        isNull(bookingAutomationRules.organizationId),
      ),
    )
    .orderBy(asc(bookingAutomationRules.ruleName));
  return rows.map((r) => ({
    source: "db" as const,
    id: r.r.id,
    ruleName: r.r.ruleName,
    triggerEvent: r.r.triggerEvent,
    taskCategory: r.r.taskCategory,
    taskTypeKey: r.r.taskTypeKey,
    checklistTemplateKey: r.r.checklistTemplateKey,
    titleTemplate: r.r.titleTemplate,
    dueOffsetMinutes: r.r.dueOffsetMinutes,
    priority: r.r.priority,
    status: r.r.status,
    villaCode: r.villaCode ?? null,
    projectId: r.r.projectId,
    createdAt: r.r.createdAt.toISOString(),
  }));
}

export async function listBookingAutomationRuns(opts?: {
  bookingId?: string;
}): Promise<WithSource<AutomationRunRow>[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  // TENANCY: scope strictly to the caller's org. Every writer of
  // booking_automation_runs stamps `booking.organizationId` (NOT NULL) on
  // insert (see runBookingAutomationForBooking) and there is no seed/cron
  // path that writes NULL-org run rows, so the prior `isNull` tolerance only
  // leaked legacy pre-0154 rows (already backfilled) to every tenant.
  const orgFilter = eq(bookingAutomationRuns.organizationId, organizationId);
  const rows = await db
    .select({
      run: bookingAutomationRuns,
      ruleName: bookingAutomationRules.ruleName,
      bookingCode: bookings.bookingCode,
      taskCode: operationTasks.taskCode,
    })
    .from(bookingAutomationRuns)
    .leftJoin(
      bookingAutomationRules,
      eq(bookingAutomationRules.id, bookingAutomationRuns.ruleId),
    )
    .leftJoin(bookings, eq(bookings.id, bookingAutomationRuns.bookingId))
    .leftJoin(operationTasks, eq(operationTasks.id, bookingAutomationRuns.taskId))
    .where(
      opts?.bookingId
        ? and(eq(bookingAutomationRuns.bookingId, opts.bookingId), orgFilter)
        : orgFilter,
    )
    .orderBy(desc(bookingAutomationRuns.createdAt))
    .limit(200);
  return rows.map((r) => ({
    source: "db" as const,
    id: r.run.id,
    bookingId: r.run.bookingId,
    bookingCode: r.bookingCode ?? null,
    ruleId: r.run.ruleId,
    ruleName: r.ruleName ?? null,
    taskId: r.run.taskId,
    taskCode: r.taskCode ?? null,
    runStatus: r.run.runStatus,
    reason: r.run.reason,
    createdAt: r.run.createdAt.toISOString(),
  }));
}

// Title interpolation lives in a pure module so tests can import it without
// dragging in this `server-only` file. Re-export for callers.
import { applyTitleTemplate, type TitleContext } from "./title";
export { applyTitleTemplate };
export type { TitleContext };

// -----------------------------------------------------------------------------
// Default rule seeder — idempotent.
// -----------------------------------------------------------------------------

export async function createDefaultBookingAutomationRulesIfMissing(
  organizationId?: string,
): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const orgId = organizationId ?? (await requireOrgId());
  // TENANCY: count only the caller's own rules (+ NULL-org legacy rows) so a
  // fresh tenant still seeds its defaults once another org has seeded.
  const [existing] = await db
    .select({ count: sql<number>`count(*)` })
    .from(bookingAutomationRules)
    .where(
      or(
        eq(bookingAutomationRules.organizationId, orgId),
        isNull(bookingAutomationRules.organizationId),
      ),
    );
  if (Number(existing?.count ?? 0) > 0) return 0;
  await db.insert(bookingAutomationRules).values(
    DEFAULT_RULES.map((r) => ({
      organizationId: orgId,
      ruleName: r.ruleName,
      triggerEvent: r.triggerEvent,
      taskCategory: r.taskCategory,
      taskTypeKey: r.taskTypeKey,
      checklistTemplateKey: r.checklistTemplateKey,
      titleTemplate: r.titleTemplate,
      dueOffsetMinutes: r.dueOffsetMinutes,
      priority: r.priority,
    })),
  );
  return DEFAULT_RULES.length;
}

// -----------------------------------------------------------------------------
// Run automation for a booking
// -----------------------------------------------------------------------------

export interface AutomationRunResult {
  ruleId: string;
  status: "created" | "skipped" | "failed";
  taskId?: string;
  reason?: string;
}

/**
 * Apply every active rule that fires on `booking_created` to the given
 * booking. Idempotent: each (booking, rule) pair has at most one row in
 * `booking_automation_runs`, enforced by a partial unique index.
 *
 * Skips rules whose villa/project filter doesn't match the booking, and
 * rules whose checklist_template_key resolves to a missing template.
 */
export async function runBookingAutomationForBooking(
  bookingId: string,
): Promise<AutomationRunResult[]> {
  const db = getDb();
  if (!db) return [];

  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!booking) return [];

  const [villa] = await db
    .select()
    .from(villas)
    .where(eq(villas.id, booking.villaId))
    .limit(1);

  // TENANCY: only evaluate the booking's own org rules (+ NULL-org legacy/
  // seed rules from migration 0154). Without this, every tenant's active
  // rules fired against this booking.
  const rules = await db
    .select()
    .from(bookingAutomationRules)
    .where(
      and(
        eq(bookingAutomationRules.status, "active"),
        eq(bookingAutomationRules.triggerEvent, "booking_created"),
        or(
          eq(bookingAutomationRules.organizationId, booking.organizationId),
          isNull(bookingAutomationRules.organizationId),
        ),
      ),
    );

  const results: AutomationRunResult[] = [];

  for (const rule of rules) {
    // Villa / project scoping.
    if (rule.villaId && rule.villaId !== booking.villaId) continue;
    if (rule.projectId && villa && rule.projectId !== villa.projectId) continue;

    // Idempotency: skip if a row already exists for this (booking, rule).
    const [existingRun] = await db
      .select()
      .from(bookingAutomationRuns)
      .where(
        and(
          eq(bookingAutomationRuns.bookingId, bookingId),
          eq(bookingAutomationRuns.ruleId, rule.id),
        ),
      )
      .limit(1);
    if (existingRun) {
      results.push({
        ruleId: rule.id,
        status: existingRun.runStatus as "created" | "skipped" | "failed",
        taskId: existingRun.taskId ?? undefined,
        reason: existingRun.reason ?? "already executed",
      });
      continue;
    }

    try {
      const result = await materialiseRule(rule, booking, villa?.unitCode ?? null);
      results.push(result);

      await db.insert(bookingAutomationRuns).values({
        // TENANCY: run row inherits the booking's org (migration 0154).
        organizationId: booking.organizationId,
        bookingId,
        ruleId: rule.id,
        taskId: result.taskId ?? null,
        runStatus: result.status,
        reason: result.reason ?? null,
      });

      await recordAuditEvent({
        actorUserId: null,
        action: `automation.${result.status}`,
        entityType: "booking_automation_run",
        entityId: result.taskId ?? rule.id,
        after: {
          bookingId,
          ruleId: rule.id,
          ruleName: rule.ruleName,
          taskId: result.taskId ?? null,
          reason: result.reason ?? null,
        },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "automation failure";
      await db.insert(bookingAutomationRuns).values({
        // TENANCY: run row inherits the booking's org (migration 0154).
        organizationId: booking.organizationId,
        bookingId,
        ruleId: rule.id,
        runStatus: "failed",
        reason: message.slice(0, 500),
      });
      results.push({ ruleId: rule.id, status: "failed", reason: message });
    }
  }

  return results;
}

async function materialiseRule(
  rule: typeof bookingAutomationRules.$inferSelect,
  booking: typeof bookings.$inferSelect,
  villaCode: string | null,
): Promise<AutomationRunResult> {
  const db = getDb();
  if (!db) return { ruleId: rule.id, status: "failed", reason: "DB unavailable" };

  // Resolve the optional task type / checklist template by key.
  let taskTypeId: string | null = null;
  if (rule.taskTypeKey) {
    const [tt] = await db
      .select({ id: operationTaskTypes.id })
      .from(operationTaskTypes)
      .where(eq(operationTaskTypes.key, rule.taskTypeKey))
      .limit(1);
    taskTypeId = tt?.id ?? null;
  }

  let templateId: string | null = null;
  if (rule.checklistTemplateKey) {
    const [tpl] = await db
      .select({ id: checklistTemplates.id })
      .from(checklistTemplates)
      .where(eq(checklistTemplates.key, rule.checklistTemplateKey))
      .limit(1);
    templateId = tpl?.id ?? null;
  }

  // Avoid duplicate "obvious" tasks on retried runs by checking
  // (villa, scheduled_for, task_type_id) — covers the case where a rule
  // ran once before the join was made.
  if (taskTypeId) {
    const [dupTask] = await db
      .select({ id: operationTasks.id })
      .from(operationTasks)
      .where(
        and(
          eq(operationTasks.villaId, booking.villaId),
          eq(operationTasks.taskTypeId, taskTypeId),
          eq(operationTasks.scheduledFor, booking.checkOut),
        ),
      )
      .limit(1);
    if (dupTask) {
      return {
        ruleId: rule.id,
        status: "skipped",
        taskId: dupTask.id,
        reason: "matching task already exists",
      };
    }
  }

  const title = applyTitleTemplate(rule.titleTemplate, {
    villa: villaCode,
    checkout_date: booking.checkOut,
    checkin_date: booking.checkIn,
    booking_code: booking.bookingCode,
  });

  // Compute due_at: arrival inspection → checkin - X minutes; everything
  // else → checkout + X minutes. Anchor follows trigger semantics; for v6
  // we pin off taskCategory because we only ship the two default rules.
  const anchor =
    rule.taskCategory === "inspection" || rule.triggerEvent === "checkin_due"
      ? new Date(booking.checkIn + "T15:00:00Z")
      : new Date(booking.checkOut + "T11:00:00Z");
  const dueAt = new Date(anchor.getTime() + rule.dueOffsetMinutes * 60_000);

  const counter = await nextDailyCounter("OPS");
  const taskCode = buildTaskCode(counter);

  const [task] = await db
    .insert(operationTasks)
    .values({
      organizationId: booking.organizationId,
      taskCode,
      title,
      category: rule.taskCategory,
      priority: rule.priority,
      source: "booking",
      taskTypeId,
      villaId: booking.villaId,
      bookingId: booking.id,
      scheduledFor: booking.checkOut,
      dueAt,
      status: rule.assignedTo ? "scheduled" : "open",
      assignedTo: rule.assignedTo ?? null,
    })
    .returning({ id: operationTasks.id });

  // Attach checklist if a template resolved.
  if (templateId) {
    const [checklist] = await db
      .insert(taskChecklists)
      .values({ taskId: task.id, templateId, status: "open" })
      .returning({ id: taskChecklists.id });

    const items = await db
      .select()
      .from(checklistTemplateItems)
      .where(eq(checklistTemplateItems.templateId, templateId));

    if (items.length > 0) {
      await db.insert(taskChecklistItems).values(
        items.map((it) => ({
          checklistId: checklist.id,
          templateItemId: it.id,
          section: it.section,
          label: it.label,
          itemType: it.itemType,
          isRequired: it.isRequired,
          sortOrder: it.sortOrder,
          photoRequired: templateItemRequiresPhoto(it.itemType),
          status: "pending",
        })),
      );
    }
  }

  return { ruleId: rule.id, status: "created", taskId: task.id };
}
