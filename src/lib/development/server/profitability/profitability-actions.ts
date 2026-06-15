import "server-only";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { unitCostAllocations } from "@/lib/db/schema/profitability-cashflow";
import { projects } from "@/lib/db/schema/projects";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { recordAuditEvent } from "@/features/audit/services";
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
 *
 * Internal-gated public entry point. The actual write lives in
 * `writeUnitAllocation` so the aggregation engine + cron (which run with
 * no request auth session) can reuse it through a `system` context
 * without tripping `requireInternalUser`.
 */
export async function recomputeUnitAllocation(
  input: z.input<typeof allocateSchema>,
) {
  const ctx = await requireInternalUser();
  return writeUnitAllocation(input, ctx.appUser?.id ?? null);
}

/**
 * Pure write path for a single asset's allocation — NO auth gate. Callers
 * are responsible for permission-gating before they reach here:
 *   - `recomputeUnitAllocation` (operator action) gates with requireInternalUser
 *   - the aggregation engine gates at the manual action / cron boundary
 * `computedBy` is the actor id (null for cron/system runs).
 */
export async function writeUnitAllocation(
  input: z.input<typeof allocateSchema>,
  computedBy: string | null,
) {
  const parsed = allocateSchema.parse(input);
  const db = requireDb();

  // TENANCY-FINANCE-DOCS — no auth session on the cron/system path, so we
  // copy the org from the parent project (project_id is NOT NULL here and
  // projects.organization_id is NOT NULL, so this is always resolvable).
  const [parentProject] = await db
    .select({ organizationId: projects.organizationId })
    .from(projects)
    .where(eq(projects.id, parsed.projectId))
    .limit(1);
  if (!parentProject) {
    throw new Error(
      `unit-cost-allocation: project ${parsed.projectId} not found`,
    );
  }
  const organizationId = parentProject.organizationId;

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
        organizationId,
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
        computedBy,
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
  const ctx = await requireInternalUser();
  // TENANCY: scope the override to the caller's org so an operator in org A
  // cannot overwrite GENERATED money columns on org B's allocation. The id is
  // client-supplied; the org predicate on the UPDATE is the authorization gate.
  const organizationId = await requireOrgId();
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
    .where(
      and(
        eq(unitCostAllocations.id, parsed.allocationId),
        eq(unitCostAllocations.organizationId, organizationId),
      ),
    )
    .returning();
  if (!row) {
    // 0 rows affected: the allocation does not exist or is not in the caller's
    // org. Don't silently no-op — surface the rejection.
    return {
      ok: false as const,
      error: "Allocation not found in your organization",
    };
  }
  await recordAuditEvent({
    organizationId,
    actorUserId: ctx.appUser?.id ?? null,
    action: "unit_cost_allocation.override",
    entityType: "unit_cost_allocation",
    entityId: row.id,
    after: {
      computationMethod: "manual_override",
      notes: parsed.notes,
      overrides: Object.fromEntries(
        Object.entries(parsed.overrides)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v]),
      ),
    },
  });
  return { ok: true as const, row };
}
