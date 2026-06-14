import Link from "next/link";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listSuppliers } from "@/features/inventory/services";
import { InventoryRowActions } from "@/components/dashboard/inventory/inventory-row-actions";
import { AddSupplierButton } from "@/components/dashboard/inventory/inventory-add-buttons";
import { NoItemsYet } from "@/components/ui/primitives";

export const metadata = { title: "Suppliers" };
export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const rows = await listSuppliers();
  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/inventory">Inventory</Link> /{" "}
            <span>Suppliers</span>
          </div>
          <h1>Suppliers</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Vendors that supply linens, chemicals, electrical, and maintenance
            services.
          </p>
        </div>
        <div className="actions">
          <AddSupplierButton />
        </div>
      </div>
      <DbStatusNotice />
      {rows.length === 0 ? (
        <NoItemsYet
          entityLabel="suppliers"
          description="Vendors that supply linens, chemicals, electrical, and maintenance services."
          addAction={<AddSupplierButton />}
        />
      ) : (
        <Table>
          <THead>
            <TR><TH>Name</TH><TH>Type</TH><TH>Email</TH><TH>Phone</TH><TH>Country</TH><TH>Status</TH><TH /></TR>
          </THead>
          <TBody>
            {rows.map((s) => (
              <TR key={s.id}>
                <TD className="font-medium">{s.name}</TD>
                <TD><HandoffBadge tone="soft">{s.supplierType.replace(/_/g, " ")}</HandoffBadge></TD>
                <TD className="text-xs text-ink-secondary">{s.email ?? "—"}</TD>
                <TD className="text-xs text-ink-secondary">{s.phone ?? "—"}</TD>
                <TD className="text-xs">{s.country ?? "—"}</TD>
                <TD><HandoffBadge tone={s.status === "active" ? "ok" : "soft"}>{s.status}</HandoffBadge></TD>
                <TD className="text-right">
                  <InventoryRowActions kind="supplier" row={s} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
