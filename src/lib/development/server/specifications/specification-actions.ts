"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { specifications } from "@/lib/db/schema/specifications";
import { requireInternalUser } from "@/features/auth/permissions";

const SPEC_CATEGORIES = [
  "wall_finish",
  "floor_finish",
  "ceiling_finish",
  "paint",
  "tile",
  "stone",
  "wood",
  "metal",
  "glass",
  "plumbing_fixture",
  "electrical_fixture",
  "lighting",
  "door_window",
  "hardware",
  "appliance",
  "furniture",
  "landscape",
  "pool",
  "mep",
  "structural",
  "other",
] as const;

const createSchema = z.object({
  specCode: z.string().min(1),
  specName: z.string().min(1),
  description: z.string().min(1),
  specCategory: z.enum(SPEC_CATEGORIES),
  brand: z.string().nullable().optional(),
  modelNumber: z.string().nullable().optional(),
  colorCode: z.string().nullable().optional(),
  dimensions: z.string().nullable().optional(),
  finishType: z.string().nullable().optional(),
  applicableStandards: z.array(z.string()).optional(),
  toleranceSpecifications: z.string().nullable().optional(),
  preferredVendorId: z.string().uuid().nullable().optional(),
  alternativeVendorIds: z.array(z.string().uuid()).default([]),
  notes: z.string().nullable().optional(),
});

export async function createSpecification(
  input: z.input<typeof createSchema>,
) {
  const ctx = await requireInternalUser();
  const parsed = createSchema.parse(input);
  const db = requireDb();
  const [row] = await db
    .insert(specifications)
    .values({
      specCode: parsed.specCode,
      specName: parsed.specName,
      description: parsed.description,
      specCategory: parsed.specCategory,
      brand: parsed.brand ?? null,
      modelNumber: parsed.modelNumber ?? null,
      colorCode: parsed.colorCode ?? null,
      dimensions: parsed.dimensions ?? null,
      finishType: parsed.finishType ?? null,
      applicableStandards: parsed.applicableStandards ?? null,
      toleranceSpecifications: parsed.toleranceSpecifications ?? null,
      preferredVendorId: parsed.preferredVendorId ?? null,
      alternativeVendorIds: parsed.alternativeVendorIds,
      notes: parsed.notes ?? null,
      createdBy: ctx.appUser?.id ?? null,
    })
    .returning();
  return row;
}

const supersedeSchema = z.object({
  oldSpecificationId: z.string().uuid(),
  newSpecInput: createSchema,
});

export async function supersedeSpecification(
  input: z.input<typeof supersedeSchema>,
) {
  await requireInternalUser();
  const parsed = supersedeSchema.parse(input);
  const db = requireDb();
  return db.transaction(async (tx) => {
    const newRow = await createSpecification(parsed.newSpecInput);
    await tx
      .update(specifications)
      .set({ isActive: false, supersededBy: newRow.id })
      .where(eq(specifications.id, parsed.oldSpecificationId));
    return newRow;
  });
}

export async function deactivateSpecification(input: { id: string }) {
  await requireInternalUser();
  const db = requireDb();
  const [row] = await db
    .update(specifications)
    .set({ isActive: false })
    .where(eq(specifications.id, input.id))
    .returning();
  return row;
}
