"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { bookings } from "@/lib/db/schema/bookings";
import {
  bookingAutomationRules,
} from "@/lib/db/schema/integrations";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requirePermission } from "@/features/auth/permissions";
import {
  automationRuleIdSchema,
  bookingIdSchema,
  createAutomationRuleSchema,
} from "./schema";
import { runBookingAutomationForBooking } from "./services";
import type { ActionResult } from "@/features/projects/actions";

export async function createBookingAutomationRuleAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("automation.write");
  const parsed = createAutomationRuleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please review the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const d = parsed.data;

  const [row] = await db
    .insert(bookingAutomationRules)
    .values({
      ruleName: d.ruleName,
      triggerEvent: d.triggerEvent,
      taskCategory: d.taskCategory,
      taskTypeKey: d.taskTypeKey && d.taskTypeKey !== "" ? d.taskTypeKey : null,
      checklistTemplateKey:
        d.checklistTemplateKey && d.checklistTemplateKey !== ""
          ? d.checklistTemplateKey
          : null,
      titleTemplate: d.titleTemplate,
      dueOffsetMinutes: d.dueOffsetMinutes,
      priority: d.priority,
      projectId: d.projectId ?? null,
      villaId: d.villaId ?? null,
      assignedTo: d.assignedTo ?? null,
      assignedRole: d.assignedRole && d.assignedRole !== "" ? d.assignedRole : null,
    })
    .returning({ id: bookingAutomationRules.id });

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "automation.rule.create",
    entityType: "booking_automation_rule",
    entityId: row.id,
    after: { ruleName: d.ruleName, trigger: d.triggerEvent },
  });

  revalidatePath("/dashboard/integrations/automation");
  return { ok: true };
}

export async function updateBookingAutomationRuleAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("automation.write");
  const parsedId = automationRuleIdSchema.safeParse({ id: formData.get("id") });
  const parsed = createAutomationRuleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsedId.success || !parsed.success) {
    return {
      ok: false,
      error: "Please review the form.",
    };
  }
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };
  const me = await getCurrentAppUser();
  const d = parsed.data;

  await db
    .update(bookingAutomationRules)
    .set({
      ruleName: d.ruleName,
      triggerEvent: d.triggerEvent,
      taskCategory: d.taskCategory,
      taskTypeKey: d.taskTypeKey && d.taskTypeKey !== "" ? d.taskTypeKey : null,
      checklistTemplateKey:
        d.checklistTemplateKey && d.checklistTemplateKey !== ""
          ? d.checklistTemplateKey
          : null,
      titleTemplate: d.titleTemplate,
      dueOffsetMinutes: d.dueOffsetMinutes,
      priority: d.priority,
      assignedTo: d.assignedTo ?? null,
    })
    .where(eq(bookingAutomationRules.id, parsedId.data.id));

  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "automation.rule.update",
    entityType: "booking_automation_rule",
    entityId: parsedId.data.id,
    after: { ruleName: d.ruleName },
  });

  revalidatePath("/dashboard/integrations/automation");
  return { ok: true };
}

export async function runBookingAutomationActionForBooking(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requirePermission("automation.write");
  const parsed = bookingIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Missing booking id." };
  const results = await runBookingAutomationForBooking(parsed.data.bookingId);
  const me = await getCurrentAppUser();
  await recordAuditEvent({
    actorUserId: me?.id ?? null,
    action: "automation.run.for_booking",
    entityType: "booking",
    entityId: parsed.data.bookingId,
    after: {
      runs: results.length,
      created: results.filter((r) => r.status === "created").length,
    },
  });
  revalidatePath(`/dashboard/bookings/${parsed.data.bookingId}`);
  revalidatePath("/dashboard/operations");
  return { ok: true };
}

/**
 * Run automation for the most recent N bookings. Useful as a safety net
 * after enabling automation on an existing platform.
 */
export async function runBookingAutomationForRecentBookingsAction(
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  await requirePermission("automation.write");
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const recent = await db
    .select({ id: bookings.id })
    .from(bookings)
    .orderBy(bookings.createdAt)
    .limit(50);
  for (const b of recent) {
    await runBookingAutomationForBooking(b.id);
  }
  revalidatePath("/dashboard/integrations/automation");
  revalidatePath("/dashboard/operations");
  return { ok: true };
}

export async function seedDefaultBookingAutomationRulesAction(
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  await requirePermission("automation.write");
  const { createDefaultBookingAutomationRulesIfMissing } = await import("./services");
  await createDefaultBookingAutomationRulesIfMissing();
  revalidatePath("/dashboard/integrations/automation");
  return { ok: true };
}
