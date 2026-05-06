import { PageHeader } from "@/components/ui/page-header";
import { listVillas } from "@/features/villas/services";
import { listMaintenanceTemplates } from "@/features/maintenance-intelligence/services";
import { PlanForm } from "@/components/maintenance-intelligence/plan-form";

export const metadata = { title: "New maintenance plan" };
export const dynamic = "force-dynamic";

export default async function NewPlanPage() {
  const [villas, templates] = await Promise.all([
    listVillas(),
    listMaintenanceTemplates({ status: "active" }),
  ]);
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Maintenance intelligence", href: "/dashboard/maintenance-intelligence" },
          { label: "Plans", href: "/dashboard/maintenance-intelligence/plans" },
          { label: "New" },
        ]}
        title="New maintenance plan"
        description="Per-villa instance of a template. The first next_due_at is set to (now + interval); generate the task or accept a window suggestion to advance."
      />
      <PlanForm
        villas={villas.map((v) => ({
          id: v.id,
          label: `${v.unitCode} · ${v.projectName}`,
        }))}
        templates={templates.map((t) => ({
          id: t.id,
          label: `${t.name} · ${t.category} · ${t.defaultFrequency}`,
          defaultFrequency: t.defaultFrequency,
          defaultIntervalDays: t.defaultIntervalDays,
          defaultDurationMinutes: t.defaultDurationMinutes,
          defaultPriority: t.defaultPriority,
          canBeDoneWhileOccupied: t.canBeDoneWhileOccupied,
          guestDisruptionLevel: t.guestDisruptionLevel,
          requiresVillaEmpty: t.requiresVillaEmpty,
        }))}
      />
    </div>
  );
}
