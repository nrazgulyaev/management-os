import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import {
  listInventoryItems,
  listInventoryLocations,
} from "@/lib/development/server/inventory/inventory-queries";
import { projects } from "@/lib/db/schema/projects";
import { InventoryMovementForm } from "@/components/development/inventory/movement-form";

export const metadata: Metadata = { title: "New movement · Development OS" };
export const dynamic = "force-dynamic";

export default async function NewInventoryMovementPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>New movement</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const [items, locations, projectRows] = await Promise.all([
    listInventoryItems({ activeOnly: true }),
    listInventoryLocations(),
    db.select({ id: projects.id, name: projects.name }).from(projects),
  ]);

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/inventory/items">Inventory</Link> /{" "}
            <Link href="/development-os/inventory/movements">Movements</Link> /{" "}
            <span>New</span>
          </div>
          <h1>Record inventory movement</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Mobile-friendly form. Stock balances update atomically — refuses to
            drive on-hand negative.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/inventory/movements"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Movements
          </Link>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Form</div>
        <Card padding="default">
          <InventoryMovementForm
          items={items.map((i) => ({
            id: i.id,
            sku: i.sku,
            displayName: i.displayName,
            unitOfMeasure: i.unitOfMeasure,
          }))}
          locations={locations.map((l) => ({
            id: l.id,
            locationCode: l.locationCode,
            displayName: l.displayName,
            locationType: l.locationType,
          }))}
          projects={projectRows}
          />
        </Card>
      </div>
    </DevelopmentShell>
  );
}
