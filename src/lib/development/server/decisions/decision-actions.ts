"use server";

import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { projectDecisions } from "@/lib/db/schema/project-memory";
import { requireInternalUser } from "@/features/auth/permissions";

const createSchema = z.object({
  title: z.string().min(1),
  projectId: z.string().uuid(),
  villaId: z.string().uuid().nullable().optional(),
  workPackageId: z.string().uuid().nullable().optional(),
  decisionText: z.string().min(1),
  rationale: z.string().nullable().optional(),
  context: z.string().nullable().optional(),
  decisionDate: z.string().optional(),
  category: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  relatedSupplierId: z.string().uuid().nullable().optional(),
  relatedDocuments: z.array(z.string().uuid()).default([]),
  relatedPhotos: z.array(z.string().uuid()).default([]),
  notes: z.string().nullable().optional(),
});

export async function createProjectDecision(
  input: z.input<typeof createSchema>,
) {
  const ctx = await requireInternalUser();
  const parsed = createSchema.parse(input);
  const db = requireDb();
  if (!ctx.appUser?.id) {
    throw new Error("createProjectDecision: requires authenticated app user");
  }
  // Generate code: DEC-PROJSLUG-YYYY-### — but we don't have slug here.
  // Use sequence per project: DEC-{first8 of projectId}-####
  const [{ count }] = await db
    .select({ count: sql<string>`COUNT(*)::text` })
    .from(projectDecisions);
  const seq = String(Number(count ?? "0") + 1).padStart(4, "0");
  const decisionCode = `DEC-${parsed.projectId.slice(0, 8)}-${seq}`;

  const [row] = await db
    .insert(projectDecisions)
    .values({
      decisionCode,
      title: parsed.title,
      projectId: parsed.projectId,
      villaId: parsed.villaId ?? null,
      workPackageId: parsed.workPackageId ?? null,
      decisionText: parsed.decisionText,
      rationale: parsed.rationale ?? null,
      context: parsed.context ?? null,
      decidedBy: ctx.appUser.id,
      decisionDate: parsed.decisionDate ?? new Date().toISOString().slice(0, 10),
      category: parsed.category ?? null,
      tags: parsed.tags ?? null,
      relatedSupplierId: parsed.relatedSupplierId ?? null,
      relatedDocuments: parsed.relatedDocuments,
      relatedPhotos: parsed.relatedPhotos,
      notes: parsed.notes ?? null,
      status: "active",
    })
    .returning();
  return row;
}

const supersedeSchema = z.object({
  oldDecisionId: z.string().uuid(),
  newDecisionInput: createSchema,
});

/**
 * Supersede an existing decision. Atomic: marks old as 'superseded' and
 * sets old.superseded_by → new, all in one transaction.
 */
export async function supersedeProjectDecision(
  input: z.input<typeof supersedeSchema>,
) {
  const ctx = await requireInternalUser();
  const parsed = supersedeSchema.parse(input);
  const db = requireDb();
  if (!ctx.appUser?.id) {
    throw new Error("supersedeProjectDecision: requires authenticated user");
  }

  return db.transaction(async (tx) => {
    const [old] = await tx
      .select()
      .from(projectDecisions)
      .where(eq(projectDecisions.id, parsed.oldDecisionId))
      .limit(1);
    if (!old) throw new Error("decision not found");
    if (old.status !== "active") {
      throw new Error(
        `cannot supersede decision in status '${old.status}' (must be 'active')`,
      );
    }

    const newDec = await createProjectDecision(parsed.newDecisionInput);

    await tx
      .update(projectDecisions)
      .set({ status: "superseded", supersededBy: newDec.id })
      .where(eq(projectDecisions.id, parsed.oldDecisionId));

    return { old, new: newDec };
  });
}

export async function reverseProjectDecision(input: { decisionId: string }) {
  await requireInternalUser();
  const db = requireDb();
  const [row] = await db
    .update(projectDecisions)
    .set({ status: "reversed" })
    .where(eq(projectDecisions.id, input.decisionId))
    .returning();
  return row;
}
