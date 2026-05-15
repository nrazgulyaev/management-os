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
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { Button } from "@/components/ui/button";
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
        <PageHeader title="Movements quick entry" />
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
        <PageHeader
          breadcrumbs={[
            { label: "Development OS", href: "/development-os" },
            { label: "Inventory", href: "/development-os/inventory" },
            {
              label: "Movements",
              href: "/development-os/inventory/movements",
            },
            { label: "Quick entry" },
          ]}
          title="Movements quick entry"
          description="Type or paste stock movements. Tab/Enter to move across cells; Ctrl/Cmd-S to save. Item + type + qty are required; locations resolved from the catalogue."
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href="/development-os/inventory/movements">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Back to movements
              </Link>
            </Button>
          }
        />

        {items.length === 0 ? (
          <EmptyState
            title="No inventory items configured"
            description="Add at least one inventory item before recording movements."
            action={
              <Link
                href="/development-os/inventory/items/new"
                className="inline-flex items-center px-4 py-2 rounded-sm bg-ink text-ink-inverse text-sm font-medium hover:bg-ink/90"
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
