import { PageHeader } from "@/components/ui/page-header";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listOwners } from "@/features/owners/services";
import { listProjects } from "@/features/projects/services";
import { listVillas } from "@/features/villas/services";
import { ShareForm } from "./form";

export const metadata = { title: "New ownership share" };

export default async function NewSharePage() {
  const [owners, projects, villas] = await Promise.all([
    listOwners(),
    listProjects(),
    listVillas(),
  ]);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Owners", href: "/dashboard/owners" },
          { label: "Shares", href: "/dashboard/shares" },
          { label: "New" },
        ]}
        title="New ownership share"
        description="Pooled shares attach to a project; individual or hybrid shares attach to a villa. The platform never lets active shares for a single villa or pool exceed 100%."
      />
      <DbStatusNotice />
      <ShareForm
        owners={owners.map((o) => ({ id: o.id, label: o.displayName }))}
        projects={projects.map((p) => ({ id: p.id, label: p.name }))}
        villas={villas.map((v) => ({
          id: v.id,
          label: `${v.unitCode} · ${v.projectName}`,
        }))}
      />
    </div>
  );
}
