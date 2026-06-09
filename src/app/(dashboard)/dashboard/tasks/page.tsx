import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Kpi, Card } from "@/components/dashboard/primitives";
import { Forbidden } from "@/components/ui/state";
import { TaskFeed } from "@/components/crm-tasks/task-feed";
import { TasksTabs } from "./_tasks-client";
import {
  listMyOpenTasks,
  listOrgDueTasks,
} from "@/features/crm-tasks/services";
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

  const [mine, teamDue] = await Promise.all([
    listMyOpenTasks(),
    listOrgDueTasks(100),
  ]);

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
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "My tasks" },
        ]}
        eyebrow="CRM"
        title="My tasks"
        description="Follow-ups and reminders across owners, contacts, leads, buyers and deals. Add tasks from any record's Tasks tab."
      />

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
          No follow-ups yet. Open an{" "}
          <Link href="/dashboard/owners" className="text-accent hover:underline">
            owner record
          </Link>{" "}
          and use the Tasks tab to schedule your first reminder.
        </p>
      )}
    </>
  );
}
