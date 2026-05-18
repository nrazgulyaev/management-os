import { notFound } from "next/navigation";
import { SectionHeading } from "@/components/dashboard/primitives";
import { DbStatusNotice } from "@/components/admin/db-status";
import { VillaForm } from "@/features/villas/form";
import { getVillaById } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";

export const metadata = { title: "Edit villa" };
export const dynamic = "force-dynamic";

export default async function EditVillaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [villa, projects] = await Promise.all([getVillaById(id), listProjects()]);
  if (!villa) notFound();

  return (
    <div className="flex flex-col gap-8">
      <SectionHeading
        eyebrow={`Portfolio · villas · ${villa.name ?? villa.unitCode} · edit`}
        title={`Edit · ${villa.name ?? villa.unitCode}`}
        subtitle="Updates produce an audit event."
      />
      <DbStatusNotice />
      <VillaForm
        mode="edit"
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        defaults={{
          id: villa.id,
          projectId: villa.projectId,
          unitCode: villa.unitCode,
          slug: villa.slug,
          name: villa.name,
          status: villa.status,
          bedrooms: villa.bedrooms,
          bathrooms: villa.bathrooms,
          builtAreaSqm: villa.builtAreaSqm,
          landAreaSqm: villa.landAreaSqm,
          poolAreaSqm: villa.poolAreaSqm,
          viewType: villa.viewType,
          managementModel: villa.managementModel,
          currentNightlyRateUsd: villa.currentNightlyRateUsd,
        }}
        cancelHref={`/dashboard/villas/${villa.id}`}
      />
    </div>
  );
}
