import Link from "next/link";
import {
  ArrowUpRight,
  Inbox,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { DashboardKpi } from "@/components/ui/primitives";
import {
  GuestArrivalsList,
  HalfDonutGauge,
  HeroGreetingAI,
  KpiRowMixed,
  PatrolTimeline,
  type GuestArrivalItem,
  type KpiItem,
  type PatrolEvent,
} from "@/components/award";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { getCurrentAppUser } from "@/features/auth/current-user";
import {
  countSessionsByStatus,
  listAdminSessions,
} from "@/features/guest-ai-concierge/services";
import { countHandoffsByStatus } from "@/features/guest-ai-concierge/handoff-services";
import { getOrderStats } from "@/features/guest-services/services";
import { listArrivals } from "@/features/front-office/services";
import { isAiConfigured, isAiDryRun } from "@/lib/env";
import { loadConciergeHandoffOutputs } from "@/lib/development/server/ai/concierge-handoff-queries";
import { isAgentEnabledForCurrentOrg } from "@/features/ai-agents/is-agent-enabled-for-org";
import { safeQuery } from "@/lib/development/safe-query";

/**
 * Mega-Sprint / Phase 10 — Concierge cabinet apex consolidating
 * guest-ai + guest-services + guest-journey hubs into a single
 * `/dashboard/concierge` surface per the operator decision lock
 * ("merge 3 hubs into /dashboard/concierge"). The three legacy hubs
 * survive as sub-routes; the cabinet apex pulls their stats into one
 * Sprint-4 gold-standard view.
 *
 * AI placeholder ships pointing at the future `concierge-handoff`
 * operator-facing agent (today's Concierge AI is guest-facing).
 */

export const metadata = { title: "Concierge" };
export const dynamic = "force-dynamic";

function todayLabel(now: Date): string {
  const day = now.getDate();
  const weekday = now.toLocaleDateString("en-US", { weekday: "short" });
  const month = now.toLocaleDateString("en-US", { month: "long" });
  return `${day} · ${weekday}, ${month}`;
}

function readinessFor(
  readiness: string,
): "ready" | "in_progress" | "blocked" | "unknown" {
  switch (readiness) {
    case "ready":
      return "ready";
    case "in_progress":
    case "preparing":
      return "in_progress";
    case "blocked":
    case "blocker":
      return "blocked";
    default:
      return "unknown";
  }
}

export default async function ConciergeCabinetPage() {
  const today = new Date();
  const me = await getCurrentAppUser();
  const firstName = me?.fullName?.trim().split(/\s+/)[0] ?? null;

  const [
    sessionCounts,
    handoffCounts,
    orderStats,
    recentSessions,
    arrivals,
    handoffOutputs,
    handoffEnabled,
  ] = await Promise.all([
    // STAB-3 fix: wrap every concierge cabinet fetch in safeQuery
    // (4s timeout). The `listAdminSessions` query joins
    // guest_ai_concierge_sessions × guest_stay_tokens × bookings ×
    // a CTE for message counts, and was timing out at the PG layer
    // (statement-timeout 57014) under non-trivial data load. The
    // unhandled rejection bubbled up and crashed the whole page
    // with a 500. Same pattern as STAB-2's reservations fix.
    safeQuery(
      "concierge:countSessionsByStatus",
      countSessionsByStatus(),
      { active: 0, archived: 0, refused: 0 },
      4000,
    ),
    safeQuery(
      "concierge:countHandoffsByStatus",
      countHandoffsByStatus(),
      { created: 0, linked: 0, acknowledged: 0, resolved: 0, urgent: 0 },
      4000,
    ),
    safeQuery(
      "concierge:getOrderStats",
      getOrderStats(),
      {
        total: 0,
        active: 0,
        fulfilled: 0,
        cancelled: 0,
        pendingFinanceBridge: 0,
        bridgedRevenueMinor: 0n,
        currency: null,
      },
      4000,
    ),
    safeQuery(
      "concierge:listAdminSessions",
      listAdminSessions({ limit: 8, status: "active" }),
      [],
      4000,
    ),
    safeQuery("concierge:listArrivals", listArrivals(today), [], 4000),
    loadConciergeHandoffOutputs({ limit: 3 }).catch(() => []),
    isAgentEnabledForCurrentOrg("concierge_handoff").catch(() => false),
  ]);

  const live = isAiConfigured() && !isAiDryRun();
  const openHandoffs =
    handoffCounts.created + handoffCounts.linked + handoffCounts.acknowledged;
  const handoffHealth =
    sessionCounts.active > 0
      ? Math.round(
          ((sessionCounts.active - openHandoffs) / sessionCounts.active) * 100,
        )
      : 100;

  const kpis: KpiItem[] = [
    {
      label: "Active sessions",
      value: String(sessionCounts.active),
      delta:
        sessionCounts.active === 0
          ? "Inbox is quiet"
          : `${sessionCounts.archived} archived · ${sessionCounts.refused} refused`,
      href: "/dashboard/guest-ai/sessions",
    },
    {
      label: "Awaiting human handoff",
      value: String(openHandoffs),
      delta:
        handoffCounts.urgent > 0
          ? `${handoffCounts.urgent} urgent`
          : openHandoffs === 0
            ? "No escalations"
            : "Pending response",
      href: "/dashboard/guest-ai/handoffs",
    },
    {
      label: "Live service orders",
      value: String(orderStats.active),
      delta: `${orderStats.fulfilled} fulfilled · ${orderStats.cancelled} cancelled`,
      href: "/dashboard/guest-services/orders",
    },
    {
      label: "AI mode",
      value: live ? "Live" : "Fallback",
      delta: live
        ? "ANTHROPIC_API_KEY set"
        : "Deterministic answers",
      href: "/dashboard/guest-ai",
    },
  ];

  const arrivalItems: GuestArrivalItem[] = arrivals.slice(0, 6).map((a) => ({
    id: a.bookingId,
    guestDisplay: a.guestDisplay,
    guestsCount: a.guestsCount,
    villaCode: a.villaCode ?? "—",
    villaSubtitle: a.projectName ?? undefined,
    channelName: a.channelName,
    timestamp: a.checkInDate,
    readiness: readinessFor(a.readinessStatus),
    hasOpenServiceRequest: a.hasOpenServiceRequest,
    href: `/dashboard/bookings/${a.bookingId}`,
  }));

  const timelineEvents: PatrolEvent[] = recentSessions.map((s) => ({
    id: s.id,
    timestamp: s.lastMessageAt
      ? new Date(s.lastMessageAt).toISOString().slice(11, 16)
      : "—",
    status: "info",
    title: `Session ${s.tokenPrefix ?? "—"}`,
    body: `${s.bookingCode ?? "no booking"} · ${s.messageCount} messages`,
    kind: "check",
    href: `/dashboard/guest-ai/sessions/${s.id}`,
    statusLabel: "active",
  }));

  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <HeroGreetingAI
        firstName={firstName}
        role="Concierge · Cabinet"
        dateLabel={todayLabel(today)}
        aiPromptPlaceholder="Concierge handoff agent — coming soon."
        showMyTasksHref="/dashboard/guest-ai/handoffs"
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        {[
          {
            href: "/dashboard/guest-ai/handoffs",
            icon: Inbox,
            label: "Review handoffs",
            caption:
              openHandoffs > 0
                ? `${openHandoffs} open · ${handoffCounts.urgent} urgent`
                : "No escalations",
          },
          {
            href: "/dashboard/guest-services/orders",
            icon: UserPlus,
            label: "Service orders",
            caption: `${orderStats.active} live · ${orderStats.fulfilled} fulfilled`,
          },
          {
            href: "/dashboard/guest-ai",
            icon: Sparkles,
            label: "Guest AI surface",
            caption: live ? "Live mode" : "Fallback mode",
          },
        ].map(({ href, icon: Icon, label, caption }) => (
          <Link
            key={href}
            href={href}
            className="rounded-3xl border border-line-soft bg-surface shadow-soft-card px-5 py-4 flex items-center gap-4 hover:bg-muted/40 transition-colors"
          >
            <span className="shrink-0 w-10 h-10 rounded-full bg-gradient-coral-soft border border-line-soft inline-flex items-center justify-center">
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

      <KpiRowMixed kpis={kpis} heroTone="coral-solid" />

      <Section
        eyebrow="Today's pulse"
        title="Handoff health"
        description="Share of active concierge sessions that are not currently awaiting human handoff."
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
          <HalfDonutGauge
            variant="emerald"
            value={handoffHealth}
            max={100}
            label={
              <>
                <p className="text-display text-[28px] md:text-[36px] leading-none font-medium text-ink tabular-nums">
                  {handoffHealth}%
                </p>
                <p className="text-xs text-ink-tertiary mt-1">
                  Sessions self-served
                </p>
              </>
            }
            legend={[
              {
                label: `${Math.max(0, sessionCounts.active - openHandoffs)} self-served`,
              },
              {
                label: `${openHandoffs} need human`,
                color: "var(--line-strong)",
              },
            ]}
          />
          <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 md:p-6 flex flex-col gap-3">
            <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
              Service-order revenue
            </span>
            <p className="text-display text-[32px] leading-none font-medium font-mono tabular-nums text-ink">
              {orderStats.bridgedRevenueMinor > 0
                ? `${orderStats.currency ?? "USD"} ${(Number(orderStats.bridgedRevenueMinor) / 100).toLocaleString()}`
                : "—"}
            </p>
            <p className="text-xs text-ink-secondary leading-relaxed">
              {orderStats.pendingFinanceBridge > 0
                ? `${orderStats.pendingFinanceBridge} fulfilled orders awaiting finance bridge.`
                : "All fulfilled orders are bridged into the revenue ledger."}
            </p>
            <Link
              href="/dashboard/guest-services/finance-bridge"
              className="text-xs text-info hover:underline self-start"
            >
              Finance bridge →
            </Link>
          </div>
        </div>
      </Section>

      <Section
        eyebrow="Arrivals"
        title="Today's guest arrivals"
        description="Use this list to anticipate concierge demand for the next 24 hours."
        action={
          <Link
            href="/dashboard/front-office/arrivals"
            className="text-xs text-ink-tertiary hover:underline"
          >
            Full arrivals board →
          </Link>
        }
      >
        <GuestArrivalsList
          items={arrivalItems}
          maxVisible={6}
          moreHref="/dashboard/front-office/arrivals"
          emptyMessage="No arrivals today."
        />
      </Section>

      <Section
        eyebrow="Activity"
        title="Recent concierge sessions"
        description="Most-recent active sessions across all stays."
        action={
          <Link
            href="/dashboard/guest-ai/sessions"
            className="text-xs text-ink-tertiary hover:underline"
          >
            All sessions →
          </Link>
        }
      >
        {timelineEvents.length === 0 ? (
          <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 text-sm text-ink-tertiary">
            No active sessions yet. Guests will appear here when they
            engage the in-stay concierge.
          </div>
        ) : (
          <PatrolTimeline
            events={timelineEvents}
            maxVisible={8}
            moreHref="/dashboard/guest-ai/sessions"
          />
        )}
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Section
            eyebrow="Hubs"
            title="Concierge surfaces"
            description="The three previously-separate hubs survive as sub-routes under this cabinet."
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <HubCard
                href="/dashboard/guest-ai"
                title="Guest AI"
                detail={`${sessionCounts.active} active sessions`}
              />
              <HubCard
                href="/dashboard/guest-services"
                title="Guest services"
                detail={`${orderStats.active} live orders`}
              />
              <HubCard
                href="/dashboard/guest-journey"
                title="Guest journey"
                detail="Lifecycle templates"
              />
            </div>
          </Section>
        </div>

        <aside className="flex flex-col gap-4">
          <Section eyebrow="Stats" title="Quick reference">
            <DashboardKpi
              label="Refusals (all-time)"
              value={String(sessionCounts.refused)}
              status={sessionCounts.refused > 0 ? "warn" : "neutral"}
              drillHref="/dashboard/guest-ai/sessions"
            />
          </Section>

          <Section eyebrow="AI" title="Concierge handoff agent">
            {!handoffEnabled ? (
              <Link
                href="/dashboard/settings/ai-agents/concierge_handoff"
                className="rounded-3xl border border-line-soft bg-gradient-ink-deep text-ink-inverse shadow-soft-card p-6 md:p-7 flex flex-col gap-3 hover:opacity-95 transition-opacity"
              >
                <span className="text-[10px] font-mono uppercase tracking-[0.16em] opacity-70">
                  Coming soon · Configure key
                </span>
                <p className="text-sm leading-relaxed opacity-90">
                  The concierge-handoff agent ships with a dry-run
                  default. Wire a provider key to flip it live;
                  ranked attention list surfaces here.
                </p>
                <Badge tone="outline" className="self-start">
                  Configure provider →
                </Badge>
              </Link>
            ) : handoffOutputs.length === 0 ? (
              <Link
                href="/dashboard/ai/jobs?agent=concierge_handoff"
                className="rounded-3xl border border-line-soft bg-gradient-ink-deep text-ink-inverse shadow-soft-card p-6 md:p-7 flex flex-col gap-3 hover:opacity-95 transition-opacity"
              >
                <span className="text-[10px] font-mono uppercase tracking-[0.16em] opacity-70">
                  No runs yet
                </span>
                <p className="text-sm leading-relaxed opacity-90">
                  Trigger the concierge-handoff agent to rank active
                  sessions by human-attention urgency.
                </p>
                <Badge tone="outline" className="self-start">
                  Run agent →
                </Badge>
              </Link>
            ) : (
              <div className="flex flex-col gap-3">
                {handoffOutputs.map((o) => (
                  <Link
                    key={o.id}
                    href={`/dashboard/ai/outputs/${o.outputCode}`}
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
          </Section>
        </aside>
      </div>
    </div>
  );
}

function HubCard({
  href,
  title,
  detail,
}: {
  href: string;
  title: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-line-soft bg-surface p-5 shadow-soft-card hover:shadow-elevated-card hover:border-line-strong transition-all block"
    >
      <div className="text-ink font-medium text-base">{title}</div>
      <div className="text-sm text-ink-secondary mt-1">{detail}</div>
    </Link>
  );
}
