import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { DbStatusNotice } from "@/components/admin/db-status";
import { ScheduleCard } from "@/components/operations/schedule-card";
import { GeneratePreventiveButton } from "@/components/operations/generate-preventive-button";
import { listPreventiveSchedules } from "@/features/operations/services";
import { OperationsRowActions } from "@/components/dashboard/operations/operations-row-actions";
import { NoItemsYet } from "@/components/ui/primitives";

export const metadata = { title: "Operations · Preventive" };
export const dynamic = "force-dynamic";

export default async function PreventiveSchedulesPage() {
  const schedules = await listPreventiveSchedules({ limit: 200 });
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Operations", href: "/dashboard/operations" },
          { label: "Preventive" },
        ]}
        title="Preventive maintenance"
        description="Recurring inspections and services. The runtime mints tasks when schedules come due."
        actions={
          <div className="flex gap-2">
            <GeneratePreventiveButton />
            <Button asChild>
              <Link href="/dashboard/operations/preventive/new">
                <Plus className="w-4 h-4" strokeWidth={1.75} />
                New schedule
              </Link>
            </Button>
          </div>
        }
      />
      <DbStatusNotice />
      <div className="flex flex-col gap-2">
        {schedules.length === 0 ? (
          <NoItemsYet
            entityLabel="preventive schedules"
            description="Set up recurring inspections and services to stop tracking them in spreadsheets."
            addHref="/dashboard/operations/preventive/new"
            addLabel="New schedule"
          />
        ) : (
          schedules.map((s) => (
            <div key={s.id} className="relative">
              <ScheduleCard schedule={s} />
              <div className="absolute top-3 right-3 z-10">
                <OperationsRowActions
                  kind="preventive"
                  row={{
                    id: s.id,
                    displayName: s.name,
                    values: {
                      name: s.name,
                      category: s.category,
                      villaId: s.villaId ?? "",
                      projectId: s.projectId ?? "",
                      checklistTemplateId: s.checklistTemplateId ?? "",
                      frequency: s.frequency,
                      intervalDays: s.intervalDays ?? "",
                      nextDueOn: s.nextDueOn,
                      priority: s.priority,
                      assignedTo: s.assignedTo ?? "",
                    },
                  }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
