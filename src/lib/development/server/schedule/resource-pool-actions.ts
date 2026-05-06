"use server";
import "server-only";

import { z } from "zod";
import { getDb } from "@/lib/db/client";
import {
  resourcePools,
  taskResourceAssignments,
} from "@/lib/db/schema/schedule-sophistication";

const createPoolSchema = z.object({
  resourceCode: z.string().min(2).max(80),
  displayName: z.string().min(2).max(120),
  resourceType: z.enum([
    "vendor_team",
    "internal_team",
    "individual",
    "equipment",
    "subcontractor",
  ]),
  vendorId: z.string().uuid().optional(),
  totalCapacityPerDay: z.number().nonnegative().optional(),
  capacityUnit: z.enum(["hours", "days", "units"]).default("hours"),
  skills: z.array(z.string()).default([]),
});

export async function createResourcePool(input: z.input<typeof createPoolSchema>) {
  const parsed = createPoolSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message };
  }
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  await db.insert(resourcePools).values({
    resourceCode: parsed.data.resourceCode,
    displayName: parsed.data.displayName,
    resourceType: parsed.data.resourceType,
    vendorId: parsed.data.vendorId ?? null,
    totalCapacityPerDay:
      parsed.data.totalCapacityPerDay != null
        ? parsed.data.totalCapacityPerDay.toString()
        : null,
    capacityUnit: parsed.data.capacityUnit,
    skills: parsed.data.skills,
  });
  return { ok: true as const };
}

const assignmentSchema = z.object({
  taskId: z.string().uuid(),
  resourceId: z.string().uuid(),
  allocatedCapacityPerDay: z.number().positive(),
  allocationStart: z.string(),
  allocationEnd: z.string(),
  status: z
    .enum(["planned", "confirmed", "in_progress", "completed", "cancelled"])
    .default("planned"),
});

export async function assignResourceToTask(input: z.input<typeof assignmentSchema>) {
  const parsed = assignmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message };
  }
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  await db.insert(taskResourceAssignments).values({
    taskId: parsed.data.taskId,
    resourceId: parsed.data.resourceId,
    allocatedCapacityPerDay: parsed.data.allocatedCapacityPerDay.toString(),
    allocationStart: parsed.data.allocationStart,
    allocationEnd: parsed.data.allocationEnd,
    status: parsed.data.status,
  });
  return { ok: true as const };
}
