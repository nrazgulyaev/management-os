import Link from "next/link";
import { DbStatusNotice } from "@/components/admin/db-status";
import { SupplierForm } from "@/components/inventory/supplier-form";

export const metadata = { title: "New supplier" };
export const dynamic = "force-dynamic";

export default function NewSupplierPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/inventory">Inventory</Link> /{" "}
            <Link href="/dashboard/inventory/suppliers">Suppliers</Link> /{" "}
            <span>New</span>
          </div>
          <h1>New supplier</h1>
        </div>
      </div>
      <DbStatusNotice />
      <SupplierForm cancelHref="/dashboard/inventory/suppliers" />
    </div>
  );
}
