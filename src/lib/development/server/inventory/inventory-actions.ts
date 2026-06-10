"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import {
  devOsInventoryItems,
  devOsInventoryLocations,
  devOsInventoryStockBalances,
  devOsInventoryMovements,
} from "@/lib/db/schema/dev-os-inventory";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import {
  applyMovementToBalance,
  type InventoryMovementType,
} from "./stock-balance-helpers";

/**
 * INV-CODE-RACE — `movement_code` (INV-YYYY-####) is derived from COUNT(*)+1
 * under a UNIQUE constraint, so two concurrent writers can compute the same
 * code and one hits a Postgres unique_violation (SQLSTATE 23505). Bound-retry
 * the whole transaction, re-deriving the code each attempt, so concurrent
 * writes serialize onto distinct codes instead of surfacing a raw collision.
 * Mirrors the 23505 retry in capital-call-actions.ts. Module-private (not a
 * server action) so the "use server" export-only-async rule is preserved.
 */
async function withMovementCodeRetry<T>(run: () => Promise<T>): Promise<T> {
  const MAX_ATTEMPTS = 5;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      return await run();
    } catch (err) {
      const code = (err as { code?: unknown } | null)?.code;
      const message = err instanceof Error ? err.message : String(err);
      const isUniqueViolation = code === "23505" || message.includes("23505");
      if (isUniqueViolation && attempt < MAX_ATTEMPTS - 1) continue;
      throw err;
    }
  }
  // Unreachable: the loop returns or throws on the final attempt.
  throw new Error(
    "Could not allocate a unique inventory movement code after several attempts. Please retry.",
  );
}

const MOVEMENT_TYPES = [
  "received",
  "reserved",
  "unreserved",
  "issued_to_site",
  "used",
  "returned",
  "damaged",
  "lost",
  "transferred",
  "written_off",
  "adjusted",
] as const;

