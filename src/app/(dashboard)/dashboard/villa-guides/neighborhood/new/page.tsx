import Link from "next/link";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { PlaceForm } from "@/components/villa-guides/place-form";

export const metadata = { title: "New neighborhood place" };
export const dynamic = "force-dynamic";

export default async function NewPlacePage() {
  const [villas, projects] = await Promise.all([listVillas(), listProjects()]);
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/villa-guides">Villa guides</Link> /{" "}
            <Link href="/dashboard/villa-guides/neighborhood">Neighborhood</Link>{" "}
            / <span>New</span>
          </div>
          <h1>New neighborhood place</h1>
        </div>
      </div>
      <PlaceForm
        villas={villas.map((v) => ({
          id: v.id,
          label: `${v.unitCode} · ${v.projectName}`,
        }))}
        projects={projects.map((p) => ({ id: p.id, label: p.name }))}
      />
    </div>
  );
}
