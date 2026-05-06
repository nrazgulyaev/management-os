import "server-only";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { unitCostAllocations } from "@/lib/db/schema/profitability-cashflow";
import { requireInternalUser } from "@/features/auth/permissions";
import {
  computeUnitCostBasis,
  computeMarginPercentage,
  type AllocationMethod,
} from "./profitability-helpers";

const allocateSchema = z.object({
  assetId: z.string().uuid(),
  projectId: z.string().uuid(),
  projectTotalLandCost: z.number().nonnegative(),
  projectTotalSoftCost: z.number().nonnegative(),
  projectTotalMarketingCost: z.number().nonnegative(),
  allMarketingProjectAssets: z.array(
    z.object({
      assetId: z.string().uuid(),
      sqm: z.number().nonnegative(),
      expectedPrice: z.number().nonnegative(),
      volume: z.number().nonnegative().optional(),
    }),
  ),
  allocationMethod: z.enum([
    "by_floor_area",
    "by_market_value",
    "by_unit_count",
    "by_volume",
  ]),
  directCosts: z.number().nonnegative(),
  hardCostAllocated: z.number().nonnegative().optional(),
  contingencyUsed: z.number().nonnegative(),
  financingCost: z.number().nonnegative().optional(),
  expectedSalePrice: z.number().nonnegative().optional(),
  notes: z.string().nullable().optional(),
});

/**
 * Recompute the cost allocation for an asset. Atomic: writes new row
 * with `is_current=true`, then demotes the prior current allocation
 * (if any) inside the same transaction. Partial unique index prevents
 * two current allocations per asset (defense in depth).
 */
export async function recomputeUnitAllocation(
  input: z.input<typeof allocateSchema>,
) {
  const ctx = await requireInternalUser();
  const parsed = allocateSchema.parse(input);
  const db = requireDb();

  const computed = computeUnitCostBasis({
    assetId: parsed.assetId,
    projectTotalLandCost: parsed.projectTotalLandCost,
    projectTotalSoftCost: parsed.projectTotalSoftCost,
    projectTotalMarketingCost: parsed.projectTotalMarketingCost,
    allMarketingProjectAssets: parsed.allMarketingProjectAssets,
    allocationMethod: parsed.allocationMethod as AllocationMethod,
    directCosts: parsed.directCosts,
    hardCostAllocated: parsed.hardCostAllocated,
    contingencyUsed: parsed.contingencyUsed,
    financingCost: parsed.financingCost,
  });

  const margin =
    parsed.expectedSalePrice != null
      ? computeMarginPercentage({
          costBasis: computed.totalCostBasis,
          salePrice: parsed.expectedSalePrice,
        })
      : null;

  return db.transaction(async (tx) => {
    // Demote the existing current allocation (if any) so the partial
    // unique index doesn't reject the insert.
    await tx
      .update(unitCostAllocations)
      .set({ isCurrent: false })
      .where(
        and(
          eq(unitCostAllocations.assetId, parsed.assetId),
          eq(unitCostAllocations.isCurrent, true),
        ),
      );

    const [row] = await tx
      .insert(unitCostAllocations)
      .values({
        assetId: parsed.assetId,
        projectId: parsed.projectId,
        computedForDate: new Date().toISOString().slice(0, 10),
        landCostAllocatedMinor: BigInt(computed.landAllocated),
        landAllocationMethod: parsed.allocationMethod,
        hardCostDirectMinor: BigInt(computed.hardCostDirect),
        hardCostAllocatedMinor: BigInt(computed.hardCostAllocated),
        softCostAllocatedMinor: BigInt(computed.softCostAllocated),
        softCostMethod: parsed.allocationMethod,
        marketingCostAllocatedMinor: BigInt(computed.marketingAllocated),
        marketingAllocationMethod: parsed.allocationMethod,
        financingCostAllocatedMinor: BigInt(computed.financingCostAllocated),
        contingencyUsedMinor: BigInt(computed.contingencyUsed),
        expectedSalePriceMinor:
          parsed.expectedSalePrice != null
            ? BigInt(parsed.expectedSalePrice)
            : null,
        marginPercentage: margin != null ? String(margin.toFixed(4)) : null,
        computedBy: ctx.appUser?.id ?? null,
        computationMethod: "automatic",
        isCurrent: true,
        notes: parsed.notes ?? null,
      })
      .returning();
    return row;
  });
}

const overrideSchema = z.object({
  allocationId: z.string().uuid(),
  notes: z.string().min(1),
  overrides: z
    .object({
      landCostAllocatedMinor: z.bigint().nonnegative().optional(),
      hardCostDirectMinor: z.bigint().nonnegative().optional(),
      hardCostAllocatedMinor: z.bigint().nonnegative().optional(),
      softCostAllocatedMinor: z.bigint().nonnegative().optional(),
      marketingCostAllocatedMinor: z.bigint().nonnegative().optional(),
      financingCostAllocatedMinor: z.bigint().nonnegative().optional(),
      contingencyUsedMinor: z.bigint().nonnegative().optional(),
      expectedSalePriceMinor: z.bigint().nonnegative().optional(),
    })
    .partial(),
});

/**
 * Manual override of an allocation. Audit trail: notes are required,
 * computation_method flipped to 'manual_override'.
 */
export async function overrideUnitAllocation(
  input: z.input<typeof overrideSchema>,
) {
  await requireInternalUser();
  const parsed = overrideSchema.parse(input);
  const db = requireDb();
  const updates: Record<string, unknown> = {
    computationMethod: "manual_override",
    notes: parsed.notes,
  };
  for (const [k, v] of Object.entries(parsed.overrides)) {
    if (v !== undefined) updates[k] = v;
  }
  const [row] = await db
    .update(unitCostAllocations)
    .set(updates)
    .where(eq(unitCostAllocations.id, parsed.allocationId))
    .returning();
  return row;
}
