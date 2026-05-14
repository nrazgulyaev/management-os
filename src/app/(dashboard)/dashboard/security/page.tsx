import Link from "next/link";
import {
  ArrowUpRight,
  Camera,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { DashboardKpi } from "@/components/ui/primitives";
import {
  HalfDonutGauge,
  HatchedBarChart,
  HeroGreetingAI,
  KpiRowMixed,
  PatrolTimeline,
  type HatchedBarDatum,
  type KpiItem,
  type PatrolEvent,
} from "@/components/award";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { listSecurityCameraDevices } from "@/features/security/services";
import { listSecurityEventsForAdmin } from "@/features/security-baseline/mfa-services";
import { listOperationTasks } from "@/features/operations/services";

/**
 * Mega-Sprint / Phase 11 — Security cabinet REBUILD.
 *
 * The prior surface was a 42-LOC camera-registry stub. Per the audit
 * §M2 ("rebuild this into a real cabinet rather than refactor"),
 * this phase delivers a Sprint-4 gold-standard apex: HeroGreetingAI
 * shell, KpiRowMixed with ink-deep hero (Open incidents) + Camera
 * health + Patrol completion + Auth events, Today's-pulse hatched-
 * bar of daily auth events, <PatrolTimeline> of recent security
 * events, and the camera registry as a sub-surface card.
 *
 * Patrol completion is a derived heuristic from operation_tasks with
 * category = "security"; a proper patrol-log table is downstream
 * work tracked in the deferrals below.
 */

export const metadata = { title: "Security" };
export const dynamic = "force-dynamic";

function todayLabel(now: Date): string {
  const day = now.getDate();
  const weekday = now.toLocaleDateString("en-US", { weekday: "short" });
  const month = now.toLocaleDateString("en-US", { month: "long" });
  return `${day} · ${weekday}, ${month}`;
}

function bucketLast7Days(
  rows: Array<string>,
  today: Date,
): HatchedBarDatum[] {
  const counts = new Map<string, number>();
  for (const iso of rows) {
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

function severityStatus(
  severity: string,
): "ok" | "warn" | "alert" | "info" | "pending" {
  switch (severity) {
    case "critical":
    case "high":
      return "alert";
    case "warning":
    case "medium":
      return "warn";
    case "info":
      return "info";
    default:
      return "pending";
  }
}

export default async function SecurityCabinetPage() {
  const now = new Date();
  const me = await getCurrentAppUser();
  const firstName = me?.fullName?.trim().split(/\s+/)[0] ?? null;

  const [cameras, events, securityTasks] = await Promise.all([
    listSecurityCameraDevices(),
    listSecurityEventsForAdmin(50),
    listOperationTasks({ category: "security", limit: 100 }),
  ]);

  const totalCameras = cameras.length;
  const activeCameras = cameras.filter((c) => c.status === "active").length;
  const cameraHealthPct =
    totalCameras > 0
      ? Math.round((activeCameras / totalCameras) * 100)
      : 0;

  const openIncidents = securityTasks.filter(
    (t) => t.status !== "completed" && t.status !== "approved",
  ).length;

  // Patrol completion is approximated from security-category tasks
  // scheduled for today: completed / scheduled.
  const todayIso = now.toISOString().slice(0, 10);
  const todaysPatrols = securityTasks.filter(
    (t) => t.scheduledFor && t.scheduledFor.slice(0, 10) === todayIso,
  );
  const completedPatrols = todaysPatrols.filter(
    (t) => t.status === "completed" || t.status === "approved",
  ).length;
  const patrolPct =
    todaysPatrols.length > 0
      ? Math.round((completedPatrols / todaysPatrols.length) * 100)
      : 0;

  const eventsLast7Days = events.filter((e) => {
    const created = e.createdAt;
    if (!created) return false;
    const d = new Date(created);
    return now.getTime() - d.getTime() <= 7 * 86_400_000;
  });
  const eventsThisWeek = eventsLast7Days.length;
  const criticalEventsThisWeek = eventsLast7Days.filter(
    (e) => e.severity === "critical" || e.severity === "high",
  ).length;

  const dailyEvents = bucketLast7Days(
    events.map((e) => e.createdAt),
    now,
  );

  const kpis: KpiItem[] = [
    {
      label: "Open incidents",
      value: String(openIncidents),
      delta:
        openIncidents === 0
          ? "Site quiet"
          : "Need triage",
      href: "/dashboard/security/events",
    },
    {
      label: "Camera health",
      value: totalCameras > 0 ? `${cameraHealthPct}%` : "—",
      delta:
        totalCameras > 0
          ? `${activeCameras} of ${totalCameras} active`
          : "No cameras registered",
      href: "/dashboard/security/cameras",
    },
    {
      label: "Patrol completion (today)",
      value: todaysPatrols.length > 0 ? `${patrolPct}%` : "—",
      delta:
        todaysPatrols.length === 0
          ? "No patrols scheduled"
          : `${completedPatrols} of ${todaysPatrols.length} done`,
      href: "/dashboard/operations?category=security",
    },
    {
      label: "Auth events (7d)",
      value: String(eventsThisWeek),
      delta:
        criticalEventsThisWeek > 0
          ? `${criticalEventsThisWeek} critical`
          : "Within baseline",
      href: "/dashboard/security/events",
    },
  ];

  const timelineEvents: PatrolEvent[] = events.slice(0, 8).map((e) => ({
    id: e.id,
    timestamp: e.createdAt
      ? new Date(e.createdAt).toISOString().slice(11, 16)
      : "—",
    status: severityStatus(e.severity),
    title: e.eventType.replaceAll("_", " "),
    body:
      e.appUserId
        ? `user ${e.appUserId.slice(0, 8)} · ${e.severity}`
        : `system · ${e.severity}`,
    kind:
      e.severity === "critical" || e.severity === "high"
        ? "alert"
        : "incident",
    href: "/dashboard/security/events",
    statusLabel: e.severity,
  }));

  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <HeroGreetingAI
        firstName={firstName}
        role="Security · Cabinet"
        dateLabel={todayLabel(now)}
        aiPromptPlaceholder="Security copilot — coming soon."
        showMyTasksHref="/dashboard/security/events"
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        {[
          {
            href: "/dashboard/operations/tasks/new?category=security",
            icon: ShieldAlert,
            label: "Log patrol event",
            caption: "Create a security task",
          },
          {
            href: "/dashboard/security/cameras",
            icon: Camera,
            label: "Camera registry",
            caption: `${activeCameras}/${totalCameras} active`,
          },
          {
            href: "/dashboard/security/events",
            icon: Sparkles,
            label: "Auth events log",
            caption: `${eventsThisWeek} this week`,
          },
        ].map(({ href, icon: Icon, label, caption }) => (
          <Link
            key={href}
            href={href}
            className="rounded-3xl border border-line-soft bg-surface shadow-soft-card px-5 py-4 flex items-center gap-4 hover:bg-muted/40 transition-colors"
          >
            <span className="shrink-0 w-10 h-10 rounded-full bg-gradient-ink-deep text-ink-inverse border border-line-soft inline-flex items-center justify-center">
              <Icon className="w-4 h-4" strokeWidth={1.75} />
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

      <KpiRowMixed kpis={kpis} heroTone="ink-deep" />

      <Section
        eyebrow="Today's pulse"
        title="Auth-event cadence + camera health"
        description="Authentication + suspicious-request events per day over the last 7 days, alongside the share of registered cameras that are healthy."
      >
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 md:gap-5">
          <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 md:p-6 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
                Last 7 days
              </span>
              <span className="text-xs text-ink-tertiary tabular-nums">
                {eventsThisWeek} events · {criticalEventsThisWeek} critical
              </span>
            </div>
            <HatchedBarChart
              data={dailyEvents}
              tone="terracotta"
              height={200}
            />
          </div>
          <HalfDonutGauge
            variant="emerald"
            value={cameraHealthPct}
            max={100}
            label={
              <>
                <p className="text-display text-[28px] md:text-[36px] leading-none font-medium text-ink tabular-nums">
                  {totalCameras > 0 ? `${cameraHealthPct}%` : "—"}
                </p>
                <p className="text-xs text-ink-tertiary mt-1">
                  Camera health
                </p>
              </>
            }
            legend={[
              { label: `${activeCameras} active` },
              {
                label: `${Math.max(0, totalCameras - activeCameras)} offline`,
                color: "var(--line-strong)",
              },
            ]}
          />
        </div>
      </Section>

      <Section
        eyebrow="Activity"
        title="Recent security events"
        description="Last 8 auth + suspicious-request events, severity-coded."
        action={
          <Link
            href="/dashboard/security/events"
            className="text-xs text-ink-tertiary hover:underline"
          >
            All events →
          </Link>
        }
      >
        {timelineEvents.length === 0 ? (
          <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 text-sm text-ink-tertiary">
            No security events logged yet. MFA enrolment + login
            throttling will surface here as they happen.
          </div>
        ) : (
          <PatrolTimeline
            events={timelineEvents}
            maxVisible={8}
            moreHref="/dashboard/security/events"
          />
        )}
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Section
            eyebrow="Cameras"
            title="Camera registry"
            description="Registry only — the platform never streams video. Each entry links to the vendor app."
            action={
              <Link
                href="/dashboard/security/cameras"
                className="text-xs text-ink-tertiary hover:underline"
              >
                All cameras →
              </Link>
            }
          >
            {cameras.length === 0 ? (
              <div className="rounded-md border border-line-soft bg-surface p-5 text-sm text-ink-secondary">
                No cameras registered. Add one from the camera registry.
              </div>
            ) : (
              <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
                {cameras.slice(0, 6).map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/dashboard/security/cameras/${c.id}`}
                      className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover"
                    >
                      <span className="flex flex-col min-w-0">
                        <span className="text-sm text-ink truncate">
                          {c.name}
                        </span>
                        <span className="text-[11px] text-ink-tertiary">
                          {c.villaCode ?? c.projectName ?? "—"} ·{" "}
                          {c.locationLabel}
                        </span>
                      </span>
                      <Badge
                        tone={c.status === "active" ? "success" : "neutral"}
                      >
                        {c.status}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <aside className="flex flex-col gap-4">
          <Section eyebrow="Surfaces" title="Jump to">
            <ul className="grid grid-cols-1 gap-2">
              {[
                {
                  href: "/dashboard/security/auth",
                  label: "Authentication",
                },
                {
                  href: "/dashboard/security/mfa",
                  label: "MFA enrolment",
                },
                {
                  href: "/dashboard/security/login-attempts",
                  label: "Login attempts",
                },
                {
                  href: "/dashboard/operations?category=security",
                  label: "Security task board",
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
            <DashboardKpi
              label="Patrols today"
              value={String(todaysPatrols.length)}
              status="neutral"
              drillHref="/dashboard/operations?category=security"
              hint="Security-category tasks"
              className="mt-3"
            />
          </Section>

          <Section eyebrow="AI" title="Security copilot">
            <div className="rounded-3xl border border-line-soft bg-gradient-ink-deep text-ink-inverse shadow-soft-card p-6 md:p-7 flex flex-col gap-3">
              <span className="text-[10px] font-mono uppercase tracking-[0.16em] opacity-70">
                Coming soon
              </span>
              <p className="text-sm leading-relaxed opacity-90">
                A dedicated security copilot will surface camera-
                offline alerts, patrol-late warnings, and unusual
                auth patterns here. Until it ships, monitor the auth
                events log + camera registry directly.
              </p>
              <Badge tone="outline" className="self-start">
                security-copilot — not yet shipped
              </Badge>
            </div>
          </Section>
        </aside>
      </div>
    </div>
  );
}
