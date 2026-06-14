import Link from "next/link";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { DbStatusNotice } from "@/components/admin/db-status";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { listInventoryLocations } from "@/features/inventory/services";
import { InventoryRowActions } from "@/components/dashboard/inventory/inventory-row-actions";
import { AddInventoryLocationButton } from "@/components/dashboard/inventory/inventory-add-buttons";
import { NoItemsYet } from "@/components/ui/primitives";

export const metadata = { title: "Inventory · Locations" };
export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  const rows = await listInventoryLocations();
  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/inventory">Inventory</Link> /{" "}
            <span>Locations</span>
          </div>
          <h1>Storage locations</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Warehouses, villa storage rooms, housekeeping carts, maintenance rooms.
          </p>
        </div>
        <div className="actions">
          <AddInventoryLocationButton />
        </div>
      </div>
      <DbStatusNotice />
      {rows.length === 0 ? (
        <NoItemsYet
          entityLabel="locations"
          description="Warehouses, villa storage rooms, housekeeping carts, maintenance rooms."
          addAction={<AddInventoryLocationButton />}
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
                <TD><HandoffBadge tone="soft">{l.locationType.replace(/_/g, " ")}</HandoffBadge></TD>
                <TD className="text-xs text-ink-secondary">
                  {l.villaCode ? `Villa ${l.villaCode}` : l.projectName ? `Project ${l.projectName}` : "—"}
                </TD>
                <TD><HandoffBadge tone={l.status === "active" ? "ok" : "soft"}>{l.status}</HandoffBadge></TD>
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
