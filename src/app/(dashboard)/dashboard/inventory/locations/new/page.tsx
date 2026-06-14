import Link from "next/link";
import { DbStatusNotice } from "@/components/admin/db-status";
import { LocationForm } from "@/components/inventory/location-form";
import { listProjects } from "@/features/projects/services";
import { listVillas } from "@/features/villas/services";

export const metadata = { title: "New location" };
export const dynamic = "force-dynamic";

export default async function NewLocationPage() {
  const [projects, villas] = await Promise.all([listProjects(), listVillas()]);
  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/inventory">Inventory</Link> /{" "}
            <Link href="/dashboard/inventory/locations">Locations</Link> /{" "}
            <span>New</span>
          </div>
          <h1>New storage location</h1>
        </div>
      </div>
      <DbStatusNotice />
      <LocationForm
        projects={projects.map((p) => ({ id: p.id, label: p.name }))}
        villas={villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }))}
        cancelHref="/dashboard/inventory/locations"
      />
    </div>
  );
}
