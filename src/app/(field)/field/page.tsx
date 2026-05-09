import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { FieldQuickActions } from "@/components/field/field-quick-actions";
import { CheckCircle2, Clock, Wrench } from "lucide-react";
import { MobileTaskCard } from "@/components/ui/primitives";
import type { MobileTaskStatus } from "@/components/ui/primitives";
import { listTasksForCurrentStaff, type OperationTaskRow } from "@/features/operations/services";
import { listCurrentReadiness } from "@/features/readiness/services";
import { isDbConfigured } from "@/lib/env";
import type { WithSource } from "@/features/types";

export const metadata = { title: "Today — Field" };
export const dynamic = "force-dynamic";

function buildDemoTasks(): WithSource<OperationTaskRow>[] {
  const today = new Date();
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const offset = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return ymd(d);
  };
  const nowIso = today.toISOString();
  let serial = 0;
  const next = () => {
    serial += 1;
    return `OPS-DEMO-${String(serial).padStart(4, "0")}`;
  };
  type Item = Partial<WithSource<OperationTaskRow>> & {
    title: string;
    villaCode: string;
    category: WithSource<OperationTaskRow>["category"];
    priority: WithSource<OperationTaskRow>["priority"];
    status: WithSource<OperationTaskRow>["status"];
    scheduledFor: string | null;
    estimatedMinutes: number;
    completed?: boolean;
  };
  const items: Item[] = [
    // Overdue (2)
    {
      title: "Pool service · Eternal S5",
      villaCode: "EV-S5",
      category: "maintenance",
      priority: "high",
      status: "scheduled",
      scheduledFor: offset(-1),
      estimatedMinutes: 30,
    },
    {
      title: "Damage report follow-up · Enso S2",
      villaCode: "ES-S2",
      category: "maintenance",
      priority: "urgent",
      status: "scheduled",
      scheduledFor: offset(-2),
      estimatedMinutes: 60,
    },
    // Today (5)
    {
      title: "Checkout cleaning · Enso S5",
      villaCode: "ES-S5",
      category: "housekeeping",
      priority: "high",
      status: "scheduled",
      scheduledFor: offset(0),
      estimatedMinutes: 180,
    },
    {
      title: "Arrival inspection · Eternal S5",
      villaCode: "EV-S5",
      category: "inspection",
      priority: "high",
      status: "scheduled",
      scheduledFor: offset(0),
      estimatedMinutes: 30,
    },
    {
      title: "AC maintenance · Eternal S6",
      villaCode: "EV-S6",
      category: "maintenance",
      priority: "normal",
      status: "scheduled",
      scheduledFor: offset(0),
      estimatedMinutes: 90,
    },
    {
      title: "Utility top-up · Enso S1",
      villaCode: "ES-S1",
      category: "maintenance",
      priority: "normal",
      status: "scheduled",
      scheduledFor: offset(0),
      estimatedMinutes: 30,
    },
    {
      title: "Guest service delivery · Enso S5 (breakfast)",
      villaCode: "ES-S5",
      category: "guest_request",
      priority: "high",
      status: "scheduled",
      scheduledFor: offset(0),
      estimatedMinutes: 45,
    },
    // In progress (2)
    {
      title: "Inventory restock · Berawa store",
      villaCode: "ES-S5",
      category: "housekeeping",
      priority: "normal",
      status: "in_progress",
      scheduledFor: offset(0),
      estimatedMinutes: 60,
    },
    {
      title: "Pool service · Enso S6",
      villaCode: "ES-S6",
      category: "maintenance",
      priority: "normal",
      status: "in_progress",
      scheduledFor: offset(0),
      estimatedMinutes: 30,
    },
    // Done today (3)
    {
      title: "Arrival inspection · Enso S5",
      villaCode: "ES-S5",
      category: "inspection",
      priority: "high",
      status: "completed",
      scheduledFor: offset(0),
      estimatedMinutes: 30,
      completed: true,
    },
    {
      title: "Pool service · Eternal S6",
      villaCode: "EV-S6",
      category: "maintenance",
      priority: "normal",
      status: "completed",
      scheduledFor: offset(0),
      estimatedMinutes: 30,
      completed: true,
    },
    {
      title: "Common-area inspection · Enso pool deck",
      villaCode: "ES-S5",
      category: "inspection",
      priority: "normal",
      status: "approved",
      scheduledFor: offset(0),
      estimatedMinutes: 60,
      completed: true,
    },
    // Upcoming (3)
    {
      title: "Deep clean · Eternal S1",
      villaCode: "EV-S1",
      category: "housekeeping",
      priority: "normal",
      status: "scheduled",
      scheduledFor: offset(2),
      estimatedMinutes: 360,
    },
    {
      title: "Preventive AC inspection · Enso S2",
      villaCode: "ES-S2",
      category: "maintenance",
      priority: "normal",
      status: "scheduled",
      scheduledFor: offset(3),
      estimatedMinutes: 90,
    },
    {
      title: "Arrival inspection · Eternal S6",
      villaCode: "EV-S6",
      category: "inspection",
      priority: "high",
      status: "scheduled",
      scheduledFor: offset(1),
      estimatedMinutes: 30,
    },
  ];

  return items.map((it) => {
    const code = next();
    return {
    source: "mock" as const,
    id: `demo-${code.toLowerCase()}`,
    taskCode: code,
    title: it.title,
    description: null,
    category: it.category,
    priority: it.priority,
    status: it.status,
    taskSource: "manual",
    villaId: null,
    villaCode: it.villaCode,
    projectId: null,
    projectName: null,
    assignedTo: null,
    assignedToName: "You",
    scheduledFor: it.scheduledFor,
    dueAt: null,
    startedAt: it.status === "in_progress" ? nowIso : null,
    completedAt: it.completed ? nowIso : null,
    approvedAt: it.status === "approved" ? nowIso : null,
    estimatedMinutes: it.estimatedMinutes,
    actualMinutes: it.completed ? it.estimatedMinutes : null,
    internalNotes: null,
    ownerVisible: false,
    guestVisible: false,
    createdAt: nowIso,
    updatedAt: nowIso,
    };
  });
}

