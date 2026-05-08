import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { DbStatusNotice } from "@/components/admin/db-status";
import { TaskCard } from "@/components/operations/task-card";
import { listOperationTasks } from "@/features/operations/services";
import { OperationsRowActions } from "@/components/dashboard/operations/operations-row-actions";
import { NoItemsYet } from "@/components/ui/primitives";

export const metadata = { title: "Operations · Housekeeping" };
export const dynamic = "force-dynamic";

export default async function HousekeepingPage() {
  const tasks = await listOperationTasks({ category: "housekeeping", limit: 200 });
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Operations", href: "/dashboard/operations" },
          { label: "Housekeeping" },
        ]}
        title="Housekeeping"
        description="Cleaning turnovers, deep cleans, common-area inspections."
        actions={
          <Button asChild>
            <Link href="/dashboard/operations/tasks/new">
              <Plus className="w-4 h-4" strokeWidth={1.75} />
              New cleaning
            </Link>
          </Button>
        }
      />
      <DbStatusNotice />
      <div className="flex flex-col gap-2">
        {tasks.length === 0 ? (
          <NoItemsYet
            entityLabel="housekeeping tasks"
            description="No cleaning, turnover, or inspection tasks logged yet."
            addHref="/dashboard/operations/tasks/new"
            addLabel="New cleaning"
          />
        ) : (
          tasks.map((t) => (
            <div key={t.id} className="relative">
              <TaskCard
                task={t}
                href={`/dashboard/operations/housekeeping/${t.id}`}
              />
              <div className="absolute top-3 right-3 z-10">
                <OperationsRowActions
                  kind="task"
                  row={{
                    id: t.id,
                    displayName: t.title,
                    detailHref: `/dashboard/operations/housekeeping/${t.id}`,
                    values: {
                      title: t.title,
                      description: t.description ?? "",
                      category: t.category,
                      priority: t.priority,
                      scheduledFor: t.scheduledFor ?? "",
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
