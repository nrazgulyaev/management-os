import "server-only";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { revenueStreams } from "@/lib/db/schema/revenue-streams";
import { villas } from "@/lib/db/schema/projects";
import { assetTypes } from "@/lib/db/schema/asset-types";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";

const STREAM_TYPES = [
  "hotel_room_revenue",
  "restaurant_revenue",
  "spa_revenue",
  "rental_income",
  "service_fee",
  "membership_fee",
  "event_revenue",
  "other",
] as const;

const createSchema = z.object({
  assetId: z.string().uuid(),
  projectId: z.string().uuid(),
  streamType: z.enum(STREAM_TYPES),
  periodStart: z.string(),
  periodEnd: z.string(),
  grossRevenueMinor: z.bigint().nonnegative(),
  occupancyRate: z.number().min(0).max(100).nullable().optional(),
  averageDailyRateMinor: z.bigint().nullable().optional(),
  unitsSold: z.number().int().nullable().optional(),
  currency: z.string().default("IDR"),
  directCostsMinor: z.bigint().nonnegative().default(0n),
  dataSource: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function createRevenueStream(
  input: z.input<typeof createSchema>,
) {
  const ctx = await requireInternalUser();
  // TENANCY-FINANCE-DOCS — operator context; org from the session.
  const organizationId = await requireOrgId();
  const parsed = createSchema.parse(input);
  const db = requireDb();

  // Validate that the underlying asset is flagged is_rentable
  // (revenue streams are for non-saleable revenue-generating assets).
  const [assetRow] = await db
    .select({ assetTypeId: villas.assetTypeId })
    .from(villas)
    .where(eq(villas.id, parsed.assetId))
    .limit(1);
  if (!assetRow) throw new Error(`asset ${parsed.assetId} not found`);
  const [type] = await db
    .select({
      isRentable: assetTypes.isRentable,
      isRevenueGenerating: assetTypes.isRevenueGenerating,
    })
    .from(assetTypes)
    .where(eq(assetTypes.id, assetRow.assetTypeId))
    .limit(1);
  if (!type?.isRentable && !type?.isRevenueGenerating) {
    throw new Error(
      `revenue-stream: asset type is neither rentable nor revenue-generating`,
    );
  }

  const [row] = await db
    .insert(revenueStreams)
    .values({
      organizationId,
      assetId: parsed.assetId,
      projectId: parsed.projectId,
      streamType: parsed.streamType,
      periodStart: parsed.periodStart,
      periodEnd: parsed.periodEnd,
      grossRevenueMinor: parsed.grossRevenueMinor,
      occupancyRate:
        parsed.occupancyRate != null ? String(parsed.occupancyRate) : null,
      averageDailyRateMinor: parsed.averageDailyRateMinor ?? null,
      unitsSold: parsed.unitsSold ?? null,
      currency: parsed.currency,
      directCostsMinor: parsed.directCostsMinor,
      dataSource: parsed.dataSource ?? null,
      notes: parsed.notes ?? null,
      createdBy: ctx.appUser?.id ?? null,
    })
    .returning();
  return row;
}

const updateSchema = z.object({
  id: z.string().uuid(),
  streamType: z.enum(STREAM_TYPES),
  periodStart: z.string(),
  periodEnd: z.string(),
  grossRevenueMinor: z.bigint().nonnegative(),
  directCostsMinor: z.bigint().nonnegative(),
  occupancyRate: z.number().min(0).max(100).nullable().optional(),
  averageDailyRateMinor: z.bigint().nullable().optional(),
  unitsSold: z.number().int().nullable().optional(),
  currency: z.string().min(1).max(8),
  dataSource: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

/**
 * Updates one revenue stream's editable fields. Org-scoped on both the load
 * and the write so a cross-org id reads as "not found". `net_revenue_minor`
 * is GENERATED STORED in the DB (= gross − direct costs) so recognition
 * recomputes automatically once gross/cost change — never set it here.
 */
export async function updateRevenueStream(
  input: z.input<typeof updateSchema>,
) {
  await requireInternalUser();
  const organizationId = await requireOrgId();
  const parsed = updateSchema.parse(input);
  const db = requireDb();

  // Scope the load by org so a foreign id cannot be edited.
  const [existing] = await db
    .select({ id: revenueStreams.id })
    .from(revenueStreams)
    .where(
      and(
        eq(revenueStreams.id, parsed.id),
        eq(revenueStreams.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!existing) throw new Error("Revenue stream not found.");

  const [row] = await db
    .update(revenueStreams)
    .set({
      streamType: parsed.streamType,
      periodStart: parsed.periodStart,
      periodEnd: parsed.periodEnd,
      grossRevenueMinor: parsed.grossRevenueMinor,
      directCostsMinor: parsed.directCostsMinor,
      occupancyRate:
        parsed.occupancyRate != null ? String(parsed.occupancyRate) : null,
      averageDailyRateMinor: parsed.averageDailyRateMinor ?? null,
      unitsSold: parsed.unitsSold ?? null,
      currency: parsed.currency,
      dataSource: parsed.dataSource ?? null,
      notes: parsed.notes ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(revenueStreams.id, parsed.id),
        eq(revenueStreams.organizationId, organizationId),
      ),
    )
    .returning();
  return row;
}

/** Deletes one revenue stream (org-scoped). Recognition recomputes on read. */
export async function deleteRevenueStream(id: string) {
  await requireInternalUser();
  const organizationId = await requireOrgId();
  const parsedId = z.string().uuid().parse(id);
  const db = requireDb();

  const result = await db
    .delete(revenueStreams)
    .where(
      and(
        eq(revenueStreams.id, parsedId),
        eq(revenueStreams.organizationId, organizationId),
      ),
    )
    .returning({ id: revenueStreams.id });
  if (result.length === 0) throw new Error("Revenue stream not found.");
  return { id: parsedId };
}
