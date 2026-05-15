"use server";
import "server-only";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import {
  resourcePools,
  taskResourceAssignments,
  workingCalendars,
} from "@/lib/db/schema/schedule-sophistication";
import { requireOrgId } from "@/features/auth/require-org";

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
  const organizationId = await requireOrgId();
  await db.insert(resourcePools).values({
    organizationId,
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
  const organizationId = await requireOrgId();
  await db.insert(taskResourceAssignments).values({
    organizationId,
    taskId: parsed.data.taskId,
    resourceId: parsed.data.resourceId,
    allocatedCapacityPerDay: parsed.data.allocatedCapacityPerDay.toString(),
    allocationStart: parsed.data.allocationStart,
    allocationEnd: parsed.data.allocationEnd,
    status: parsed.data.status,
  });
  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// Stage 6.P5-CATCHUP — Edit + deactivate for resource pools.
// ---------------------------------------------------------------------------

const editPoolSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().min(2).max(120).optional(),
  resourceType: z
    .enum([
      "vendor_team",
      "internal_team",
      "individual",
      "equipment",
      "subcontractor",
    ])
    .optional(),
  vendorId: z.string().uuid().nullable().optional(),
  totalCapacityPerDay: z.number().nonnegative().nullable().optional(),
  capacityUnit: z.enum(["hours", "days", "units"]).optional(),
  skills: z.array(z.string()).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function editResourcePool(input: z.input<typeof editPoolSchema>) {
  const parsed = editPoolSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message };
  }
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.displayName !== undefined)
    patch.displayName = parsed.data.displayName;
  if (parsed.data.resourceType !== undefined)
    patch.resourceType = parsed.data.resourceType;
  if (parsed.data.vendorId !== undefined) patch.vendorId = parsed.data.vendorId;
  if (parsed.data.totalCapacityPerDay !== undefined) {
    patch.totalCapacityPerDay =
      parsed.data.totalCapacityPerDay == null
        ? null
        : parsed.data.totalCapacityPerDay.toString();
  }
  if (parsed.data.capacityUnit !== undefined)
    patch.capacityUnit = parsed.data.capacityUnit;
  if (parsed.data.skills !== undefined) patch.skills = parsed.data.skills;
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes;

  const organizationId = await requireOrgId();
  await db
    .update(resourcePools)
    .set(patch)
    .where(
      and(
        eq(resourcePools.id, parsed.data.id),
        eq(resourcePools.organizationId, organizationId),
      ),
    );
  return { ok: true as const };
}

export async function archiveResourcePool(args: {
  id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "DB not configured" };
  const organizationId = await requireOrgId();
  await db
    .update(resourcePools)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(resourcePools.id, args.id),
        eq(resourcePools.organizationId, organizationId),
      ),
    );
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Stage 6.P5-CATCHUP — Working-calendar Edit + Archive.
// ---------------------------------------------------------------------------

const editCalendarSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2).max(160).optional(),
  description: z.string().max(2000).nullable().optional(),
  workingDaysOfWeek: z
    .array(z.number().int().min(0).max(6))
    .min(1)
    .max(7)
    .optional(),
  workingHoursPerDay: z.number().min(0).max(24).optional(),
  isDefault: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function editWorkingCalendar(
  input: z.input<typeof editCalendarSchema>,
) {
  const parsed = editCalendarSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message };
  }
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.description !== undefined)
    patch.description = parsed.data.description;
  if (parsed.data.workingDaysOfWeek !== undefined)
    patch.workingDaysOfWeek = parsed.data.workingDaysOfWeek;
  if (parsed.data.workingHoursPerDay !== undefined)
    patch.workingHoursPerDay = parsed.data.workingHoursPerDay.toString();
  if (parsed.data.isDefault !== undefined)
    patch.isDefault = parsed.data.isDefault;
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes;

  await db
    .update(workingCalendars)
    .set(patch)
    .where(eq(workingCalendars.id, parsed.data.id));
  return { ok: true as const };
}

export async function archiveWorkingCalendar(args: {
  id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "DB not configured" };
  await db
    .update(workingCalendars)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(workingCalendars.id, args.id));
  return { ok: true };
}
