import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { workPackages } from "@/lib/db/schema/work-packages";
import { requireInternalUser } from "@/features/auth/permissions";

const STATUSES = [
  "planned",
  "ready_to_start",
  "in_progress",
  "completed",
  "on_hold",
  "cancelled",
] as const;

const createSchema = z.object({
  packageCode: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  projectId: z.string().uuid(),
  parentId: z.string().uuid().nullable().optional(),
  villaIds: z.array(z.string().uuid()).default([]),
  zoneReferences: z.array(z.string()).optional(),
  plannedStart: z.string().nullable().optional(),
  plannedFinish: z.string().nullable().optional(),
  budgetCategories: z.array(z.string().uuid()).default([]),
  budgetAmountMinor: z.bigint().nullable().optional(),
  responsibleUserId: z.string().uuid().nullable().optional(),
  primaryVendorId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function createWorkPackage(input: z.input<typeof createSchema>) {
  await requireInternalUser();
  const parsed = createSchema.parse(input);
  const db = requireDb();
  const [row] = await db
    .insert(workPackages)
    .values({
      packageCode: parsed.packageCode,
      name: parsed.name,
      description: parsed.description ?? null,
      projectId: parsed.projectId,
      parentId: parsed.parentId ?? null,
      villaIds: parsed.villaIds,
      zoneReferences: parsed.zoneReferences ?? null,
      plannedStart: parsed.plannedStart ?? null,
      plannedFinish: parsed.plannedFinish ?? null,
      budgetCategories: parsed.budgetCategories,
      budgetAmountMinor: parsed.budgetAmountMinor ?? null,
      responsibleUserId: parsed.responsibleUserId ?? null,
      primaryVendorId: parsed.primaryVendorId ?? null,
      notes: parsed.notes ?? null,
    })
    .returning();
  return row;
}

const transitionSchema = z.object({
  workPackageId: z.string().uuid(),
  to: z.enum(STATUSES),
});

const VALID_NEXT: Record<string, string[]> = {
  planned: ["ready_to_start", "cancelled"],
  ready_to_start: ["in_progress", "planned", "cancelled"],
  in_progress: ["completed", "on_hold", "cancelled"],
  on_hold: ["in_progress", "cancelled"],
  completed: [],
  cancelled: [],
};

export async function transitionWorkPackage(
  input: z.input<typeof transitionSchema>,
) {
  await requireInternalUser();
  const parsed = transitionSchema.parse(input);
  const db = requireDb();
  const [current] = await db
    .select()
    .from(workPackages)
    .where(eq(workPackages.id, parsed.workPackageId))
    .limit(1);
  if (!current) throw new Error("work_package not found");
  if (!VALID_NEXT[current.status].includes(parsed.to)) {
    throw new Error(
      `cannot transition work_package from '${current.status}' to '${parsed.to}'`,
    );
  }
  const [row] = await db
    .update(workPackages)
    .set({ status: parsed.to })
    .where(eq(workPackages.id, parsed.workPackageId))
    .returning();
  return row;
}
