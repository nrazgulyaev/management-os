import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { listInventoryLocations } from "@/features/inventory/services";
import { InventoryRowActions } from "@/components/dashboard/inventory/inventory-row-actions";
import { NoItemsYet } from "@/components/ui/primitives";

export const metadata = { title: "Inventory · Locations" };
export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  const rows = await listInventoryLocations();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Inventory", href: "/dashboard/inventory" },
          { label: "Locations" },
        ]}
        title="Storage locations"
        description="Warehouses, villa storage rooms, housekeeping carts, maintenance rooms."
        actions={
          <Button asChild>
            <Link href="/dashboard/inventory/locations/new">
              <Plus className="w-4 h-4" strokeWidth={1.75} />
              New location
            </Link>
          </Button>
        }
      />
      <DbStatusNotice />
      {rows.length === 0 ? (
        <NoItemsYet
          entityLabel="locations"
          description="Warehouses, villa storage rooms, housekeeping carts, maintenance rooms."
          addHref="/dashboard/inventory/locations/new"
          addLabel="New location"
        />
      ) : (
        <Table>
          <THead>
            <TR><TH>Name</TH><TH>Type</TH><TH>Linked to</TH><TH>Status</TH><TH /></TR>
          </THead>
          <TBody>
            {rows.map((l) => (
              <TR key={l.id}>
                <TD className="font-medium">{l.name}</TD>
                <TD><Badge tone="outline">{l.locationType.replace(/_/g, " ")}</Badge></TD>
                <TD className="text-xs text-ink-secondary">
                  {l.villaCode ? `Villa ${l.villaCode}` : l.projectName ? `Project ${l.projectName}` : "—"}
                </TD>
                <TD><Badge tone={l.status === "active" ? "success" : "neutral"}>{l.status}</Badge></TD>
                <TD className="text-right">
                  <InventoryRowActions
                    kind="location"
                    row={{
                      id: l.id,
                      name: l.name,
                      locationType: l.locationType,
                      description: l.description ?? null,
                    }}
                  />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
