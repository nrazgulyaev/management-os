import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
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
        <PageHeader title="New movement" />
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
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Inventory", href: "/development-os/inventory/items" },
          { label: "Movements", href: "/development-os/inventory/movements" },
          { label: "New" },
        ]}
        title="Record inventory movement"
        description="Mobile-friendly form. Stock balances update atomically — refuses to drive on-hand negative."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/inventory/movements">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Movements
            </Link>
          </Button>
        }
      />
      <Section eyebrow="Form" title="Movement details">
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
      </Section>
    </DevelopmentShell>
  );
}
