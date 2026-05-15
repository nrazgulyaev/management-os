/**
 * Sprint 1 / Task 4 — Mgmt OS dashboard apex.
 *
 * Rebuilt on the Stage 10.6.C.1 hero tokens + Sprint 1 chart
 * primitives (AreaChartCard, DonutRatioCard, ProfileRailCard,
 * CommsPanel, SparklineChart). Score target vs the doctor-dashboard
 * reference: 2/5 → ≥4/5.
 *
 * Composition (top → bottom):
 *   Row 1 — CabinetGreetingBlock with time-of-day greeting
 *   Row 2 — hero KPI (villas) + AreaChartCard (revenue 6mo) + ProfileRailCard
 *   Row 3 — 4 tonal mini KPIs (bookings · MTD revenue · check-ins · tickets)
 *   Row 4 — today's schedule (2/3) + CommsPanel notifications (1/3)
 *   Row 5 — donut occupancy + donut on-time turnover + Operations Copilot
 *
 * Data: reuses `getLiveDashboardCounts()` + existing mock catalogues
 * (mockVillas, housekeepingTasks, maintenanceTickets, portfolioMetrics,
 * monthlyRevenueStrip). Falls back gracefully when the DB is absent so
 * demo mode keeps working.
 *
 * Constraints honoured (Sprint 1 spec):
 *   - No new tokens
 *   - No middleware changes
 *   - DashboardShell (layout.tsx) untouched
 *   - Other /dashboard/* routes untouched
 */

import Link from "next/link";
import {
  ArrowUpRight,
  Building2,
  CalendarCheck2,
  KeyRound,
  Sparkles,
  Wallet,
  Wrench,
} from "lucide-react";
import {
  AreaChartCard,
  CabinetGreetingBlock,
  CommsPanel,
  DashboardKpi,
  DonutRatioCard,
  ProfileRailCard,
  SparklineChart,
  type AreaChartPoint,
  type CommsItem,
  type ProfileRailItem,
} from "@/components/ui/primitives";
import { ProductAccessChangedBanner } from "@/components/layout/product-access-changed-banner";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { getLiveDashboardCounts } from "@/features/dashboard/live-counts";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { mockVillas } from "@/lib/mock/villas";
import {
  housekeepingTasks,
  maintenanceTickets,
} from "@/lib/mock/operations";
import {
  monthlyRevenueStrip,
  portfolioMetrics,
} from "@/lib/mock/metrics";
import { synthSparklineSeries } from "@/lib/sparkline-series";

export const metadata = { title: "Portfolio overview" };
export const dynamic = "force-dynamic";

function rupiahShort(minor: number): string {
  // Display IDR in billions for headline KPIs; metrics mock uses
  // minor-units, so 10^11 = 1B IDR.
  if (minor >= 1_000_000_000_000) {
    return `Rp ${(minor / 100_000_000_000).toFixed(1)}B`;
  }
  if (minor >= 1_000_000_000) {
    return `Rp ${(minor / 100_000_000).toFixed(1)}M`;
  }
  return `Rp ${(minor / 1_000_000).toFixed(0)}K`;
}

