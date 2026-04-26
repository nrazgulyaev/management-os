import { PageHeader } from "@/components/ui/page-header";
import { DbStatusNotice } from "@/components/admin/db-status";
import { PurchaseOrderForm } from "@/components/procurement/order-form";
import { listSuppliers } from "@/features/inventory/services";
import { listProjects } from "@/features/projects/services";
import { listVillas } from "@/features/villas/services";

export const metadata = { title: "New purchase order" };
export const dynamic = "force-dynamic";

export default async function NewPurchaseOrderPage() {
  const [suppliers, projects, villas] = await Promise.all([
    listSuppliers(),
    listProjects(),
    listVillas(),
  ]);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Procurement", href: "/dashboard/procurement" },
          { label: "Orders", href: "/dashboard/procurement/orders" },
          { label: "New" },
        ]}
        title="New purchase order"
      />
      <DbStatusNotice />
      <PurchaseOrderForm
        suppliers={suppliers.map((s) => ({ id: s.id, label: s.name }))}
        projects={projects.map((p) => ({ id: p.id, label: p.name }))}
        villas={villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }))}
        cancelHref="/dashboard/procurement/orders"
      />
    </div>
  );
}
