import "server-only";

import Link from "next/link";
import { ServiceEditorForm } from "@/components/guest-services/service-editor";
import { listCategories } from "@/features/guest-services/services";
import { listProjects } from "@/features/projects/services";
import { listVillas } from "@/features/villas/services";

export const metadata = { title: "New service" };
export const dynamic = "force-dynamic";

export default async function NewServicePage() {
  const [categories, projects, villas] = await Promise.all([
    listCategories(),
    listProjects(),
    listVillas(),
  ]);
  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/guest-services">Guest services</Link> /{" "}
            <Link href="/dashboard/guest-services/catalog">Catalog</Link> /{" "}
            <span>New</span>
          </div>
          <h1>New service</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Leave both project and villa empty for a global service. Set villa
            to override a project-scoped row for a single property.
          </p>
        </div>
      </div>

      <h2 className="display text-[22px] font-normal mb-3.5">Service details</h2>
      <div className="card px-5 py-[18px]">
        <ServiceEditorForm
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          villas={villas.map((v) => ({
            id: v.id,
            unitCode: v.unitCode,
            projectName: v.projectName,
          }))}
        />
      </div>
    </>
  );
}
