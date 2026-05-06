import { PageHeader } from "@/components/ui/page-header";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { CreateRatePlanForm } from "@/components/pricing/create-rate-plan-form";

export const metadata = { title: "New rate plan" };
export const dynamic = "force-dynamic";

export default async function NewRatePlanPage() {
  const [villas, projects] = await Promise.all([listVillas(), listProjects()]);
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Bookings", href: "/dashboard/bookings" },
          { label: "Rate plans", href: "/dashboard/bookings/rates" },
          { label: "New" },
        ]}
        title="New rate plan"
      />
      <CreateRatePlanForm
        villas={villas.map((v) => ({
          id: v.id,
          label: `${v.unitCode} · ${v.projectName}`,
        }))}
        projects={projects.map((p) => ({ id: p.id, label: p.name }))}
      />
    </div>
  );
}
