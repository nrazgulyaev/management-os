"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { requireInternalUser } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import {
  devOsInventoryItems,
  devOsInventoryLocations,
} from "@/lib/db/schema/dev-os-inventory";
import { recordInventoryMovement } from "./inventory-actions";

/**
 * Sprint MD-1 — Bulk insert for
 * `/development-os/inventory/movements/quick-entry`.
 *
 * Mirrors the Sprint-4 bookkeeper recipe (`bulkRecordTransactions`):
 * each row validated independently, invalid rows return a per-row
 * error string, valid rows persist via the existing atomic
 * `recordInventoryMovement` (which updates stock balances + emits
 * the immutable audit log row inside one DB transaction).
 *
 * Per-row catalog lookups:
 *   - `itemSku` resolved case-insensitively against
 *     `dev_os_inventory_items.sku` and `display_name`.
 *   - `fromLocation` / `toLocation` resolved against
 *     `dev_os_inventory_locations.code` / `display_name`.
 *
 * No "warehouseId" wrapper field — the spec mentions one, but Dev OS
 * inventory is keyed at the location level (warehouses ARE
 * locations). The optional `defaultToLocationId` action arg lets the
 * UI pre-fill the credit location for "received" rows without
 * requiring it per row.
 */

const MOVEMENT_TYPES = [
  "received",
  "issued_to_site",
  "transferred",
  "damaged",
  "lost",
  "returned",
  "written_off",
  "adjusted",
] as const;

const bulkRowSchema = z.object({
  /** ISO 8601 date string (YYYY-MM-DD). */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** SKU OR display_name; case-insensitive resolution. */
  itemSku: z.string().min(1),
  movementType: z.enum(MOVEMENT_TYPES),
  quantity: z.union([z.number(), z.string()]),
  /** Optional from-location code or name (debit side). */
  fromLocation: z.string().optional().nullable(),
  /** Optional to-location code or name (credit side). */
  toLocation: z.string().optional().nullable(),
  /**
   * Free-text reference (e.g. "PO-2025-0142" or "PR-2025-0085"). The
   * action treats it as a `reason` string; downstream FK resolution
   * to material_purchase_orders is downstream work — Sprint 4 import
   * recipe handled FKs the same loose-string-into-notes way.
   */
  reference: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
});

export type BulkMovementRow = z.input<typeof bulkRowSchema>;

const bulkInputSchema = z.object({
  /** Optional default credit-location for "received" rows. */
  defaultToLocationId: z.string().uuid().optional().nullable(),
  movements: z.array(bulkRowSchema).max(500),
});

export interface BulkMovementRowResult {
  rowIndex: number;
  ok: boolean;
  movementId?: string;
  movementCode?: string;
  error?: string;
}

export interface BulkMovementResult {
  totalRows: number;
  successCount: number;
  errorCount: number;
  results: BulkMovementRowResult[];
}

export async function bulkInsertMovements(
  input: z.input<typeof bulkInputSchema>,
): Promise<BulkMovementResult> {
  await requireInternalUser();
  const organizationId = await requireOrgId();
  const parsed = bulkInputSchema.parse(input);
  const db = requireDb();

  // Pre-load item + location catalogues so the loop never hits DB
  // for resolution. TENANCY — scope both catalogues to the caller's org so a
  // SKU/name cannot resolve to another tenant's item/location id.
  const items = await db
    .select({
      id: devOsInventoryItems.id,
      sku: devOsInventoryItems.sku,
      displayName: devOsInventoryItems.displayName,
      isActive: devOsInventoryItems.isActive,
    })
    .from(devOsInventoryItems)
    .where(eq(devOsInventoryItems.organizationId, organizationId));
  const itemBySku = new Map<string, string>();
  for (const it of items) {
    if (!it.isActive) continue;
    itemBySku.set(it.sku.trim().toLowerCase(), it.id);
    itemBySku.set(it.displayName.trim().toLowerCase(), it.id);
  }

  const locations = await db
    .select({
      id: devOsInventoryLocations.id,
      locationCode: devOsInventoryLocations.locationCode,
      displayName: devOsInventoryLocations.displayName,
    })
    .from(devOsInventoryLocations)
    .where(eq(devOsInventoryLocations.organizationId, organizationId));
  const locByCode = new Map<string, string>();
  for (const l of locations) {
    locByCode.set(l.locationCode.trim().toLowerCase(), l.id);
    locByCode.set(l.displayName.trim().toLowerCase(), l.id);
  }

  const results: BulkMovementRowResult[] = [];
  for (let i = 0; i < parsed.movements.length; i++) {
    const r = parsed.movements[i];
    try {
      const itemKey = r.itemSku.trim().toLowerCase();
      const itemId = itemBySku.get(itemKey);
      if (!itemId) {
        results.push({
          rowIndex: i,
          ok: false,
          error: `item_not_found: ${r.itemSku}`,
        });
        continue;
      }
      let fromLocationId: string | null = null;
      if (r.fromLocation) {
        fromLocationId = locByCode.get(r.fromLocation.trim().toLowerCase()) ?? null;
        if (!fromLocationId) {
          results.push({
            rowIndex: i,
            ok: false,
            error: `from_location_not_found: ${r.fromLocation}`,
          });
          continue;
        }
      }
      let toLocationId: string | null = null;
      if (r.toLocation) {
        toLocationId = locByCode.get(r.toLocation.trim().toLowerCase()) ?? null;
        if (!toLocationId) {
          results.push({
            rowIndex: i,
            ok: false,
            error: `to_location_not_found: ${r.toLocation}`,
          });
          continue;
        }
      } else if (
        r.movementType === "received" &&
        parsed.defaultToLocationId
      ) {
        toLocationId = parsed.defaultToLocationId;
      }
      const qty = Number(r.quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        results.push({
          rowIndex: i,
          ok: false,
          error: "quantity_invalid",
        });
        continue;
      }

      const noteParts = [r.note?.trim(), r.reference ? `ref: ${r.reference.trim()}` : null]
        .filter(Boolean);
      const reason = r.date && r.date !== new Date().toISOString().slice(0, 10)
        ? `recorded for ${r.date}`
        : null;

      const movement = await recordInventoryMovement({
        itemId,
        movementType: r.movementType,
        quantity: qty,
        fromLocationId,
        toLocationId,
        reason,
        notes: noteParts.length > 0 ? noteParts.join(" · ") : null,
      });
      results.push({
        rowIndex: i,
        ok: true,
        movementId: movement.id,
        movementCode: movement.movementCode,
      });
    } catch (err) {
      results.push({
        rowIndex: i,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const successCount = results.filter((r) => r.ok).length;
  return {
    totalRows: parsed.movements.length,
    successCount,
    errorCount: results.length - successCount,
    results,
  };
}
