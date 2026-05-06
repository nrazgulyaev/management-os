import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { qualityStandards } from "@/lib/db/schema/method-quality";
import { requireInternalUser } from "@/features/auth/permissions";

const createSchema = z.object({
  standardCode: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  category: z.string().min(1),
  acceptanceCriteria: z.string().min(1),
  measurementMethod: z.string().nullable().optional(),
  toleranceSpecification: z
    .object({
      dimension: z.string(),
      tolerance: z.string(),
      unit: z.string().optional(),
    })
    .nullable()
    .optional(),
  industryStandardsReference: z.array(z.string()).optional(),
  applicableSpecifications: z.array(z.string().uuid()).default([]),
  applicableMethodStatements: z.array(z.string().uuid()).default([]),
  notes: z.string().nullable().optional(),
});

export async function createQualityStandard(
  input: z.input<typeof createSchema>,
) {
  const ctx = await requireInternalUser();
  const parsed = createSchema.parse(input);
  const db = requireDb();
  const [row] = await db
    .insert(qualityStandards)
    .values({
      standardCode: parsed.standardCode,
      title: parsed.title,
      description: parsed.description ?? null,
      category: parsed.category,
      acceptanceCriteria: parsed.acceptanceCriteria,
      measurementMethod: parsed.measurementMethod ?? null,
      toleranceSpecification: parsed.toleranceSpecification ?? null,
      industryStandardsReference: parsed.industryStandardsReference ?? null,
      applicableSpecifications: parsed.applicableSpecifications,
      applicableMethodStatements: parsed.applicableMethodStatements,
      notes: parsed.notes ?? null,
      createdBy: ctx.appUser?.id ?? null,
    })
    .returning();
  return row;
}

export async function deactivateQualityStandard(input: { id: string }) {
  await requireInternalUser();
  const db = requireDb();
  const [row] = await db
    .update(qualityStandards)
    .set({ isActive: false })
    .where(eq(qualityStandards.id, input.id))
    .returning();
  return row;
}
