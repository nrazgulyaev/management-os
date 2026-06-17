"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { methodStatements } from "@/lib/db/schema/method-quality";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";

const CATEGORIES = [
  "structural",
  "mep_electrical",
  "mep_plumbing",
  "mep_hvac",
  "finishing",
  "safety",
  "demolition",
  "site_preparation",
  "inspection",
  "handover",
  "general",
] as const;

const STATUSES = [
  "draft",
  "under_review",
  "approved",
  "active",
  "superseded",
  "archived",
] as const;

const VALID_NEXT: Record<string, string[]> = {
  draft: ["under_review", "archived"],
  under_review: ["approved", "draft", "archived"],
  approved: ["active", "draft"],
  active: ["superseded", "archived"],
  superseded: [],
  archived: [],
};

const procedureStepSchema = z.object({
  step: z.number().int().positive(),
  instruction: z.string().min(1),
  duration: z.string().optional(),
});

const createSchema = z.object({
  methodCode: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  category: z.enum(CATEGORIES),
  applicableWorkTypes: z.array(z.string()).optional(),
  applicableSpecifications: z.array(z.string().uuid()).default([]),
  procedureSteps: z.array(procedureStepSchema).min(1),
  requiredTools: z.array(z.string()).optional(),
  requiredMaterials: z.array(z.string()).optional(),
  requiredPpe: z.array(z.string()).optional(),
  qualityCheckpoints: z
    .array(
      z.object({
        checkpoint: z.string(),
        tolerance: z.string().optional(),
      }),
    )
    .optional(),
  safetyHazards: z.array(z.string()).optional(),
  hazardMitigations: z.array(z.string()).optional(),
  referenceVideoUrls: z.array(z.string()).optional(),
  effectiveFrom: z.string().nullable().optional(),
  effectiveUntil: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function createMethodStatement(
  input: z.input<typeof createSchema>,
) {
  const ctx = await requireInternalUser();
  const parsed = createSchema.parse(input);
  const db = requireDb();
  // HF-5: method_statements is multi-tenant (migration 0072).
  const organizationId = await requireOrgId();
  const [row] = await db
    .insert(methodStatements)
    .values({
      organizationId,
      methodCode: parsed.methodCode,
      title: parsed.title,
      description: parsed.description ?? null,
      category: parsed.category,
      applicableWorkTypes: parsed.applicableWorkTypes ?? null,
      applicableSpecifications: parsed.applicableSpecifications,
      procedureSteps: parsed.procedureSteps,
      requiredTools: parsed.requiredTools ?? null,
      requiredMaterials: parsed.requiredMaterials ?? null,
      requiredPpe: parsed.requiredPpe ?? null,
      qualityCheckpoints: parsed.qualityCheckpoints ?? null,
      safetyHazards: parsed.safetyHazards ?? null,
      hazardMitigations: parsed.hazardMitigations ?? null,
      referenceVideoUrls: parsed.referenceVideoUrls ?? null,
      effectiveFrom: parsed.effectiveFrom ?? null,
      effectiveUntil: parsed.effectiveUntil ?? null,
      notes: parsed.notes ?? null,
      status: "draft",
      createdBy: ctx.appUser?.id ?? null,
    })
    .returning();
  return row;
}

const updateSchema = z.object({
  methodId: z.string().uuid(),
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  requiredTools: z.array(z.string()).optional(),
  requiredMaterials: z.array(z.string()).optional(),
  requiredPpe: z.array(z.string()).optional(),
  qualityCheckpoints: z
    .array(
      z.object({
        checkpoint: z.string().min(1),
        tolerance: z.string().optional(),
      }),
    )
    .optional(),
  safetyHazards: z.array(z.string()).optional(),
  hazardMitigations: z.array(z.string()).optional(),
  notes: z.string().nullable().optional(),
});

/**
 * Edits the operational detail of a method statement — required tools,
 * materials, PPE, quality checkpoints, safety hazards + mitigations
 * (plus title/description/notes) — that the thin create form omits.
 * Org-scoped + permission-gated; only supplied keys are written so a
 * partial edit doesn't wipe untouched columns. Terminal-state SOPs
 * (superseded / archived) are frozen.
 */
export async function updateMethodStatement(
  input: z.input<typeof updateSchema>,
) {
  await requireInternalUser();
  const parsed = updateSchema.parse(input);
  const db = requireDb();
  const organizationId = await requireOrgId();

  const [current] = await db
    .select({ status: methodStatements.status })
    .from(methodStatements)
    .where(
      and(
        eq(methodStatements.id, parsed.methodId),
        eq(methodStatements.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!current) throw new Error("method_statement not found");
  if (current.status === "superseded" || current.status === "archived") {
    throw new Error(
      `cannot edit a '${current.status}' method statement — it is frozen`,
    );
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.title !== undefined) updates.title = parsed.title;
  if (parsed.description !== undefined)
    updates.description = parsed.description ?? null;
  if (parsed.requiredTools !== undefined)
    updates.requiredTools = parsed.requiredTools;
  if (parsed.requiredMaterials !== undefined)
    updates.requiredMaterials = parsed.requiredMaterials;
  if (parsed.requiredPpe !== undefined) updates.requiredPpe = parsed.requiredPpe;
  if (parsed.qualityCheckpoints !== undefined)
    updates.qualityCheckpoints = parsed.qualityCheckpoints;
  if (parsed.safetyHazards !== undefined)
    updates.safetyHazards = parsed.safetyHazards;
  if (parsed.hazardMitigations !== undefined)
    updates.hazardMitigations = parsed.hazardMitigations;
  if (parsed.notes !== undefined) updates.notes = parsed.notes ?? null;

  const [row] = await db
    .update(methodStatements)
    .set(updates)
    .where(
      and(
        eq(methodStatements.id, parsed.methodId),
        eq(methodStatements.organizationId, organizationId),
      ),
    )
    .returning();
  return row;
}

const transitionSchema = z.object({
  methodId: z.string().uuid(),
  to: z.enum(STATUSES),
});

export async function transitionMethodStatement(
  input: z.input<typeof transitionSchema>,
) {
  const ctx = await requireInternalUser();
  const parsed = transitionSchema.parse(input);
  const db = requireDb();
  // HF-5: scope SELECT + UPDATE by organization_id.
  const organizationId = await requireOrgId();
  const [current] = await db
    .select()
    .from(methodStatements)
    .where(
      and(
        eq(methodStatements.id, parsed.methodId),
        eq(methodStatements.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!current) throw new Error("method_statement not found");
  if (!VALID_NEXT[current.status].includes(parsed.to)) {
    throw new Error(
      `cannot transition method_statement from '${current.status}' to '${parsed.to}'`,
    );
  }
  const updates: Record<string, unknown> = { status: parsed.to };
  if (parsed.to === "approved") {
    updates.approvedBy = ctx.appUser?.id ?? null;
    updates.approvedAt = new Date();
  }
  const [row] = await db
    .update(methodStatements)
    .set(updates)
    .where(
      and(
        eq(methodStatements.id, parsed.methodId),
        eq(methodStatements.organizationId, organizationId),
      ),
    )
    .returning();
  return row;
}
