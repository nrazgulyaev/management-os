import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Plus, Calendar } from "lucide-react";
import { DbStatusNotice } from "@/components/admin/db-status";
import { ScheduleCard } from "@/components/operations/schedule-card";
import { GeneratePreventiveButton } from "@/components/operations/generate-preventive-button";
import { listPreventiveSchedules } from "@/features/operations/services";

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
          <div className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary flex items-center gap-2">
            <Calendar className="w-4 h-4" strokeWidth={1.75} />
            No preventive schedules yet.
          </div>
        ) : (
          schedules.map((s) => <ScheduleCard key={s.id} schedule={s} />)
        )}
      </div>
    </div>
  );
}
