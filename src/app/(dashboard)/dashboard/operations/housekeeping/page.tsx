import Link from "next/link";
import { DbStatusNotice } from "@/components/admin/db-status";
import { TaskCard } from "@/components/operations/task-card";
import { TaskAddButton } from "@/components/operations/task-add-button";
import {
  listChecklistTemplates,
  listOperationTasks,
} from "@/features/operations/services";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { listAppUsers } from "@/features/auth/users-service";
import { OperationsRowActions } from "@/components/dashboard/operations/operations-row-actions";
import { NoItemsYet } from "@/components/ui/primitives";

export const metadata = { title: "Operations · Housekeeping" };
export const dynamic = "force-dynamic";

export default async function HousekeepingPage() {
  const [tasks, villas, projects, users, templates] = await Promise.all([
    listOperationTasks({ category: "housekeeping", limit: 200 }),
    listVillas(),
    listProjects(),
    listAppUsers(),
    listChecklistTemplates(),
  ]);
  const villaOpts = villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }));
  const projectOpts = projects.map((p) => ({ id: p.id, label: p.name }));
  const userOpts = users.map((u) => ({ id: u.id, label: `${u.fullName} · ${u.email}` }));
  const templateOpts = templates.map((t) => ({ id: t.id, label: t.name }));
  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/operations">Operations</Link> /{" "}
            <span>Housekeeping</span>
          </div>
          <h1>Housekeeping</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Cleaning turnovers, deep cleans, common-area inspections.
          </p>
        </div>
        <div className="actions">
          <TaskAddButton
            villas={villaOpts}
            projects={projectOpts}
            appUsers={userOpts}
            templates={templateOpts}
            defaultCategory="housekeeping"
            label="New cleaning"
          />
        </div>
      </div>
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