const demoTasks: WithSource<OperationTaskRow>[] = buildDemoTasks();

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function isOpenStatus(s: string) {
  return s !== "completed" && s !== "approved" && s !== "cancelled";
}

function toMobileStatus(s: string): MobileTaskStatus {
  if (s === "completed" || s === "approved") return "complete";
  if (s === "in_progress") return "in_progress";
  if (s === "cancelled") return "blocked";
  return "pending";
}

function actionLabelFor(status: string): string {
  if (status === "in_progress") return "Continue";
  if (status === "completed" || status === "approved") return "Review";
  return "Open";
}

export default async function FieldHome() {
  const live = isDbConfigured();
  const [liveTasks, readinessRows] = await Promise.all([
    live ? listTasksForCurrentStaff() : Promise.resolve([] as WithSource<OperationTaskRow>[]),
    live ? listCurrentReadiness() : Promise.resolve([]),
  ]);
  const tasks = liveTasks.length > 0 ? liveTasks : demoTasks;
  const readinessByVilla: Record<string, string> = {};
  for (const r of readinessRows) readinessByVilla[r.villaId] = r.readinessStatus;

  const today = todayYmd();
  const overdue = tasks.filter(
    (t) =>
      isOpenStatus(t.status) &&
      t.scheduledFor !== null &&
      t.scheduledFor < today,
  );
  const todayTasks = tasks.filter(
    (t) => isOpenStatus(t.status) && t.scheduledFor === today,
  );
  const upcoming = tasks.filter(
    (t) =>
      isOpenStatus(t.status) &&
      t.scheduledFor !== null &&
      t.scheduledFor > today,
  );
  const closed = tasks.filter((t) => !isOpenStatus(t.status));

  const counts = {
    overdue: overdue.length,
    today: todayTasks.length,
    upcoming: upcoming.length,
    inProgress: tasks.filter((t) => t.status === "in_progress").length,
    doneToday: closed.filter((t) => t.completedAt).length,
  };

  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <span className="text-label">{dateLabel}</span>
        <h1 className="text-display text-[28px] leading-tight font-medium text-ink mt-2">
          Today's tasks
        </h1>
        <p className="text-sm text-ink-secondary mt-1">
          {liveTasks.length > 0
            ? `${tasks.length} task${tasks.length === 1 ? "" : "s"} assigned. ${counts.overdue} overdue, ${counts.today} due today.`
            : "Live tasks appear once you sign in and a supervisor assigns work."}
        </p>
        <p className="text-[11px] text-ink-tertiary mt-2 leading-relaxed">
          Tap a task to open it. Each task shows the assigned villa,
          priority, and whether a checklist or photo is required before
          you can mark it done.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { l: "Overdue", v: String(counts.overdue), icon: Clock, accent: counts.overdue > 0 },
          { l: "In progress", v: String(counts.inProgress), icon: Wrench },
          { l: "Done today", v: String(counts.doneToday), icon: CheckCircle2 },
        ].map((k) => {
          const Icon = k.icon;
          return (
            <div
              key={k.l}
              className={`rounded-md border bg-surface p-3 flex flex-col items-start gap-2 ${
                k.accent ? "border-warning/60" : "border-line-soft"
              }`}
            >
              <Icon className="w-4 h-4 text-ink-tertiary" strokeWidth={1.75} />
              <div className="font-mono tabular-nums text-lg text-ink">{k.v}</div>
              <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">
                {k.l}
              </div>
            </div>
          );
        })}
      </div>

      <TaskGroup
        title="Overdue"
        tone="warning"
        tasks={overdue}
        readinessByVilla={readinessByVilla}
        emptyHint="Nothing overdue."
      />
      <TaskGroup
        title="Today"
        tone="info"
        tasks={todayTasks}
        readinessByVilla={readinessByVilla}
        emptyHint="Nothing scheduled for today."
      />
      <TaskGroup
        title="Upcoming"
        tone="neutral"
        tasks={upcoming}
        readinessByVilla={readinessByVilla}
        emptyHint="No upcoming tasks."
        collapsedByDefault
      />

      <div>
        <span className="text-label mb-3 inline-block">Quick actions</span>
        <FieldQuickActions />
      </div>

      <div className="mt-2 p-4 rounded-md border border-dashed border-line-soft bg-muted/30">
        <span className="text-label">Live + demo</span>
        <p className="text-xs text-ink-secondary mt-1 leading-relaxed">
          Live tasks come from the operations runtime when you're signed in and
          assigned work. The demo task at{" "}
          <Link href="/field/tasks/demo" className="underline">
            /field/tasks/demo
          </Link>{" "}
          stays available to walk-through the field UX without a database.
        </p>
      </div>
    </div>
  );
}

