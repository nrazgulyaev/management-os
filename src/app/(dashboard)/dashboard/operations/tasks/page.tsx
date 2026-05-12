import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
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
import type { ListOperationTaskFilters } from "@/features/operations/services";
import { OperationsRowActions } from "@/components/dashboard/operations/operations-row-actions";
import { NoItemsYet } from "@/components/ui/primitives";

export const metadata = { title: "Operations · Tasks" };
export const dynamic = "force-dynamic";

const STATUSES = [
  "open",
  "scheduled",
  "in_progress",
  "blocked",
  "needs_review",
  "completed",
  "approved",
  "cancelled",
];
const CATEGORIES = ["housekeeping", "maintenance", "inspection", "guest_request"];

export default async function OperationsTasksList({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; category?: string; priority?: string }>;
}) {
  const sp = await searchParams;
  const filters: ListOperationTaskFilters = {};
  if (sp.status) filters.status = sp.status;
  if (sp.category) filters.category = sp.category;
  if (sp.priority) filters.priority = sp.priority;

  const [tasks, villas, projects, users, templates] = await Promise.all([
    listOperationTasks({ ...filters, limit: 200 }),
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
      <PageHeader
        breadcrumbs={[
          { label: "Operations", href: "/dashboard/operations" },
          { label: "Tasks" },
        ]}
        title="Operations tasks"
        description="The full task ledger across housekeeping, maintenance, inspections, and guest requests."
        actions={
          <TaskAddButton
            villas={villaOpts}
            projects={projectOpts}
            appUsers={userOpts}
            templates={templateOpts}
          />
        }
      />

      <DbStatusNotice />

      <div className="flex flex-wrap gap-2">
        <FilterPill label="All" href="/dashboard/operations/tasks" active={!sp.status && !sp.category && !sp.priority} />
        {STATUSES.map((s) => (
          <FilterPill
            key={s}
            label={s.replace(/_/g, " ")}
            href={`/dashboard/operations/tasks?status=${s}`}
            active={sp.status === s}
          />
        ))}
        {CATEGORIES.map((c) => (
          <FilterPill
            key={c}
            label={c.replace(/_/g, " ")}
            href={`/dashboard/operations/tasks?category=${c}`}
            active={sp.category === c}
          />
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {tasks.length === 0 ? (
          <NoItemsYet
            entityLabel="tasks"
            description={
              sp.status || sp.category || sp.priority
                ? "No tasks match these filters."
                : "Create your first operations task."
            }
            addHref="/dashboard/operations/tasks/new"
            addLabel="New task"
          />
        ) : (
          tasks.map((t) => (
            <div key={t.id} className="relative">
              <TaskCard task={t} href={`/dashboard/operations/tasks/${t.id}`} />
              <div className="absolute top-3 right-3 z-10">
                <OperationsRowActions
                  kind="task"
                  row={{
                    id: t.id,
                    displayName: t.title,
                    detailHref: `/dashboard/operations/tasks/${t.id}`,
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

function FilterPill({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`text-[11px] uppercase tracking-widest px-3 py-1.5 rounded-full border ${
        active
          ? "bg-ink text-ink-inverse border-ink"
          : "border-line-soft text-ink-secondary hover:border-line-strong"
      }`}
    >
      {label}
    </Link>
  );
}
