"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { assetTypes } from "@/lib/db/schema/asset-types";
import { requireInternalUser } from "@/features/auth/permissions";

const CATEGORIES = [
  "residential",
  "hospitality",
  "food_beverage",
  "wellness",
  "mixed_use",
  "commercial",
  "land",
  "amenity",
  "other",
] as const;

const createTypeSchema = z.object({
  typeKey: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().nullable().optional(),
  assetCategory: z.enum(CATEGORIES),
  isSaleable: z.boolean().default(true),
  isRentable: z.boolean().default(false),
  isRevenueGenerating: z.boolean().default(true),
  iconKey: z.string().nullable().optional(),
});

export async function createAssetType(
  input: z.input<typeof createTypeSchema>,
) {
  await requireInternalUser();
  const parsed = createTypeSchema.parse(input);
  const db = requireDb();
  const [row] = await db
    .insert(assetTypes)
    .values({
      typeKey: parsed.typeKey,
      displayName: parsed.displayName,
      description: parsed.description ?? null,
      assetCategory: parsed.assetCategory,
      isSaleable: parsed.isSaleable,
      isRentable: parsed.isRentable,
      isRevenueGenerating: parsed.isRevenueGenerating,
      iconKey: parsed.iconKey ?? null,
    })
    .returning();
  return row;
}

/**
 * Stage 6.P0.6 — update editable fields. `typeKey` is intentionally
 * omitted from the update schema: it's the stable lookup handle used
 * by foreign keys (villa.asset_type_id), so it never changes once set.
 */
const updateTypeSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  assetCategory: z.enum(CATEGORIES).optional(),
  isSaleable: z.boolean().optional(),
  isRentable: z.boolean().optional(),
  isRevenueGenerating: z.boolean().optional(),
  iconKey: z.string().nullable().optional(),
});

export async function updateAssetType(input: z.input<typeof updateTypeSchema>) {
  await requireInternalUser();
  const parsed = updateTypeSchema.parse(input);
  const db = requireDb();
  const { id, ...rest } = parsed;
  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (v !== undefined) updates[k] = v;
  }
  if (Object.keys(updates).length === 0) return null;
  updates.updatedAt = new Date();
  const [row] = await db
    .update(assetTypes)
    .set(updates as never)
    .where(eq(assetTypes.id, id))
    .returning();
  return row;
}

export async function deactivateAssetType(input: { id: string }) {
  await requireInternalUser();
  const db = requireDb();
  const [row] = await db
    .update(assetTypes)
    .set({ isActive: false })
    .where(eq(assetTypes.id, input.id))
    .returning();
  return row;
}
