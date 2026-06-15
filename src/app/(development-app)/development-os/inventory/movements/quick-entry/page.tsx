/**
 * Sprint MD-1 — Inventory movements quick-entry route.
 *
 * Server page that loads inventory items + locations, mounts the
 * <MovementsQuickEntryForm> client island wrapping <SpreadsheetView>.
 * Optional "default receiving location" at the top — sets the credit
 * side for `received` rows that don't carry an explicit to-location.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { safeQuery } from "@/lib/development/safe-query";
import {
  devOsInventoryItems,
  devOsInventoryLocations,
} from "@/lib/db/schema/dev-os-inventory";
import {
  MovementsQuickEntryForm,
  type InventoryLocationOption,
} from "./quick-entry-form";

export const metadata: Metadata = {
  title: "Movements quick entry · Development OS",
};
export const dynamic = "force-dynamic";

export default async function MovementsQuickEntryPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Movements quick entry</h1>
          </div>
        </div>
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL to use inventory movement quick entry."
        />
      </DevelopmentShell>
    );
  }

  const [items, locations] = await Promise.all([
    safeQuery(
      "inventory-items",
      db
        .select({
          sku: devOsInventoryItems.sku,
          displayName: devOsInventoryItems.displayName,
        })
        .from(devOsInventoryItems)
        .where(eq(devOsInventoryItems.isActive, true))
        .orderBy(asc(devOsInventoryItems.sku)),
      [] as Array<{ sku: string; displayName: string }>,
    ),
    safeQuery(
      "inventory-locations",
      db
        .select({
          id: devOsInventoryLocations.id,
          locationCode: devOsInventoryLocations.locationCode,
          displayName: devOsInventoryLocations.displayName,
        })
        .from(devOsInventoryLocations)
        .orderBy(asc(devOsInventoryLocations.locationCode)),
      [] as Array<{ id: string; locationCode: string; displayName: string }>,
    ),
  ]);

  const itemHints = items.map((i) => i.sku);
  const itemNames = items.map((i) => i.displayName);
  const locationOptions: InventoryLocationOption[] = locations.map((l) => ({
    id: l.id,
    label: `${l.locationCode} · ${l.displayName}`,
    code: l.locationCode,
  }));

  return (
    <DevelopmentShell>
      <div className="flex flex-col gap-6">
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os">Development OS</Link> /{" "}
              <Link href="/development-os/inventory">Inventory</Link> /{" "}
              <Link href="/development-os/inventory/movements">Movements</Link> /{" "}
              <span>Quick entry</span>
            </div>
            <h1>Movements quick entry</h1>
            <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
              Type or paste stock movements. Tab/Enter to move across cells;
              Ctrl/Cmd-S to save. Item + type + qty are required; locations
              resolved from the catalogue.
            </p>
          </div>
          <div className="actions">
            <Link
              href="/development-os/inventory/movements"
              className="btn btn-secondary btn-sm"
            >
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Back to movements
            </Link>
          </div>
        </div>

        {items.length === 0 ? (
          <EmptyState
            title="No inventory items configured"
            description="Add at least one inventory item before recording movements."
            action={
              <Link
                href="/development-os/inventory/items/new"
                className="btn btn-accent"
              >
                New item
              </Link>
            }
          />
        ) : (
          <MovementsQuickEntryForm
            itemSkus={itemHints}
            itemNames={itemNames}
            locations={locationOptions}
          />
        )}
      </div>
    </DevelopmentShell>
  );
}
