import Link from "next/link";
import { DbStatusNotice } from "@/components/admin/db-status";
import { DamageReportForm } from "@/components/operations/damage-form";
import { listVillas } from "@/features/villas/services";

export const metadata = { title: "New damage report" };
export const dynamic = "force-dynamic";

export default async function NewDamageReportPage({
  searchParams,
}: {
  searchParams: Promise<{ villaId?: string; taskId?: string }>;
}) {
  const sp = await searchParams;
  const villas = await listVillas();
  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/operations">Operations</Link> /{" "}
            <Link href="/dashboard/operations/damage-reports">Damage reports</Link> /{" "}
            <span>New</span>
          </div>
          <h1>Log damage</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Capture damage details, severity, and chargeability.
          </p>
        </div>
      </div>
      <DbStatusNotice />
      <DamageReportForm
        villas={villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }))}
        defaultVillaId={sp.villaId}
        defaultTaskId={sp.taskId}
        cancelHref="/dashboard/operations/damage-reports"
      />
    </div>
  );
}
