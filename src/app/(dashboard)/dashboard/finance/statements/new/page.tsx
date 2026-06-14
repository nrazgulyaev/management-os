import Link from "next/link";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listOwners } from "@/features/owners/services";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { listStatementPeriods } from "@/features/finance/services";
import { GenerateStatementForm } from "./form";

export const metadata = { title: "Generate statement" };
export const dynamic = "force-dynamic";

export default async function GenerateStatementPage() {
  const [owners, villas, projects, periods] = await Promise.all([
    listOwners(),
    listVillas(),
    listProjects(),
    listStatementPeriods(),
  ]);
  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/finance">Finance</Link> /{" "}
            <Link href="/dashboard/finance/statements">Statements</Link> /{" "}
            <span>Generate</span>
          </div>
          <h1>Generate owner statement</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Pulls revenue, fees, expenses, taxes, reserves, and management fees
            for the period and allocates by ownership share. Idempotent for
            drafts.
          </p>
        </div>
      </div>
      <DbStatusNotice />
      <GenerateStatementForm
        owners={owners.map((o) => ({ id: o.id, label: o.displayName }))}
        villas={villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }))}
        projects={projects.map((p) => ({ id: p.id, label: p.name }))}
        periods={periods.map((p) => ({
          id: p.id,
          label: `${p.label} (${p.periodStart} → ${p.periodEnd})`,
        }))}
      />
    </div>
  );
}
