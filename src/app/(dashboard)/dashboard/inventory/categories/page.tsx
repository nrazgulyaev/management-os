import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listInventoryCategories } from "@/features/inventory/services";

export const metadata = { title: "Inventory · Categories" };
export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const rows = await listInventoryCategories();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Inventory", href: "/dashboard/inventory" },
          { label: "Categories" },
        ]}
        title="Inventory categories"
        description="Tree of item categories — linens, towels, chemicals, spare parts, FF&E."
      />
      <DbStatusNotice />
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
          No categories yet.
        </p>
      ) : (
        <Table>
          <THead>
            <TR><TH>Name</TH><TH>Key</TH><TH>Default unit</TH><TH>Consumable</TH><TH>Status</TH></TR>
          </THead>
          <TBody>
            {rows.map((c) => (
              <TR key={c.id}>
                <TD className="font-medium">{c.name}</TD>
                <TD className="font-mono text-xs">{c.key}</TD>
                <TD>{c.defaultUnit}</TD>
                <TD>{c.isConsumable ? "Yes" : "No"}</TD>
                <TD><Badge tone={c.status === "active" ? "success" : "neutral"}>{c.status}</Badge></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
