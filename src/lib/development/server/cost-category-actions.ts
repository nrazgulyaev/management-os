"use server";

import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { devCostCategories } from "@/lib/db/schema/dev-finance";

const createSchema = z.object({
  categoryCode: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Z0-9_]+$/),
  parentCategoryId: z.string().uuid().optional().nullable(),
  displayName: z.string().min(1),
  displayNameTranslations: z
    .record(z.string(), z.string())
    .optional()
    .nullable(),
  categoryType: z.enum([
    "capex",
    "opex",
    "cogs",
    "fee_income",
    "sale_income",
    "rental_income",
    "corporate_event",
  ]),
  displayOrder: z.number().int().default(100),
  notes: z.string().optional().nullable(),
});

export async function createCostCategory(
  input: z.input<typeof createSchema>,
): Promise<{ id: string; categoryCode: string }> {
  const parsed = createSchema.parse(input);
  const db = requireDb();
  const [row] = await db
    .insert(devCostCategories)
    .values({
      categoryCode: parsed.categoryCode,
      parentCategoryId: parsed.parentCategoryId ?? null,
      displayName: parsed.displayName,
      displayNameTranslations: parsed.displayNameTranslations ?? null,
      categoryType: parsed.categoryType,
      displayOrder: parsed.displayOrder,
      notes: parsed.notes ?? null,
    })
    .returning({
      id: devCostCategories.id,
      categoryCode: devCostCategories.categoryCode,
    });
  return row;
}

const updateSchema = createSchema.partial().extend({
  id: z.string().uuid(),
});

export async function updateCostCategory(
  input: z.input<typeof updateSchema>,
): Promise<void> {
  const parsed = updateSchema.parse(input);
  const db = requireDb();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.displayName !== undefined) updates.displayName = parsed.displayName;
  if (parsed.displayNameTranslations !== undefined)
    updates.displayNameTranslations = parsed.displayNameTranslations;
  if (parsed.displayOrder !== undefined) updates.displayOrder = parsed.displayOrder;
  if (parsed.notes !== undefined) updates.notes = parsed.notes;
  if (parsed.parentCategoryId !== undefined)
    updates.parentCategoryId = parsed.parentCategoryId;
  await db
    .update(devCostCategories)
    .set(updates)
    .where(eq(devCostCategories.id, parsed.id));
}

export async function deactivateCostCategory(id: string): Promise<void> {
  const db = requireDb();
  // Check no active children
  const [{ count: childCount }] = (await db.execute(sql`
    SELECT count(*)::int AS count FROM dev_cost_categories
    WHERE parent_category_id = ${id} AND is_active = true
  `)) as Array<{ count: number }>;
  if (childCount > 0) {
    throw new Error(
      `Cannot deactivate: ${childCount} active child categories exist.`,
    );
  }
  await db
    .update(devCostCategories)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(devCostCategories.id, id));
}
