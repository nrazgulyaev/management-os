"use server";
import "server-only";

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
