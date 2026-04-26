import { PageHeader } from "@/components/ui/page-header";
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
      <PageHeader
        breadcrumbs={[
          { label: "Operations", href: "/dashboard/operations" },
          { label: "Damage reports", href: "/dashboard/operations/damage-reports" },
          { label: "New" },
        ]}
        title="Log damage"
        description="Capture damage details, severity, and chargeability."
      />
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
