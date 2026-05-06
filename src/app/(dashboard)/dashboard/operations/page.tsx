import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Calendar, Plus, Wrench, ListChecks, Sparkles } from "lucide-react";
import { DbStatusNotice } from "@/components/admin/db-status";
import { OperationsBoard } from "@/components/dashboard/operations-board";
import { OperationsMetricsGrid } from "@/components/operations/operations-metrics";
import { TaskCard } from "@/components/operations/task-card";
import { MaintenanceTicketCard } from "@/components/operations/maintenance-ticket-card";
import { ScheduleCard } from "@/components/operations/schedule-card";
import {
  getOperationsMetrics,
  listMaintenanceTickets,
  listOperationTasks,
  listPreventiveSchedules,
  listServiceRequests,
} from "@/features/operations/services";
import { todayYmd } from "@/features/operations/scheduling";
import { isDbConfigured } from "@/lib/env";
import { getLastRunByJobKey } from "@/features/jobs/services";
import { LastRunBadge } from "@/components/jobs/last-run-badge";
import { OperationsCopilotCard } from "@/components/ai/operations-copilot-card";
import { RiskSummaryCard } from "@/components/maintenance-intelligence/risk-summary-card";

export const metadata = { title: "Operations" };
export const dynamic = "force-dynamic";

export default async function OperationsBoardPage() {
  const live = isDbConfigured();

  const [
    metrics,
    urgent,
    dueToday,
    openMaintenance,
    preventiveDue,
    newRequests,
    lastPreventiveRun,
  ] = await Promise.all([
    getOperationsMetrics(),
    listOperationTasks({ priority: "urgent", limit: 6 }),
    listOperationTasks({ scheduledOnOrBefore: todayYmd(), limit: 8 }),
    listMaintenanceTickets({ limit: 6 }),
    listPreventiveSchedules({ dueOnOrBefore: todayYmd(), status: "active", limit: 6 }),
    listServiceRequests({ status: "new", limit: 6 }),
    getLastRunByJobKey("generate_preventive_tasks"),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[{ label: "Operations" }]}
        title="Operations command center"
        description="Live view of housekeeping, maintenance, preventive schedules, and guest service requests across the portfolio."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="secondary">
              <Link href="/dashboard/operations/preventive">
                <Calendar className="w-4 h-4" strokeWidth={1.75} />
                Preventive
              </Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard/operations/tasks/new">
                <Plus className="w-4 h-4" strokeWidth={1.75} />
                New task
              </Link>
            </Button>
          </div>
        }
      />

      <DbStatusNotice />

      <LastRunBadge label="Last preventive task generation" run={lastPreventiveRun} />

      {live && <OperationsMetricsGrid metrics={metrics} />}

      <OperationsCopilotCard />

      <RiskSummaryCard />

      <OperationsBoard />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Section
          eyebrow="Today"
          title="Tasks scheduled for today"
          action={
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/operations/tasks">All tasks</Link>
            </Button>
          }
        >
          <div className="flex flex-col gap-2">
            {dueToday.length === 0 ? (
              <EmptyState icon={ListChecks} label="No tasks scheduled" />
            ) : (
              dueToday.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  href={`/dashboard/operations/tasks/${t.id}`}
                />
              ))
            )}
          </div>
        </Section>

        <Section
          eyebrow="Attention"
          title="Urgent priority tasks"
          action={
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/operations/tasks?priority=urgent">View all</Link>
            </Button>
          }
        >
          <div className="flex flex-col gap-2">
            {urgent.length === 0 ? (
              <EmptyState icon={Sparkles} label="No urgent tasks open" />
            ) : (
              urgent.map((t) => (
                <TaskCard key={t.id} task={t} href={`/dashboard/operations/tasks/${t.id}`} />
              ))
            )}
          </div>
        </Section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Section
          eyebrow="Maintenance"
          title="Open tickets"
          action={
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/operations/maintenance">All tickets</Link>
            </Button>
          }
        >
          <div className="flex flex-col gap-2">
            {openMaintenance.length === 0 ? (
              <EmptyState icon={Wrench} label="No open tickets" />
            ) : (
              openMaintenance
                .filter((t) => !["resolved", "closed", "cancelled"].includes(t.status))
                .slice(0, 6)
                .map((m) => (
                  <MaintenanceTicketCard
                    key={m.id}
                    ticket={m}
                    href={`/dashboard/operations/maintenance/${m.id}`}
                  />
                ))
            )}
          </div>
        </Section>

        <Section
          eyebrow="Preventive"
          title="Schedules due now"
          action={
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/operations/preventive">All schedules</Link>
            </Button>
          }
        >
          <div className="flex flex-col gap-2">
            {preventiveDue.length === 0 ? (
              <EmptyState icon={Calendar} label="No preventive work due" />
            ) : (
              preventiveDue.map((s) => <ScheduleCard key={s.id} schedule={s} />)
            )}
          </div>
        </Section>
      </div>

      <Section eyebrow="Guest" title="New service requests">
        <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
          {newRequests.length === 0 ? (
            <div className="p-6 text-sm text-ink-tertiary">No new service requests.</div>
          ) : (
            <ul className="divide-y divide-line-soft">
              {newRequests.map((r) => (
                <li key={r.id} className="p-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm text-ink font-medium">{r.title}</div>
                    <div className="text-xs text-ink-tertiary mt-0.5 capitalize">
                      {r.requestType.replace("_", " ")} · {r.villaCode ?? "—"}
                    </div>
                  </div>
                  <Link
                    href={`/dashboard/operations/service-requests/${r.id}`}
                    className="text-xs text-accent hover:underline"
                  >
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
}) {
  return (
    <div className="rounded-md border border-dashed border-line-soft bg-muted/20 p-6 flex items-center gap-3 text-sm text-ink-tertiary">
      <Icon className="w-4 h-4" strokeWidth={1.75} />
      {label}
    </div>
  );
}