const createItemSchema = z.object({
  sku: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().nullable().optional(),
  category: z.string().min(1),
  unitOfMeasure: z.string().min(1),
  averageCostMinor: z.bigint().nullable().optional(),
  defaultCurrency: z.string().default("IDR"),
  minimumStockLevel: z.number().nonnegative().nullable().optional(),
  reorderPoint: z.number().nonnegative().nullable().optional(),
  preferredVendorId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function createInventoryItem(
  input: z.input<typeof createItemSchema>,
) {
  await requireInternalUser();
  const organizationId = await requireOrgId();
  const parsed = createItemSchema.parse(input);
  const db = requireDb();
  const [row] = await db
    .insert(devOsInventoryItems)
    .values({
      organizationId,
      sku: parsed.sku,
      displayName: parsed.displayName,
      description: parsed.description ?? null,
      category: parsed.category,
      unitOfMeasure: parsed.unitOfMeasure,
      averageCostMinor: parsed.averageCostMinor ?? null,
      defaultCurrency: parsed.defaultCurrency,
      minimumStockLevel:
        parsed.minimumStockLevel != null ? String(parsed.minimumStockLevel) : null,
      reorderPoint:
        parsed.reorderPoint != null ? String(parsed.reorderPoint) : null,
      preferredVendorId: parsed.preferredVendorId ?? null,
      notes: parsed.notes ?? null,
    })
    .returning();
  return row;
}

const recordMovementSchema = z.object({
  itemId: z.string().uuid(),
  movementType: z.enum(MOVEMENT_TYPES),
  quantity: z.number().positive(),
  fromLocationId: z.string().uuid().nullable().optional(),
  toLocationId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  villaId: z.string().uuid().nullable().optional(),
  workPackageId: z.string().uuid().nullable().optional(),
  relatedPoId: z.string().uuid().nullable().optional(),
  relatedDeliveryId: z.string().uuid().nullable().optional(),
  relatedSiteReportId: z.string().uuid().nullable().optional(),
  relatedQaQcIssueId: z.string().uuid().nullable().optional(),
  reason: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  proofDocumentId: z.string().uuid().nullable().optional(),
});

/**
 * Record an inventory movement and update stock balances atomically.
 *
 * Refuses to drive `quantity_on_hand` negative (DB CHECK is the
 * defense-in-depth backstop; we check first to give a clearer error).
 *
 * Auto-generates `movement_code` as INV-YYYY-####.
 */
export async function recordInventoryMovement(
  input: z.input<typeof recordMovementSchema>,
) {
  const ctx = await requireInternalUser();
  const organizationId = await requireOrgId();
  const parsed = recordMovementSchema.parse(input);
  const db = requireDb();
  if (!ctx.appUser?.id) {
    throw new Error("recordInventoryMovement: requires authenticated app user");
  }

  const delta = applyMovementToBalance({
    movementType: parsed.movementType as InventoryMovementType,
    quantity: parsed.quantity,
    fromLocationId: parsed.fromLocationId ?? null,
    toLocationId: parsed.toLocationId ?? null,
  });

  // `movement_code` is derived from COUNT(*)+1 under a UNIQUE constraint, which
  // is racy: two concurrent writers compute the same INV-YYYY-#### and one hits
  // a Postgres unique_violation (SQLSTATE 23505). Bound-retry the whole txn,
  // re-deriving the code each attempt so concurrent writes serialize onto
  // distinct codes (mirrors capital-call-actions.ts).
  return withMovementCodeRetry(() =>
    db.transaction(async (tx) => {
    const [{ count }] = await tx
      .select({ count: sql<string>`COUNT(*)::text` })
      .from(devOsInventoryMovements);
    const year = new Date().getFullYear();
    const seq = String(Number(count ?? "0") + 1).padStart(4, "0");
    const movementCode = `INV-${year}-${seq}`;

    // 1) Insert the movement row (immutable audit log).
    const [movement] = await tx
      .insert(devOsInventoryMovements)
      .values({
        organizationId,
        movementCode,
        itemId: parsed.itemId,
        quantity: String(parsed.quantity),
        movementType: parsed.movementType,
        fromLocationId: parsed.fromLocationId ?? null,
        toLocationId: parsed.toLocationId ?? null,
        projectId: parsed.projectId ?? null,
        villaId: parsed.villaId ?? null,
        workPackageId: parsed.workPackageId ?? null,
        relatedPoId: parsed.relatedPoId ?? null,
        relatedDeliveryId: parsed.relatedDeliveryId ?? null,
        relatedSiteReportId: parsed.relatedSiteReportId ?? null,
        relatedQaQcIssueId: parsed.relatedQaQcIssueId ?? null,
        responsibleUserId: ctx.appUser!.id,
        movementDate: new Date().toISOString().slice(0, 10),
        reason: parsed.reason ?? null,
        notes: parsed.notes ?? null,
        proofDocumentId: parsed.proofDocumentId ?? null,
      })
      .returning();

    // 2) Apply debit if any. Pre-check to give a clearer error than the
    //    DB CHECK would.
    if (delta.debitLocationId) {
      const [bal] = await tx
        .select()
        .from(devOsInventoryStockBalances)
        .where(
          and(
            eq(devOsInventoryStockBalances.itemId, parsed.itemId),
            eq(
              devOsInventoryStockBalances.locationId,
              delta.debitLocationId,
            ),
          ),
        )
        .limit(1);
      const onHand = Number(bal?.quantityOnHand ?? "0");
      if (onHand < delta.quantity) {
        throw new Error(
          `inventory: insufficient stock — ${delta.debitLocationId} has ${onHand}, requested ${delta.quantity}`,
        );
      }
      await tx
        .update(devOsInventoryStockBalances)
        .set({
          quantityOnHand: sql`${devOsInventoryStockBalances.quantityOnHand} - ${delta.quantity}`,
          lastMovementAt: new Date(),
        })
        .where(
          and(
            eq(devOsInventoryStockBalances.itemId, parsed.itemId),
            eq(
              devOsInventoryStockBalances.locationId,
              delta.debitLocationId,
            ),
            eq(devOsInventoryStockBalances.organizationId, organizationId),
          ),
        );
    }

    // 3) Apply credit if any. UPSERT pattern — create the (item, location)
    //    pair if it doesn't exist yet.
    if (delta.creditLocationId) {
      const [existing] = await tx
        .select()
        .from(devOsInventoryStockBalances)
        .where(
          and(
            eq(devOsInventoryStockBalances.itemId, parsed.itemId),
            eq(
              devOsInventoryStockBalances.locationId,
              delta.creditLocationId,
            ),
          ),
        )
        .limit(1);

      if (existing) {
        const updates: Record<string, unknown> = {
          lastMovementAt: new Date(),
        };
        if (delta.quantity > 0) {
          updates.quantityOnHand = sql`${devOsInventoryStockBalances.quantityOnHand} + ${delta.quantity}`;
        }
        if (delta.affectsReserved) {
          updates.quantityReserved = sql`${devOsInventoryStockBalances.quantityReserved} + ${delta.reservedDelta}`;
        }
        await tx
          .update(devOsInventoryStockBalances)
          .set(updates)
          .where(
            and(
              eq(devOsInventoryStockBalances.id, existing.id),
              eq(devOsInventoryStockBalances.organizationId, organizationId),
            ),
          );
      } else {
        await tx.insert(devOsInventoryStockBalances).values({
          organizationId,
          itemId: parsed.itemId,
          locationId: delta.creditLocationId,
          quantityOnHand: String(delta.quantity),
          quantityReserved: delta.affectsReserved
            ? String(Math.max(delta.reservedDelta, 0))
            : "0",
          lastMovementAt: new Date(),
        });
      }
    }

    return movement;
    }),
  );
}

const _transferSchema = z.object({
  itemId: z.string().uuid(),
  fromLocationId: z.string().uuid(),
  toLocationId: z.string().uuid(),
  quantity: z.number().positive(),
  projectId: z.string().uuid().nullable().optional(),
  reason: z.string().nullable().optional(),
});

/** Convenience wrapper: transfer between locations. */
export async function transferInventory(
  input: z.input<typeof _transferSchema>,
) {
  return recordInventoryMovement({
    itemId: input.itemId,
    movementType: "transferred",
    quantity: input.quantity,
    fromLocationId: input.fromLocationId,
    toLocationId: input.toLocationId,
    projectId: input.projectId ?? null,
    reason: input.reason ?? null,
  });
}

const createLocationSchema = z.object({
  locationCode: z.string().min(1),
  displayName: z.string().min(1),
  locationType: z.enum([
    "warehouse",
    "site",
    "in_transit",
    "consumed",
    "damaged",
    "returned",
  ]),
  projectId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function createInventoryLocation(
  input: z.input<typeof createLocationSchema>,
) {
  await requireInternalUser();
  const organizationId = await requireOrgId();
  const parsed = createLocationSchema.parse(input);
  const db = requireDb();
  const [row] = await db
    .insert(devOsInventoryLocations)
    .values({
      organizationId,
      locationCode: parsed.locationCode,
      displayName: parsed.displayName,
      locationType: parsed.locationType,
      projectId: parsed.projectId ?? null,
      notes: parsed.notes ?? null,
    })
    .returning();
  return row;
}
