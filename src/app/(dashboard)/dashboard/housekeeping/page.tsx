import Link from "next/link";
import {
  ArrowUpRight,
  CheckSquare,
  Plus,
  Sparkles,
} from "lucide-react";
import { DashboardKpi } from "@/components/ui/primitives";
import {
  HalfDonutGauge,
  HatchedBarChart,
  HeroGreetingAI,
  KpiRowMixed,
  PatrolTimeline,
  PhotoEvidenceGrid,
  type HatchedBarDatum,
  type KpiItem,
  type PatrolEvent,
  type PhotoEvidenceItem,
} from "@/components/award";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { listOperationTasks } from "@/features/operations/services";
import { loadOperationTaskPhotos } from "@/lib/development/server/operations/task-photo-queries";
import { loadHousekeepingSchedulerOutputs } from "@/lib/development/server/ai/housekeeping-scheduler-queries";
import { isAgentEnabledForCurrentOrg } from "@/features/ai-agents/is-agent-enabled-for-org";

/**
 * Mega-Sprint / Phase 9 — Housekeeping cabinet apex at
 * `/dashboard/housekeeping`. Promotes the prior
 * `/dashboard/operations/housekeeping` sub-page into a real cabinet
 * apex following the Sprint-4 gold standard: HeroGreetingAI shell +
 * KpiRowMixed (emerald-solid hero = today's turnover completion %),
 * Today's-pulse hatched bar (7-day cadence) + completion half-donut,
 * <PatrolTimeline> for the most recent housekeeping events, and a
 * <PhotoEvidenceGrid> placeholder for turnover photos (driven by the
 * existing photo-upload modal on the task detail page). The legacy
 * surface at /dashboard/operations/housekeeping survives as the
 * full-task-list board.
 *
 * AI placeholder ships toward a future `housekeeping-scheduler`
 * agent per the operator decision lock.
 */

export const metadata = { title: "Housekeeping" };
export const dynamic = "force-dynamic";

function todayLabel(now: Date): string {
  const day = now.getDate();
  const weekday = now.toLocaleDateString("en-US", { weekday: "short" });
  const month = now.toLocaleDateString("en-US", { month: "long" });
  return `${day} · ${weekday}, ${month}`;
}

function isToday(iso: string | null, now: Date): boolean {
  if (!iso) return false;
  return iso.slice(0, 10) === now.toISOString().slice(0, 10);
}

function isTomorrow(iso: string | null, now: Date): boolean {
  if (!iso) return false;
  const t = new Date(now);
  t.setUTCDate(t.getUTCDate() + 1);
  return iso.slice(0, 10) === t.toISOString().slice(0, 10);
}

