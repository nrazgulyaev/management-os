import { PageHeader } from "@/components/ui/page-header";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { OwnerStayPolicyForm } from "@/components/owner-stays/policy-form";

export const metadata = { title: "New owner stay policy" };
export const dynamic = "force-dynamic";

export default async function NewPolicyPage() {
  const [villas, projects] = await Promise.all([listVillas(), listProjects()]);
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Owner stays", href: "/dashboard/owner-stays" },
          { label: "Policies", href: "/dashboard/owner-stays/policies" },
          { label: "New" },
        ]}
        title="New owner stay policy"
        description="Per-villa beats per-project beats global. Leave both villa and project blank for a global default."
      />
      <OwnerStayPolicyForm
        villas={villas.map((v) => ({
          id: v.id,
          label: `${v.unitCode} · ${v.projectName}`,
        }))}
        projects={projects.map((p) => ({ id: p.id, label: p.name }))}
      />
    </div>
  );
}
