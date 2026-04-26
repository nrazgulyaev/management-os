import { PageHeader } from "@/components/ui/page-header";
import { DbStatusNotice } from "@/components/admin/db-status";
import { SupplierForm } from "@/components/inventory/supplier-form";

export const metadata = { title: "New supplier" };
export const dynamic = "force-dynamic";

export default function NewSupplierPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Inventory", href: "/dashboard/inventory" },
          { label: "Suppliers", href: "/dashboard/inventory/suppliers" },
          { label: "New" },
        ]}
        title="New supplier"
      />
      <DbStatusNotice />
      <SupplierForm cancelHref="/dashboard/inventory/suppliers" />
    </div>
  );
}