function bucketLast7Days(
  scheduledDates: Array<string | null>,
  today: Date,
): HatchedBarDatum[] {
  const counts = new Map<string, number>();
  for (const iso of scheduledDates) {
    if (!iso) continue;
    const k = iso.slice(0, 10);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const out: HatchedBarDatum[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const n = counts.get(iso) ?? 0;
    out.push({
      label: d.toLocaleDateString("en-US", { weekday: "narrow" }),
      value: Math.max(n, 1),
      status: n > 0 ? "active" : "inactive",
      caption: n > 0 ? String(n) : undefined,
    });
  }
  return out;
}

function statusFor(s: string): "ok" | "warn" | "alert" | "info" | "pending" {
  switch (s) {
    case "completed":
    case "approved":
      return "ok";
    case "in_progress":
      return "info";
    case "awaiting_approval":
      return "warn";
    case "blocked":
    case "rejected":
      return "alert";
    default:
      return "pending";
  }
}

export default async function HousekeepingCabinetPage() {
  const now = new Date();
  const me = await getCurrentAppUser();
  const firstName = me?.fullName?.trim().split(/\s+/)[0] ?? null;

  const tasks = await listOperationTasks({
    category: "housekeeping",
    limit: 200,
  });

  const todays = tasks.filter((t) => isToday(t.scheduledFor, now));
  const tomorrowsCount = tasks.filter((t) =>
    isTomorrow(t.scheduledFor, now),
  ).length;
  const completedTodayCount = todays.filter(
    (t) => t.status === "completed" || t.status === "approved",
  ).length;
  const awaitingApprovalCount = tasks.filter(
    (t) => t.status === "awaiting_approval",
  ).length;
  const inProgressCount = tasks.filter(
    (t) => t.status === "in_progress",
  ).length;
  const completionPct =
    todays.length > 0
      ? Math.round((completedTodayCount / todays.length) * 100)
      : 0;

  const kpis: KpiItem[] = [
    {
      label: "Today's turnovers",
      value:
        todays.length > 0
          ? `${completedTodayCount}/${todays.length}`
          : "—",
      delta:
        todays.length === 0
          ? "Nothing scheduled today"
          : `${completionPct}% complete`,
      href: "/dashboard/operations/housekeeping",
    },
    {
      label: "Awaiting approval",
      value: String(awaitingApprovalCount),
      delta:
        awaitingApprovalCount === 0
          ? "Approvals clear"
          : "Need supervisor review",
      href: "/dashboard/operations/housekeeping?status=awaiting_approval",
    },
    {
      label: "In progress",
      value: String(inProgressCount),
      delta:
        inProgressCount === 0
          ? "Idle right now"
          : "Cleaning underway",
      href: "/dashboard/operations/housekeeping?status=in_progress",
    },
    {
      label: "Tomorrow's turnovers",
      value: String(tomorrowsCount),
      delta:
        tomorrowsCount === 0
          ? "Nothing booked yet"
          : "Plan tonight",
      href: "/dashboard/operations/housekeeping",
    },
  ];

  const dailyCadence = bucketLast7Days(
    tasks.map((t) => t.scheduledFor),
    now,
  );

  const timelineEvents: PatrolEvent[] = tasks
    .filter((t) => t.completedAt || t.startedAt)
    .slice(0, 8)
    .map((t) => ({
      id: t.id,
      timestamp: (t.completedAt ?? t.startedAt ?? "").slice(11, 16),
      status: statusFor(t.status),
      title: `${t.title} · ${t.villaCode ?? "—"}`,
      body: t.assignedToName
        ? `${t.assignedToName} · ${t.status.replaceAll("_", " ")}`
        : t.status.replaceAll("_", " "),
      kind: "check",
      href: `/dashboard/operations/housekeeping/${t.id}`,
      statusLabel: t.status.replaceAll("_", " "),
    }));

  // Sprint MD-2.C — Photo evidence aggregator. Scopes to today's
  // housekeeping tasks (regardless of status) so cleaners can verify
  // their photo uploads landed without leaving the cabinet apex.
  const todayTaskIds = todays.map((t) => t.id);
  const photoItems: PhotoEvidenceItem[] = await loadOperationTaskPhotos(
    todayTaskIds,
    12,
  ).catch(() => []);

  // Sprint MD-5 Phase 5 — housekeeping_scheduler agent outputs.
  const [schedulerEnabled, schedulerOutputs] = await Promise.all([
    isAgentEnabledForCurrentOrg("housekeeping_scheduler").catch(
      () => false,
    ),
    loadHousekeepingSchedulerOutputs({ limit: 3 }).catch(() => []),
  ]);

  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <HeroGreetingAI
        firstName={firstName}
        role="Housekeeping · Cabinet"
        dateLabel={todayLabel(now)}
        aiPromptPlaceholder="Housekeeping-scheduler — coming soon."
        showMyTasksHref="/dashboard/operations/housekeeping"
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        {[
          {
            href: "/dashboard/operations/tasks/new?category=housekeeping",
            icon: Plus,
            label: "New cleaning task",
            caption: "Single villa · checklist",
          },
          {
            href: "/dashboard/operations/housekeeping?status=awaiting_approval",
            icon: CheckSquare,
            label: "Review completed work",
            caption:
              awaitingApprovalCount > 0
                ? `${awaitingApprovalCount} awaiting`
                : "Inbox clear",
          },
          {
            href: "/dashboard/operations",
            icon: Sparkles,
            label: "Operations overview",
            caption: "Cross-team daily picture",
          },
        ].map(({ href, icon: Icon, label, caption }) => (
          <Link
            key={href}
            href={href}
            className="rounded-3xl border border-line-soft bg-surface shadow-soft-card px-5 py-4 flex items-center gap-4 hover:bg-muted/40 transition-colors"
          >
            <span className="shrink-0 w-10 h-10 rounded-full bg-gradient-emerald-soft border border-line-soft inline-flex items-center justify-center">
              <Icon className="w-4 h-4 text-ink" strokeWidth={1.75} />
            </span>
            <span className="flex flex-col min-w-0 flex-1">
              <span className="text-sm font-medium text-ink truncate">
                {label}
              </span>
              <span className="text-xs text-ink-tertiary truncate">
                {caption}
              </span>
            </span>
            <ArrowUpRight
              className="w-4 h-4 text-ink-tertiary shrink-0"
              strokeWidth={1.75}
            />
          </Link>
        ))}
      </div>

      <KpiRowMixed kpis={kpis} heroTone="emerald-solid" />

      <div>
        <div className="label mb-2.5">Today's pulse</div>
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 md:gap-5">
          <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 md:p-6 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
                Last 7 days
              </span>
              <span className="text-xs text-ink-tertiary tabular-nums">
                {todays.length} scheduled today
              </span>
            </div>
            <HatchedBarChart
              data={dailyCadence}
              tone="emerald"
              height={200}
            />
          </div>
          <HalfDonutGauge
            variant="emerald"
            value={completionPct}
            max={100}
            label={
              <>
                <p className="text-display text-[28px] md:text-[36px] leading-none font-medium text-ink tabular-nums">
                  {completionPct}%
                </p>
                <p className="text-xs text-ink-tertiary mt-1">
                  Today's completion
                </p>
              </>
            }
            legend={[
              { label: `${completedTodayCount} done` },
              {
                label: `${todays.length - completedTodayCount} open`,
                color: "var(--line-strong)",
              },
            ]}
          />
        </div>
      </div>

      <div>
        <div className="label mb-2.5 flex items-center justify-between gap-3">
          <span>Activity</span>
          <Link
            href="/dashboard/operations/housekeeping"
            className="text-xs text-ink-tertiary hover:underline normal-case"
          >
            All tasks →
          </Link>
        </div>
        {timelineEvents.length === 0 ? (
          <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 text-sm text-ink-tertiary">
            Nothing logged yet. Use "New cleaning task" above to start
            one.
          </div>
        ) : (
          <PatrolTimeline
            events={timelineEvents}
            maxVisible={8}
            moreHref="/dashboard/operations/housekeeping"
          />
        )}
      </div>

      <div>
        <div className="label mb-2.5">Evidence</div>
        <PhotoEvidenceGrid
          items={photoItems}
          emptyMessage="No turnover photos uploaded today yet. Cleaners can attach photos from the per-task detail page."
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div>
            <div className="label mb-2.5">Inventory</div>
            <DashboardKpi
              label="Open housekeeping tasks"
              value={String(tasks.length)}
              status="neutral"
              drillHref="/dashboard/operations/housekeeping"
              hint="All categories"
            />
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <div>
            <div className="label mb-2.5">Quick links</div>
            <ul className="grid grid-cols-1 gap-2">
              {[
                {
                  href: "/dashboard/operations",
                  label: "Operations overview",
                },
                {
                  href: "/dashboard/operations/housekeeping",
                  label: "Full task board",
                },
                {
                  href: "/dashboard/front-office",
                  label: "Front office",
                },
                {
                  href: "/dashboard/villas",
                  label: "Villa directory",
                },
              ].map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="block rounded-2xl border border-line-soft bg-surface px-4 py-3 text-sm text-ink shadow-soft-card hover:shadow-elevated-card hover:border-line-strong transition-all"
                  >
                    {l.label} <span aria-hidden>→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="label mb-2.5">AI</div>
            {!schedulerEnabled ? (
              <Link
                href="/dashboard/settings/ai-agents/housekeeping_scheduler"
                className="rounded-3xl border border-line-soft bg-gradient-ink-deep text-ink-inverse shadow-soft-card p-6 md:p-7 flex flex-col gap-3 hover:opacity-95 transition-opacity"
              >
                <span className="text-[10px] font-mono uppercase tracking-[0.16em] opacity-70">
                  Coming soon · Configure key
                </span>
                <p className="text-sm leading-relaxed opacity-90">
                  The housekeeping-scheduler agent ships with a dry-
                  run default. Wire a provider key to flip it live;
                  tomorrow's turnover plan + assignment matrix surface
                  here once it runs.
                </p>
                <span className="self-start">
                  <HandoffBadge tone="soft">Configure provider →</HandoffBadge>
                </span>
              </Link>
            ) : schedulerOutputs.length === 0 ? (
              <Link
                href="/dashboard/ai/jobs?agent=housekeeping_scheduler"
                className="rounded-3xl border border-line-soft bg-gradient-ink-deep text-ink-inverse shadow-soft-card p-6 md:p-7 flex flex-col gap-3 hover:opacity-95 transition-opacity"
              >
                <span className="text-[10px] font-mono uppercase tracking-[0.16em] opacity-70">
                  No runs yet
                </span>
                <p className="text-sm leading-relaxed opacity-90">
                  Trigger the housekeeping-scheduler to draft
                  tomorrow's assignment matrix from today's roster +
                  expected turnovers.
                </p>
                <span className="self-start">
                  <HandoffBadge tone="soft">Run scheduler →</HandoffBadge>
                </span>
              </Link>
            ) : (
              <div className="flex flex-col gap-3">
                {schedulerOutputs.map((o) => (
                  <Link
                    key={o.id}
                    href={`/dashboard/ai`}
                    className="rounded-3xl border border-line-soft bg-gradient-ink-deep text-ink-inverse shadow-soft-card p-5 md:p-6 flex flex-col gap-2 hover:opacity-95 transition-opacity"
                  >
                    <span className="text-[10px] font-mono uppercase tracking-[0.16em] opacity-70">
                      {new Date(o.createdAt).toLocaleDateString("en-US", {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "numeric",
                      })}
                    </span>
                    <h4 className="text-sm font-medium line-clamp-2">
                      {o.title}
                    </h4>
                    <p className="text-xs opacity-90 leading-relaxed line-clamp-3">
                      {o.summary}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
