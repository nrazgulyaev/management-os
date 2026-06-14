import Link from "next/link";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { GuideSectionForm } from "@/components/villa-guides/section-form";

export const metadata = { title: "New guide section" };
export const dynamic = "force-dynamic";

export default async function NewSectionPage() {
  const [villas, projects] = await Promise.all([listVillas(), listProjects()]);
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/villa-guides">Villa guides</Link> /{" "}
            <Link href="/dashboard/villa-guides/sections">Sections</Link> /{" "}
            <span>New</span>
          </div>
          <h1>New guide section</h1>
        </div>
      </div>
      <GuideSectionForm
        villas={villas.map((v) => ({
          id: v.id,
          label: `${v.unitCode} · ${v.projectName}`,
        }))}
        projects={projects.map((p) => ({ id: p.id, label: p.name }))}
      />
    </div>
  );
}
