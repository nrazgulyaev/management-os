import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DbStatusNotice } from "@/components/admin/db-status";
import { TaskCard } from "@/components/operations/task-card";
import { Plus } from "lucide-react";
import { listOperationTasks } from "@/features/operations/services";
import type { ListOperationTaskFilters } from "@/features/operations/services";

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

  const tasks = await listOperationTasks({ ...filters, limit: 200 });

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
          <Button asChild>
            <Link href="/dashboard/operations/tasks/new">
              <Plus className="w-4 h-4" strokeWidth={1.75} />
              New task
            </Link>
          </Button>
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
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No tasks match these filters yet.
          </p>
        ) : (
          tasks.map((t) => (
            <TaskCard key={t.id} task={t} href={`/dashboard/operations/tasks/${t.id}`} />
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
