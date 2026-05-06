import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { villas } from "@/lib/db/schema/projects";
import { assetTypes } from "@/lib/db/schema/asset-types";
import { requireInternalUser } from "@/features/auth/permissions";

const VILLA_STATUSES = [
  "available",
  "occupied",
  "checkout_pending",
  "cleaning",
  "inspection",
  "ready",
  "maintenance_blocked",
  "owner_stay",
  "out_of_service",
  "archived",
] as const;

const createAssetSchema = z.object({
  projectId: z.string().uuid(),
  assetTypeKey: z.string().min(1),
  unitCode: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().nullable().optional(),
  status: z.enum(VILLA_STATUSES).default("ready"),
  assetAttributes: z.record(z.unknown()).default({}),
  bedrooms: z.number().int().nonnegative().optional(),
  builtAreaSqm: z.number().nonnegative().optional(),
});

/**
 * Create an asset of any type. Looks up the asset_type_id from the
 * registry by `assetTypeKey`. Sets `assetAttributes` JSONB to the
 * caller-supplied schema (caller is responsible for type-correct
 * attributes; the DB doesn't enforce schema per type).
 */
export async function createAsset(input: z.input<typeof createAssetSchema>) {
  await requireInternalUser();
  const parsed = createAssetSchema.parse(input);
  const db = requireDb();

  const [type] = await db
    .select()
    .from(assetTypes)
    .where(eq(assetTypes.typeKey, parsed.assetTypeKey))
    .limit(1);
  if (!type) {
    throw new Error(`asset type '${parsed.assetTypeKey}' not in registry`);
  }
  if (!type.isActive) {
    throw new Error(`asset type '${parsed.assetTypeKey}' is inactive`);
  }

  const [row] = await db
    .insert(villas)
    .values({
      projectId: parsed.projectId,
      slug: parsed.slug,
      unitCode: parsed.unitCode,
      name: parsed.name ?? null,
      status: parsed.status,
      bedrooms: parsed.bedrooms ?? 0,
      builtAreaSqm: parsed.builtAreaSqm != null ? String(parsed.builtAreaSqm) : null,
      assetTypeId: type.id,
      assetAttributes: parsed.assetAttributes,
    })
    .returning();
  return row;
}

const updateAttributesSchema = z.object({
  assetId: z.string().uuid(),
  assetAttributes: z.record(z.unknown()),
});

export async function updateAssetAttributes(
  input: z.input<typeof updateAttributesSchema>,
) {
  await requireInternalUser();
  const parsed = updateAttributesSchema.parse(input);
  const db = requireDb();
  const [row] = await db
    .update(villas)
    .set({ assetAttributes: parsed.assetAttributes })
    .where(eq(villas.id, parsed.assetId))
    .returning();
  return row;
}

const changeTypeSchema = z.object({
  assetId: z.string().uuid(),
  newAssetTypeKey: z.string().min(1),
  reason: z.string().min(1),
});

/**
 * Changing an asset's type is rare and operationally significant
 * (e.g., converting a villa to a hotel-room inventory item).
 * Always requires an audit reason.
 */
export async function changeAssetType(
  input: z.input<typeof changeTypeSchema>,
) {
  await requireInternalUser();
  const parsed = changeTypeSchema.parse(input);
  const db = requireDb();
  const [type] = await db
    .select()
    .from(assetTypes)
    .where(eq(assetTypes.typeKey, parsed.newAssetTypeKey))
    .limit(1);
  if (!type) {
    throw new Error(`asset type '${parsed.newAssetTypeKey}' not in registry`);
  }
  const [row] = await db
    .update(villas)
    .set({ assetTypeId: type.id })
    .where(eq(villas.id, parsed.assetId))
    .returning();
  return row;
}
