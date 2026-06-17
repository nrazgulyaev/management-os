"use server";
import "server-only";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { productivityLogs } from "@/lib/db/schema/schedule-sophistication";
import { requireOrgId } from "@/features/auth/require-org";

const logSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid().optional(),
  resourceId: z.string().uuid().optional(),
  villaId: z.string().uuid().optional(),
  logDate: z.string(),
  tradeCategory: z.string().optional(),
  activityDescription: z.string().optional(),
  plannedHours: z.number().nonnegative().optional(),
  actualHours: z.number().positive(),
  quantityCompleted: z.number().nonnegative().optional(),
  unitOfMeasure: z.string().optional(),
  dataSource: z.enum([
    "site_report",
    "manual_entry",
    "attendance_log",
    "mobile_app",
  ]),
  relatedSiteReportId: z.string().uuid().optional(),
  recordedBy: z.string().uuid(),
});

export async function recordProductivityLog(input: z.input<typeof logSchema>) {
  const parsed = logSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message };
  }
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  // HF-5: productivity_logs is multi-tenant (migration 0072).
  const organizationId = await requireOrgId();
  await db.insert(productivityLogs).values({
    organizationId,
    projectId: parsed.data.projectId,
    taskId: parsed.data.taskId ?? null,
    resourceId: parsed.data.resourceId ?? null,
    villaId: parsed.data.villaId ?? null,
    logDate: parsed.data.logDate,
    tradeCategory: parsed.data.tradeCategory ?? null,
    activityDescription: parsed.data.activityDescription ?? null,
    plannedHours:
      parsed.data.plannedHours != null
        ? parsed.data.plannedHours.toString()
        : null,
    actualHours: parsed.data.actualHours.toString(),
    quantityCompleted:
      parsed.data.quantityCompleted != null
        ? parsed.data.quantityCompleted.toString()
        : null,
    unitOfMeasure: parsed.data.unitOfMeasure ?? null,
    dataSource: parsed.data.dataSource,
    relatedSiteReportId: parsed.data.relatedSiteReportId ?? null,
    recordedBy: parsed.data.recordedBy,
  });
  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// Edit + delete a productivity log row (org-scoped). productivity_rate is a
// GENERATED column (quantity_completed / actual_hours) — never written here.
// ---------------------------------------------------------------------------

const editLogSchema = z.object({
  id: z.string().uuid(),
  logDate: z.string().optional(),
  tradeCategory: z.string().nullable().optional(),
  activityDescription: z.string().nullable().optional(),
  plannedHours: z.number().nonnegative().nullable().optional(),
  actualHours: z.number().positive().optional(),
  quantityCompleted: z.number().nonnegative().nullable().optional(),
  unitOfMeasure: z.string().nullable().optional(),
});

export async function editProductivityLog(
  input: z.input<typeof editLogSchema>,
) {
  const parsed = editLogSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message };
  }
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  const organizationId = await requireOrgId();

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.logDate !== undefined) patch.logDate = parsed.data.logDate;
  if (parsed.data.tradeCategory !== undefined)
    patch.tradeCategory = parsed.data.tradeCategory;
  if (parsed.data.activityDescription !== undefined)
    patch.activityDescription = parsed.data.activityDescription;
  if (parsed.data.plannedHours !== undefined) {
    patch.plannedHours =
      parsed.data.plannedHours == null
        ? null
        : parsed.data.plannedHours.toString();
  }
  if (parsed.data.actualHours !== undefined)
    patch.actualHours = parsed.data.actualHours.toString();
  if (parsed.data.quantityCompleted !== undefined) {
    patch.quantityCompleted =
      parsed.data.quantityCompleted == null
        ? null
        : parsed.data.quantityCompleted.toString();
  }
  if (parsed.data.unitOfMeasure !== undefined)
    patch.unitOfMeasure = parsed.data.unitOfMeasure;

  // TENANCY — scope the UPDATE to the caller's org.
  await db
    .update(productivityLogs)
    .set(patch)
    .where(
      and(
        eq(productivityLogs.id, parsed.data.id),
        eq(productivityLogs.organizationId, organizationId),
      ),
    );
  return { ok: true as const };
}

export async function deleteProductivityLog(input: { id: string }) {
  const id = z.string().uuid().safeParse(input.id);
  if (!id.success) return { ok: false as const, error: "Invalid id" };
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  // TENANCY — scope the DELETE to the caller's org.
  const organizationId = await requireOrgId();
  await db
    .delete(productivityLogs)
    .where(
      and(
        eq(productivityLogs.id, id.data),
        eq(productivityLogs.organizationId, organizationId),
      ),
    );
  return { ok: true as const };
}