function TaskGroup({
  title,
  tone,
  tasks,
  readinessByVilla,
  emptyHint,
  collapsedByDefault,
}: {
  title: string;
  tone: "warning" | "info" | "neutral";
  tasks: WithSource<OperationTaskRow>[];
  readinessByVilla: Record<string, string>;
  emptyHint: string;
  collapsedByDefault?: boolean;
}) {
  if (tasks.length === 0) {
    return (
      <details open={!collapsedByDefault} className="group">
        <summary className="text-label cursor-pointer flex items-center gap-2">
          <span>{title}</span>
          <span className="text-ink-tertiary">·</span>
          <span className="text-ink-tertiary">0</span>
        </summary>
        <p className="text-xs text-ink-tertiary mt-2">{emptyHint}</p>
      </details>
    );
  }

  return (
    <details open={!collapsedByDefault} className="group">
      <summary className="text-label cursor-pointer flex items-center gap-2">
        <Badge tone={tone}>{title}</Badge>
        <span className="text-ink-tertiary">·</span>
        <span className="text-ink-tertiary">{tasks.length}</span>
      </summary>
      <div className="flex flex-col gap-2 mt-3">
        {tasks.map((t) => {
          const href =
            t.source === "db" ? `/field/tasks/${t.id}` : "/field/tasks/demo";
          const readiness = t.villaId ? readinessByVilla[t.villaId] : null;
          const metaParts: string[] = [];
          if (t.villaCode) metaParts.push(t.villaCode);
          if (readiness) metaParts.push(readiness);
          if (t.source === "mock") metaParts.push("demo");
          return (
            <MobileTaskCard
              key={t.id}
              title={t.title}
              subtitle={`${t.taskCode} · ${t.category.replace(/_/g, " ")}${t.priority !== "normal" ? ` · ${t.priority}` : ""}`}
              status={toMobileStatus(t.status)}
              when={t.scheduledFor ?? undefined}
              meta={metaParts.length > 0 ? metaParts.join(" · ") : undefined}
              actionLabel={actionLabelFor(t.status)}
              href={href}
            />
          );
        })}
      </div>
    </details>
  );
}
