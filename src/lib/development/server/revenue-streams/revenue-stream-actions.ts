import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { revenueStreams } from "@/lib/db/schema/revenue-streams";
import { villas } from "@/lib/db/schema/projects";
import { assetTypes } from "@/lib/db/schema/asset-types";
import { requireInternalUser } from "@/features/auth/permissions";

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
