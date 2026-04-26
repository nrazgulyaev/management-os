import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listSuppliers } from "@/features/inventory/services";

export const metadata = { title: "Suppliers" };
export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const rows = await listSuppliers();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Inventory", href: "/dashboard/inventory" },
          { label: "Suppliers" },
        ]}
        title="Suppliers"
        description="Vendors that supply linens, chemicals, electrical, and maintenance services."
        actions={
          <Button asChild>
            <Link href="/dashboard/inventory/suppliers/new">
              <Plus className="w-4 h-4" strokeWidth={1.75} />
              New supplier
            </Link>
          </Button>
        }
      />
      <DbStatusNotice />
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
          No suppliers yet.
        </p>
      ) : (
        <Table>
          <THead>
            <TR><TH>Name</TH><TH>Type</TH><TH>Email</TH><TH>Phone</TH><TH>Country</TH><TH>Status</TH></TR>
          </THead>
          <TBody>
            {rows.map((s) => (
              <TR key={s.id}>
                <TD className="font-medium">{s.name}</TD>
                <TD><Badge tone="outline">{s.supplierType.replace(/_/g, " ")}</Badge></TD>
                <TD className="text-xs text-ink-secondary">{s.email ?? "—"}</TD>
                <TD className="text-xs text-ink-secondary">{s.phone ?? "—"}</TD>
                <TD className="text-xs">{s.country ?? "—"}</TD>
                <TD><Badge tone={s.status === "active" ? "success" : "neutral"}>{s.status}</Badge></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
