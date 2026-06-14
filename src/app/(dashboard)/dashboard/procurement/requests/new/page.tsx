import Link from "next/link";
import { DbStatusNotice } from "@/components/admin/db-status";
import { PurchaseRequestForm } from "@/components/procurement/request-form";
import { listSuppliers } from "@/features/inventory/services";
import { listProjects } from "@/features/projects/services";
import { listVillas } from "@/features/villas/services";

export const metadata = { title: "New purchase request" };
export const dynamic = "force-dynamic";

export default async function NewPurchaseRequestPage() {
  const [suppliers, projects, villas] = await Promise.all([
    listSuppliers(),
    listProjects(),
    listVillas(),
  ]);
  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/procurement">Procurement</Link> /{" "}
            <Link href="/dashboard/procurement/requests">Requests</Link> /{" "}
            <span>New</span>
          </div>
          <h1>New purchase request</h1>
        </div>
      </div>
      <DbStatusNotice />
      <PurchaseRequestForm
        suppliers={suppliers.map((s) => ({ id: s.id, label: s.name }))}
        projects={projects.map((p) => ({ id: p.id, label: p.name }))}
        villas={villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }))}
        cancelHref="/dashboard/procurement/requests"
      />
    </div>
  );
}
