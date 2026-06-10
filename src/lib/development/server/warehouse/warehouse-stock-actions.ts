"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { requireInternalUser } from "@/features/auth/permissions";
import { recordAuditEvent } from "@/features/audit/services";
import {
  devOsInventoryItems,
  devOsInventoryLocations,
  devOsInventoryStockBalances,
  devOsInventoryMovements,
} from "@/lib/db/schema/dev-os-inventory";
import type { CycleCountResult } from "./warehouse-inbound-types";

/**
 * Warehouse cycle-count adjustment (dev-warehouse mock §01 "+ Adjustment").
 *
 * A cycle count: the operator physically counts a SKU at a warehouse
 * location and submits the counted quantity. The action computes the
 * variance vs the recorded on-hand and posts ONE `adjusted` movement
 * into `dev_os_inventory_movements`, crediting (count > on-hand) or
 * debiting (count < on-hand) the balance to match reality.
 *
 * Org-scoped on every read + write (`requireOrgId`), audit-logged. The
 * movement quantity is always positive — direction is encoded by which
 * location field is set, mirroring `applyMovementToBalance("adjusted")`.
 */

/**
 * INV-CODE-RACE — `movement_code` (INV-YYYY-####) is derived from COUNT(*)+1
 * under a UNIQUE constraint, so concurrent writers can compute the same code
 * and one hits a Postgres unique_violation (SQLSTATE 23505). Bound-retry the
 * whole transaction, re-deriving the code each attempt. Mirrors the 23505 retry
 * in capital-call-actions.ts. Module-private (not a server action) so the
 * "use server" export-only-async rule is preserved.
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

const countSchema = z.object({
  itemId: z.string().uuid(),
  locationId: z.string().uuid(),
  countedQuantity: z.number().min(0),
  reason: z.string().trim().max(2000).optional().nullable(),
});

export async function recordCycleCount(
  input: z.input<typeof countSchema>,
): Promise<CycleCountResult> {
  const parsed = countSchema.parse(input);
  const ctx = await requireInternalUser();
  const organizationId = await requireOrgId();
  const db = requireDb();
  const actorId = ctx.appUser?.id ?? null;
  if (!actorId) {
    throw new Error("recordCycleCount: requires an authenticated app user");
  }

  // `movement_code` (INV-YYYY-####) is COUNT(*)+1 under a UNIQUE constraint, so
  // concurrent cycle counts can collide on the same code. Bound-retry the whole
  // txn, re-deriving the code each attempt (mirrors capital-call-actions.ts).
  return withMovementCodeRetry(() =>
    db.transaction(async (tx) => {
    // Guard: item + location belong to this org.
    const [item] = await tx
      .select({ id: devOsInventoryItems.id, sku: devOsInventoryItems.sku })
      .from(devOsInventoryItems)
      .where(
        and(
          eq(devOsInventoryItems.id, parsed.itemId),
          eq(devOsInventoryItems.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!item) throw new Error("Inventory item not found");

    const [location] = await tx
      .select({
        id: devOsInventoryLocations.id,
        code: devOsInventoryLocations.locationCode,
      })
      .from(devOsInventoryLocations)
      .where(
        and(
          eq(devOsInventoryLocations.id, parsed.locationId),
          eq(devOsInventoryLocations.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!location) throw new Error("Warehouse location not found");

    const [balance] = await tx
      .select({
        id: devOsInventoryStockBalances.id,
        onHand: devOsInventoryStockBalances.quantityOnHand,
      })
      .from(devOsInventoryStockBalances)
      .where(
        and(
          eq(devOsInventoryStockBalances.itemId, parsed.itemId),
          eq(devOsInventoryStockBalances.locationId, parsed.locationId),
          eq(devOsInventoryStockBalances.organizationId, organizationId),
        ),
      )
      .limit(1);
    const previousOnHand = balance ? Number(balance.onHand) : 0;
    const variance = parsed.countedQuantity - previousOnHand;

    if (variance === 0) {
      // Atomic with the txn (mirrors the variance != 0 path below).
      await recordAuditEvent(
        {
          actorUserId: actorId,
          action: "warehouse.cycle_count",
          entityType: "dev_os_inventory_item",
          entityId: parsed.itemId,
          after: {
            organizationId,
            sku: item.sku,
            locationCode: location.code,
            countedQuantity: parsed.countedQuantity,
            previousOnHand,
            variance: 0,
            noChange: true,
          },
        },
        { tx },
      );
      return {
        movementId: null,
        movementCode: null,
        previousOnHand,
        countedQuantity: parsed.countedQuantity,
        variance: 0,
        noChange: true,
      };
    }

    // Movement code INV-YYYY-####.
    const [{ count }] = await tx
      .select({ count: sql<string>`COUNT(*)::text` })
      .from(devOsInventoryMovements);
    const year = new Date().getFullYear();
    const movementCode = `INV-${year}-${String(Number(count ?? "0") + 1).padStart(4, "0")}`;
    const magnitude = Math.abs(variance);
    const isCredit = variance > 0;

    const [movement] = await tx
      .insert(devOsInventoryMovements)
      .values({
        organizationId,
        movementCode,
        itemId: parsed.itemId,
        quantity: magnitude.toFixed(4),
        movementType: "adjusted",
        // Credit (count up) sets toLocation; debit (count down) sets from.
        toLocationId: isCredit ? parsed.locationId : null,
        fromLocationId: isCredit ? null : parsed.locationId,
        responsibleUserId: actorId,
        movementDate: new Date().toISOString().slice(0, 10),
        reason:
          parsed.reason?.trim() ||
          `Cycle count · ${item.sku} @ ${location.code}`,
      })
      .returning({ id: devOsInventoryMovements.id });

    // Apply the balance delta (UPSERT). On a count-down the DB CHECK keeps
    // on-hand >= 0; we pre-check for a clearer error.
    if (balance) {
      if (!isCredit && previousOnHand < magnitude) {
        throw new Error(
          `Cannot count below zero — on-hand ${previousOnHand}, counted ${parsed.countedQuantity}`,
        );
      }
      await tx
        .update(devOsInventoryStockBalances)
        .set({
          quantityOnHand: isCredit
            ? sql`${devOsInventoryStockBalances.quantityOnHand} + ${magnitude}`
            : sql`${devOsInventoryStockBalances.quantityOnHand} - ${magnitude}`,
          lastMovementAt: new Date(),
        })
        .where(
          and(
            eq(devOsInventoryStockBalances.id, balance.id),
            eq(devOsInventoryStockBalances.organizationId, organizationId),
          ),
        );
    } else {
      // No balance row yet — only a count-up makes sense.
      await tx.insert(devOsInventoryStockBalances).values({
        organizationId,
        itemId: parsed.itemId,
        locationId: parsed.locationId,
        quantityOnHand: parsed.countedQuantity.toFixed(4),
        quantityReserved: "0",
        lastMovementAt: new Date(),
      });
    }

    // Atomic with the movement + balance write: pass the txn handle so the
    // audit row commits/rolls back together with the stock adjustment.
    await recordAuditEvent(
      {
        actorUserId: actorId,
        action: "warehouse.cycle_count",
        entityType: "dev_os_inventory_movement",
        entityId: movement.id,
        after: {
          organizationId,
          sku: item.sku,
          locationCode: location.code,
          movementCode,
          countedQuantity: parsed.countedQuantity,
          previousOnHand,
          variance,
        },
      },
      { tx },
    );

    return {
      movementId: movement.id,
      movementCode,
      previousOnHand,
      countedQuantity: parsed.countedQuantity,
      variance,
      noChange: false,
    };
    }),
  );
}
