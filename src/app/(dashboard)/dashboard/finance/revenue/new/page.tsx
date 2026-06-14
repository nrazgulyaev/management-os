import Link from "next/link";
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/finance">Finance</Link> /{" "}
            <Link href="/dashboard/finance/revenue">Revenue</Link> /{" "}
            <span>New</span>
          </div>
          <h1>New revenue line</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Persisted to revenue_lines. Period-lock guard runs before insert.
          </p>
        </div>
      </div>
      <DbStatusNotice />
      <RevenueLineForm
        villas={villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }))}
        projects={projects.map((p) => ({ id: p.id, label: p.name }))}
      />
    </div>
  );
}
