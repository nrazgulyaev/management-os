import { PageHeader } from "@/components/ui/page-header";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { RevenueLineForm } from "./form";

export const metadata = { title: "New revenue" };
export const dynamic = "force-dynamic";

export default async function NewRevenuePage() {
  const [villas, projects] = await Promise.all([listVillas(), listProjects()]);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Finance", href: "/dashboard/finance" },
          { label: "Revenue", href: "/dashboard/finance/revenue" },
          { label: "New" },
        ]}
        title="New revenue line"
        description="Persisted to revenue_lines. Period-lock guard runs before insert."
      />
      <DbStatusNotice />
      <RevenueLineForm
        villas={villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }))}
        projects={projects.map((p) => ({ id: p.id, label: p.name }))}
      />
    </div>
  );
}
