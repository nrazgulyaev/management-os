import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { DbStatusNotice } from "@/components/admin/db-status";
import { TaskCard } from "@/components/operations/task-card";
import { listOperationTasks } from "@/features/operations/services";

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
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No housekeeping tasks.
          </p>
        ) : (
          tasks.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              href={`/dashboard/operations/housekeeping/${t.id}`}
            />
          ))
        )}
      </div>
    </div>
  );
}
