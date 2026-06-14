import Link from "next/link";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { UtilityAccountForm } from "@/components/utilities/account-form";

export const metadata = { title: "New utility account" };
export const dynamic = "force-dynamic";

export default async function NewAccountPage() {
  const [villas, projects] = await Promise.all([listVillas(), listProjects()]);
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/utilities">Utilities</Link> /{" "}
            <Link href="/dashboard/utilities/accounts">Accounts</Link> /{" "}
            <span>New</span>
          </div>
          <h1>New utility account</h1>
        </div>
      </div>
      <UtilityAccountForm
        villas={villas.map((v) => ({
          id: v.id,
          label: `${v.unitCode} · ${v.projectName}`,
        }))}
        projects={projects.map((p) => ({ id: p.id, label: p.name }))}
      />
    </div>
  );
}
