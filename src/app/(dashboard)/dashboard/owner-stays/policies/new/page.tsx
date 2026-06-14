import Link from "next/link";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { OwnerStayPolicyForm } from "@/components/owner-stays/policy-form";

export const metadata = { title: "New owner stay policy" };
export const dynamic = "force-dynamic";

export default async function NewPolicyPage() {
  const [villas, projects] = await Promise.all([listVillas(), listProjects()]);
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/owner-stays">Owner stays</Link> /{" "}
            <Link href="/dashboard/owner-stays/policies">Policies</Link> /{" "}
            <span>New</span>
          </div>
          <h1>New owner stay policy</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Per-villa beats per-project beats global. Leave both villa and
            project blank for a global default.
          </p>
        </div>
      </div>
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
