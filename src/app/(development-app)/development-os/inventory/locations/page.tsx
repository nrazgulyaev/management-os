import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listInventoryLocations } from "@/lib/development/server/inventory/inventory-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Inventory locations · Development OS" };
export const dynamic = "force-dynamic";

export default async function InventoryLocationsPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Inventory locations" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const locations = await safeQuery(
    "listInventoryLocations",
    listInventoryLocations(),
    [],
    4000,
  );

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Inventory", href: "/development-os/inventory/items" },
          { label: "Locations" },
        ]}
        eyebrow={`${locations.length} active location${locations.length === 1 ? "" : "s"}`}
        title="Inventory locations"
        description="Warehouses + sites + virtual buckets (in_transit, consumed, damaged, returned). Stock balances are tracked per (item × location)."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/inventory/items">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Items
            </Link>
          </Button>
        }
      />

      {locations.length === 0 ? (
        <EmptyState
          title="No locations yet"
          description="Use the createInventoryLocation server action to add the first."
        />
      ) : (
        <Section eyebrow="Catalog" title="All locations">
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Name</TH>
                <TH>Type</TH>
                <TH>Project</TH>
              </TR>
            </THead>
            <TBody>
              {locations.map((l) => (
                <TR key={l.id}>
                  <TD className="font-mono text-xs">{l.locationCode}</TD>
                  <TD className="text-sm">{l.displayName}</TD>
                  <TD>
                    <Badge tone="neutral">{l.locationType}</Badge>
                  </TD>
                  <TD className="font-mono text-xs">
                    {l.projectId?.slice(0, 8) ?? "—"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Section>
      )}
    </DevelopmentShell>
  );
}
