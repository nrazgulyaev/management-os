"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { workPackages } from "@/lib/db/schema/work-packages";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { recordAuditEvent } from "@/features/audit/services";

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
  // HF-5: work_packages is multi-tenant (migration 0072).
  const organizationId = await requireOrgId();
  const [row] = await db
    .insert(workPackages)
    .values({
      organizationId,
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
  // HF-5: scope SELECT + UPDATE by organization_id.
  const organizationId = await requireOrgId();
  const [current] = await db
    .select()
    .from(workPackages)
    .where(
      and(
        eq(workPackages.id, parsed.workPackageId),
        eq(workPackages.organizationId, organizationId),
      ),
    )
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
    .where(
      and(
        eq(workPackages.id, parsed.workPackageId),
        eq(workPackages.organizationId, organizationId),
      ),
    )
    .returning();
  return row;
}

const progressSchema = z.object({
  workPackageId: z.string().uuid(),
  progress: z.number(),
});

/**
 * Zone-console progress write (the Projects Live mock's 0–100 slider).
 * Clamps to the table's 0–100 CHECK range, org-scoped like its siblings,
 * audit-logged so progress claims are traceable. Refuses writes on
 * terminal packages (completed / cancelled) — re-open via the state
 * machine first.
 */
export async function updateWorkPackageProgress(
  input: z.input<typeof progressSchema>,
): Promise<{ ok: true; progress: number }> {
  const ctx = await requireInternalUser();
  const parsed = progressSchema.parse(input);
  const db = requireDb();
  // HF-5: scope SELECT + UPDATE by organization_id.
  const organizationId = await requireOrgId();
  const clamped = Math.min(100, Math.max(0, Math.round(parsed.progress)));
  const [current] = await db
    .select()
    .from(workPackages)
    .where(
      and(
        eq(workPackages.id, parsed.workPackageId),
        eq(workPackages.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!current) throw new Error("work_package not found");
  if (current.status === "completed" || current.status === "cancelled") {
    throw new Error(
      `cannot update progress of a '${current.status}' work_package`,
    );
  }
  const [row] = await db
    .update(workPackages)
    .set({ progressPercentage: String(clamped), updatedAt: new Date() })
    .where(
      and(
        eq(workPackages.id, parsed.workPackageId),
        eq(workPackages.organizationId, organizationId),
      ),
    )
    .returning();

  await recordAuditEvent({
    actorUserId: ctx.appUser?.id ?? null,
    action: "work_package.progress",
    entityType: "work_package",
    entityId: parsed.workPackageId,
    before: { progressPercentage: current.progressPercentage },
    after: { progressPercentage: row?.progressPercentage ?? String(clamped) },
    metadata: { projectId: current.projectId, packageCode: current.packageCode },
  });

  return { ok: true, progress: clamped };
}
