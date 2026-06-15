import Link from "next/link";
import { Kpi, Card } from "@/components/dashboard/primitives";
import { Forbidden } from "@/components/ui/state";
import { TaskFeed } from "@/components/crm-tasks/task-feed";
import { TasksTabs } from "./_tasks-client";
import { NewTaskButton } from "@/components/crm-tasks/new-task-button";
import {
  listMyOpenTasks,
  listOrgDueTasks,
  listAssignableUsers,
} from "@/features/crm-tasks/services";
import { listOwners } from "@/features/owners/services";
import { getCurrentUserContext, hasPermission } from "@/features/auth/permissions";

/**
 * My tasks / follow-ups — the HighLevel-style personal CRM queue. Buckets the
 * current user's OPEN tasks into overdue / due-today / upcoming, plus a
 * read-only org-wide "Team queue" of everything due today. All tasks are
 * created from a CRM record's <RecordTasks> panel and tie back to the record.
 */

export const metadata = { title: "My tasks" };
export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const ctx = await getCurrentUserContext();
  const canRead = hasPermission(ctx, "crm_tasks.read");
  const canManage = hasPermission(ctx, "crm_tasks.write");

  if (!canRead && ctx.mode !== "demo") {
    return (
      <Forbidden
        title="No access to CRM tasks"
        reason="Follow-up tasks are visible to internal team members."
        homeHref="/dashboard"
        homeLabel="Back to dashboard"
      />
    );
  }

  const [mine, teamDue, owners, assignableUsers] = await Promise.all([
    listMyOpenTasks(),
    listOrgDueTasks(100),
    canManage ? listOwners() : Promise.resolve([]),
    canManage ? listAssignableUsers() : Promise.resolve([]),
  ]);
  const ownerOptions = owners.map((o) => ({ id: o.id, name: o.displayName }));

  const myTabBody = (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h3 className="text-label">Overdue</h3>
        <TaskFeed
          tasks={mine.overdue}
          canManage={canManage}
          emptyLabel="Nothing overdue."
        />
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-label">Due today</h3>
        <TaskFeed
          tasks={mine.today}
          canManage={canManage}
          emptyLabel="No tasks due today."
        />
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-label">Upcoming</h3>
        <TaskFeed
          tasks={mine.upcoming}
          canManage={canManage}
          emptyLabel="No upcoming tasks."
        />
      </section>
    </div>
  );

  const teamTabBody = (
    <TaskFeed
      tasks={teamDue}
      canManage={canManage}
      showAssignee
      emptyLabel="No tasks are due across the team today."
    />
  );

  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Dashboard</Link> / <span>My tasks</span>
          </div>
          <h1>My tasks</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Follow-ups across owners, contacts, leads, buyers and deals. Create
            one here, or from any record&apos;s Tasks tab.
          </p>
        </div>
        {canManage ? (
          <div className="actions">
            <NewTaskButton owners={ownerOptions} assignableUsers={assignableUsers} />
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mt-6">
        <Kpi label="Overdue" value={mine.overdue.length} tone={mine.overdue.length > 0 ? "gold" : undefined} />
        <Kpi label="Due today" value={mine.today.length} />
        <Kpi label="Upcoming" value={mine.upcoming.length} />
        <Kpi label="Open (you)" value={mine.total} />
      </div>

      <Card padding="lg" className="mt-6">
        <TasksTabs
          initialId="mine"
          tabs={[
            { id: "mine", label: "My tasks", count: mine.total },
            { id: "team", label: "Team due today", count: teamDue.length },
          ]}
          panels={{ mine: myTabBody, team: teamTabBody }}
        />
      </Card>

      {mine.total === 0 && teamDue.length === 0 && (
        <p className="mt-6 text-[13px] text-ink-tertiary">
          No follow-ups yet. Use{" "}
          <span className="text-ink-secondary">New task</span> above, or open an{" "}
          <Link href="/dashboard/owners" className="text-accent hover:underline">
            owner record
          </Link>{" "}
          and use the Tasks tab to schedule your first reminder.
        </p>
      )}
    </>
  );
}