export default async function DashboardHome({
  searchParams,
}: {
  // Sprint 3c — `?from=<product>&reason=<…>` is set when
  // enforceProductAccess() redirects a user here after losing access
  // to another product. The banner below surfaces the explanation.
  searchParams?: Promise<{ from?: string; reason?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const [liveCounts, me] = await Promise.all([
    getLiveDashboardCounts(),
    getCurrentAppUser(),
  ]);
  const firstName = me?.fullName?.trim().split(/\s+/)[0] ?? null;

  // ---------- derived datasets ----------

  const villaCount = liveCounts?.villas ?? mockVillas.length;
  const upcomingCheckIns =
    liveCounts?.upcomingCheckIns ?? portfolioMetrics.upcomingCheckins.value;
  const activeBookings =
    liveCounts?.activeBookings ?? mockVillas.filter((v) => v.status === "occupied").length;
  const openTickets = maintenanceTickets.length;

  // Revenue area-chart series, last 6 months. Source values arrive
  // in millions (1_364 → 1.364B IDR); scale to billions upstream so
  // the AreaChartCard's serialisable format spec ("number-2dp" with
  // "Rp " prefix + "B" suffix) renders the right magnitude. The
  // previous function-prop formatter triggered the RSC
  // "Functions cannot be passed directly to Client Components"
  // crash on /dashboard.
  const revenueSeries: AreaChartPoint[] = monthlyRevenueStrip.map((m) => ({
    date: m.month,
    value: m.revenue / 1000,
  }));
  // Peak month for the pinned tooltip.
  const peakMonth = revenueSeries.reduce((best, p) =>
    p.value > best.value ? p : best,
  );
  const peakMonthLabel = `Rp ${peakMonth.value.toFixed(2)}B`;

  // Profile rail — top 5 occupancy villas as "active" items.
  const topVillas: ProfileRailItem[] = [...mockVillas]
    .sort((a, b) => b.occupancyYTD - a.occupancyYTD)
    .slice(0, 5)
    .map((v) => ({
      label: `${v.code} · ${v.name}`,
      sublabel: `${v.occupancyYTD.toFixed(1)}% YTD · ${v.project}`,
      href: `/dashboard/villas/${v.id}`,
    }));

  // Notifications — derived from current ops state. No mock-notification
  // fixture exists yet; this composes from real operations data so the
  // panel is always populated (production-ready: the same shape consumes
  // a real notifications query when one ships).
  const notifications: CommsItem[] = [
    ...maintenanceTickets.slice(0, 2).map<CommsItem>((t) => ({
      from: `Maintenance · ${t.villaCode}`,
      body: t.title,
      timestamp: t.openedAgo,
    })),
    ...housekeepingTasks
      .filter((t) => t.status === "awaiting_approval")
      .slice(0, 2)
      .map<CommsItem>((t) => ({
        from: `Housekeeping · ${t.villaCode}`,
        body: `${t.checklistDone}/${t.checklistTotal} items · ${t.assignee}`,
        timestamp: t.scheduledAt,
      })),
    {
      from: "Finance",
      body: `7 owner payouts queued · ${rupiahShort(742_100_000_000)}`,
      timestamp: "now",
    },
  ].slice(0, 5);

  // Schedule rows (housekeeping + maintenance, sorted by best-effort time).
  const scheduleRows = [
    ...housekeepingTasks.map((t) => ({
      key: `hk-${t.id}`,
      time: t.scheduledAt,
      title: `${t.villa} · turnover`,
      meta: `${t.assignee} · ${t.checklistDone}/${t.checklistTotal} items`,
      badgeTone:
        t.status === "awaiting_approval"
          ? ("warning" as const)
          : t.status === "in_progress"
            ? ("info" as const)
            : ("neutral" as const),
      badgeLabel:
        t.status === "awaiting_approval"
          ? "Awaiting approval"
          : t.status === "in_progress"
            ? "In progress"
            : "Queued",
    })),
    ...maintenanceTickets.slice(0, 3).map((t) => ({
      key: `mt-${t.id}`,
      time: t.openedAgo,
      title: `${t.villaCode} · ${t.title}`,
      meta: `${t.category} · ${t.assignee ?? "Unassigned"}`,
      badgeTone:
        t.priority === "p1"
          ? ("danger" as const)
          : t.priority === "p2"
            ? ("warning" as const)
            : ("neutral" as const),
      badgeLabel: t.priority.toUpperCase(),
    })),
  ];

  // Occupancy + on-time turnover donut inputs.
  const bookedNights = Math.round(
    villaCount * 30 * (portfolioMetrics.occupancyYTD.value / 100),
  );
  const totalNights = villaCount * 30;
  const onTimeTurnover = housekeepingTasks.filter(
    (t) => t.status === "approved" || t.status === "in_progress",
  ).length;
  const totalTurnover = housekeepingTasks.length || 1;

  return (
    <div className="flex flex-col gap-8">
      {/* Sprint 3c — soft toast when redirected from a now-inaccessible
          product (e.g. just lost access to Dev OS via plan change). */}
      <ProductAccessChangedBanner from={sp.from} reason={sp.reason} />
      {/* Row 1 — greeting */}
      <CabinetGreetingBlock
        firstName={firstName}
        eyebrow="Portfolio overview"
        subline={`${villaCount} villas across three projects · ${upcomingCheckIns} check-ins on the 14-day horizon`}
        badge={
          maintenanceTickets.some((t) => t.sla === "warn") ? (
            <Badge tone="warning">SLA attention</Badge>
          ) : (
            <Badge tone="outline">All clear</Badge>
          )
        }
      />

      {/* Row 2 — hero KPI · revenue area · profile rail */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        <DashboardKpi
          variant="hero"
          tone="ink-deep"
          label="Villas under management"
          value={String(villaCount)}
          hint={`${activeBookings} occupied tonight`}
          delta={{ value: portfolioMetrics.occupancyYTD.deltaYoY, label: "occupancy YoY" }}
          drillHref="/dashboard/villas"
          className="lg:col-span-1"
          sparkline={
            <SparklineChart
              tone="emerald"
              height={40}
              data={synthSparklineSeries(
                villaCount,
                portfolioMetrics.occupancyYTD.deltaYoY,
              )}
            />
          }
        />

        <AreaChartCard
          className="lg:col-span-2"
          title="Revenue · last 6 months"
          period="Monthly · IDR"
          tone="emerald"
          data={revenueSeries}
          chartHeight={220}
          formatSpec="number-2dp"
          valuePrefix="Rp "
          valueSuffix="B"
          pinnedTooltip={{
            value: peakMonthLabel,
            label: `${peakMonth.date} · peak`,
          }}
          accessory={
            <span className="inline-flex items-center gap-1 rounded-full bg-success-weak text-success px-2.5 py-1 text-xs font-medium tabular-nums">
              ▲ {portfolioMetrics.grossRevenueMTD.deltaYoY.toFixed(1)}% YoY
            </span>
          }
        />

        <ProfileRailCard
          className="lg:col-span-1"
          user={{
            name: me?.fullName ?? "Welcome to Arconique",
            role: me ? "Operator" : "Demo mode",
          }}
          org={{ name: "Arconique", code: "ARC" }}
          itemsHeading="Top-occupancy villas"
          items={topVillas}
        />
      </div>

      {/* Row 3 — small tonal KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <DashboardKpi
          tone="emerald-soft"
          label="Active bookings"
          value={String(activeBookings)}
          status="good"
          drillHref="/dashboard/bookings"
        />
        <DashboardKpi
          tone="gold-soft"
          label="MTD revenue"
          value={rupiahShort(portfolioMetrics.grossRevenueMTD.value)}
          delta={{ value: portfolioMetrics.grossRevenueMTD.deltaYoY, label: "YoY" }}
          drillHref="/dashboard/finance/revenue"
        />
        <DashboardKpi
          tone="surface"
          label="Upcoming check-ins · 14d"
          value={String(upcomingCheckIns)}
          hint={`${portfolioMetrics.upcomingCheckins.today} today`}
          drillHref="/dashboard/front-office/arrivals"
        />
        <DashboardKpi
          tone="coral-soft"
          label="Open tickets"
          value={String(openTickets)}
          status={
            maintenanceTickets.some((t) => t.sla === "warn")
              ? "warn"
              : "neutral"
          }
          drillHref="/dashboard/operations"
        />
      </div>

      {/* Row 4 — schedule + notifications */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Section
          eyebrow="Today"
          title="Today's schedule"
          description="Housekeeping turnovers and open maintenance, ordered by time."
          action={
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/operations">
                Open ops board
                <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
              </Link>
            </Button>
          }
          className="lg:col-span-2"
        >
          {scheduleRows.length === 0 ? (
            <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card px-6 py-10 text-center text-sm text-ink-tertiary">
              Nothing scheduled today.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {scheduleRows.map((row) => (
                <li
                  key={row.key}
                  className="rounded-3xl border border-line-soft bg-surface shadow-soft-card px-5 py-4 flex items-center gap-4"
                >
                  <span className="font-mono tabular-nums text-xs text-ink-tertiary w-16 shrink-0">
                    {row.time}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink truncate">
                      {row.title}
                    </div>
                    <div className="text-[11px] text-ink-tertiary truncate">
                      {row.meta}
                    </div>
                  </div>
                  <Badge tone={row.badgeTone}>{row.badgeLabel}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <CommsPanel
          variant="notifications"
          header={{
            title: "Notifications",
            subtitle: `Latest ${notifications.length}`,
          }}
          items={notifications}
          emptyMessage="No notifications right now — quiet day."
          className="lg:col-span-1"
        />
      </div>

      {/* Row 5 — donuts + operations copilot */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <DonutRatioCard
          title="Occupancy this month"
          tone="gold"
          numerator={bookedNights}
          denominator={totalNights}
          changePercent={portfolioMetrics.occupancyYTD.deltaYoY}
          caption={`${villaCount} villas · 30-night window`}
        />
        <DonutRatioCard
          title="On-time turnover"
          tone="emerald"
          numerator={onTimeTurnover}
          denominator={totalTurnover}
          caption="Housekeeping completing on schedule today"
        />

        {/* Operations Copilot — preserved from Stage 10.5.A but
            re-rounded onto the new soft-card geometry. */}
        <section
          className="rounded-3xl border border-line-soft bg-gradient-emerald-soft shadow-soft-card p-6 flex flex-col gap-4"
          data-stage10="dashboard-ops-copilot"
        >
          <header className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-full bg-ink text-ink-inverse inline-flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" strokeWidth={1.75} />
            </span>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium text-ink truncate">
                Operations Copilot
              </span>
              <span className="text-[11px] text-ink-tertiary">
                AM briefing · modelled
              </span>
            </div>
            <Badge tone="outline" className="ml-auto">
              Preview
            </Badge>
          </header>
          <p className="text-sm text-ink leading-relaxed">
            Three arrivals on the books, all on track except{" "}
            <strong>EV-07</strong>, where the supervisor approval has not yet
            cleared. Enso S6 remains blocked on pool parts; vendor ETA Friday.
          </p>
          <ul className="flex flex-col gap-1.5 text-xs text-ink-secondary">
            <li className="flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-ink-tertiary" />
              Clear EV-07 supervisor review to hold 15:00 check-in.
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-ink-tertiary" />
              Move ES-S6 ticket to Day 2; reassign tech to ES-S2.
            </li>
          </ul>
          <div className="mt-auto flex items-center gap-3 flex-wrap pt-2">
            <Button asChild size="sm" variant="secondary">
              <Link href="/dashboard/ai">
                Open Operations Copilot
                <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
              </Link>
            </Button>
            <span className="text-[11px] text-ink-tertiary">
              Briefing not yet wired. AI runtime arrives in Version 4.
            </span>
          </div>
        </section>
      </div>

      {/* Quick-actions strip — preserved drill links from the previous
          apex so muscle-memory survives the rebuild. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { href: "/dashboard/finance", label: "Finance", icon: Wallet },
          { href: "/dashboard/operations", label: "Operations", icon: Wrench },
          {
            href: "/dashboard/front-office/arrivals",
            label: "Arrivals",
            icon: KeyRound,
          },
          {
            href: "/dashboard/villas",
            label: "Villas",
            icon: Building2,
          },
        ].map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="rounded-3xl border border-line-soft bg-surface shadow-soft-card px-5 py-4 flex items-center justify-between gap-3 hover:bg-muted transition-colors"
          >
            <span className="flex items-center gap-2.5 text-sm font-medium text-ink">
              <Icon className="w-4 h-4 text-ink-tertiary" strokeWidth={1.75} />
              {label}
            </span>
            <ArrowUpRight
              className="w-4 h-4 text-ink-tertiary"
              strokeWidth={1.75}
            />
          </Link>
        ))}
      </div>

      {/* Tonight's villa pulse — keeps the existing villa-card grid as
          a secondary glanceable surface below the hero rows. */}
      <Section
        eyebrow="Tonight"
        title="Tonight's villa pulse"
        description="Live from the status board. Tap to open."
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/villas">All villas</Link>
          </Button>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {mockVillas.slice(0, 8).map((v) => (
            <Link
              key={v.id}
              href={`/dashboard/villas/${v.id}`}
              className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-4 flex flex-col gap-3 hover:bg-muted transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-ink-tertiary">
                  {v.code}
                </span>
                <StatusPill status={v.status} />
              </div>
              <div>
                <div className="text-ink text-sm font-medium">{v.name}</div>
                <div className="text-xs text-ink-tertiary">{v.project}</div>
              </div>
              <div className="pt-3 mt-auto border-t border-line-soft flex items-center justify-between">
                <span className="text-[11px] text-ink-tertiary inline-flex items-center gap-1">
                  <CalendarCheck2
                    className="w-3 h-3"
                    strokeWidth={1.75}
                  />
                  MTD
                </span>
                <span className="font-mono tabular-nums text-sm text-ink">
                  {rupiahShort(v.mtdRevenue)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </Section>
    </div>
  );
}
