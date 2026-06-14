import type { Metadata } from "next";
import Link from "next/link";
import { DashboardKpi, NoItemsYet } from "@/components/ui/primitives";
import { HeroGreetingAI } from "@/components/award";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { loadOwnerCabinet } from "@/lib/development/server/cabinets/owner-cabinet-queries";
import { safeQuery } from "@/lib/development/safe-query";

function todayLabel(now: Date): string {
  const day = now.getDate();
  const weekday = now.toLocaleDateString("en-US", { weekday: "short" });
  const month = now.toLocaleDateString("en-US", { month: "long" });
  return `${day} · ${weekday}, ${month}`;
}

/**
 * Stage 10.5.A.1.1 — Owner dashboard (Mgmt OS).
 *
 * First of three "award-winning" cabinet dashboards in batch 10.5.A.1.
 * Hotfix HF-2 — Owner migrated off the legacy CabinetGreetingBlock +
 * PageHeaderHero stack onto <HeroGreetingAI hideAiInput> so the
 * cabinet matches every other Mgmt-OS apex. The page keeps 4
 * <DashboardKpi> with trend deltas + a portfolio grid + a
 * side-column alerts feed.
 *
 * The wrapping (dashboard) layout already enforces `mgmt` product
 * access; per-role authorization is intentionally absent here so that
 * owner-track, super_admin, and any internal user reviewing a customer
 * org can land on the same page. The underlying owner-intelligence
 * services do their own per-owner RLS.
 */

export const metadata: Metadata = { title: "Owner overview · Dashboard" };
export const dynamic = "force-dynamic";

export default async function OwnerDashboardPage() {
  const me = await getCurrentAppUser();
  const firstName = me?.fullName?.trim().split(/\s+/)[0] ?? null;

  const data = await safeQuery(
    "ownerCabinet",
    loadOwnerCabinet({ greetingFirstName: firstName }),
    {
      greetingFirstName: firstName,
      villasCount: 0,
      villasInGoodHealthCount: 0,
      villasInGoodHealthDeltaPct: null,
      averageHealthScore: null,
      averageHealthScoreDelta: null,
      reviewsCount: 0,
      negativeReviewsCount: 0,
      villas: [],
      alerts: [],
    },
  );

  const goodHealthDelta =
    data.villasInGoodHealthDeltaPct !== null
      ? { value: data.villasInGoodHealthDeltaPct, label: "vs prior period" }
      : undefined;
  const scoreDelta =
    data.averageHealthScoreDelta !== null
      ? {
          value: data.averageHealthScoreDelta,
          label: "pts vs prior period",
        }
      : undefined;
  const negativeStatus =
    data.negativeReviewsCount === 0
      ? "good"
      : data.negativeReviewsCount > 2
        ? "bad"
        : "warn";

  const greetingLine =
    data.villasCount === 0
      ? "Welcome to Arconique."
      : `${data.villasCount} villa${data.villasCount === 1 ? "" : "s"} under your watch.`;
  const subline =
    data.villasCount === 0
      ? "Your portfolio will appear here once shares are linked."
      : `Portfolio health, reviews, and what needs your attention this week. ${data.alerts.length} ${data.alerts.length === 1 ? "alert" : "alerts"} on file.`;

  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <HeroGreetingAI
        firstName={firstName}
        role="Owner · Overview"
        dateLabel={todayLabel(new Date())}
        greetingOverride={greetingLine}
        subline={subline}
        hideAiInput
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <DashboardKpi
          variant="hero"
          tone="emerald-soft"
          label="Portfolio size"
          value={String(data.villasCount)}
          unit={data.villasCount === 1 ? "villa" : "villas"}
          status="neutral"
          drillHref="/dashboard/villas"
          hint="Active ownership shares"
          className="sm:col-span-2 lg:col-span-2"
        />
        <DashboardKpi
          label="Villas in good health"
          value={String(data.villasInGoodHealthCount)}
          unit={`/ ${data.villasCount}`}
          status={
            data.villasCount === 0
              ? "neutral"
              : data.villasInGoodHealthCount === data.villasCount
                ? "good"
                : data.villasInGoodHealthCount >= data.villasCount * 0.6
                  ? "warn"
                  : "bad"
          }
          delta={goodHealthDelta}
          drillHref="/dashboard/owner-intelligence/health"
          hint="Excellent or good"
        />
        <DashboardKpi
          label="Average health score"
          value={
            data.averageHealthScore !== null
              ? data.averageHealthScore.toFixed(0)
              : "—"
          }
          unit="/100"
          status={
            data.averageHealthScore === null
              ? "neutral"
              : data.averageHealthScore >= 80
                ? "good"
                : data.averageHealthScore >= 60
                  ? "warn"
                  : "bad"
          }
          delta={scoreDelta}
          drillHref="/dashboard/owner-intelligence/health"
        />
        <DashboardKpi
          label="Negative reviews"
          value={String(data.negativeReviewsCount)}
          unit={`/ ${data.reviewsCount}`}
          status={negativeStatus}
          drillHref="/dashboard/owner-intelligence/reviews"
          hint="Last 100 on file"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <div className="label">Portfolio</div>
              {data.villasCount > data.villas.length ? (
                <Link
                  href="/dashboard/villas"
                  className="text-sm text-info hover:underline"
                >
                  View all →
                </Link>
              ) : null}
            </div>
            {data.villas.length === 0 ? (
              <NoItemsYet
                entityLabel="villas"
                description="When ownership shares are linked to your account, your villas will surface here."
              />
            ) : (
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {data.villas.map((v) => (
                  <li
                    key={v.villaId}
                    className="rounded-3xl border border-line-soft bg-surface p-6 flex flex-col gap-3 shadow-soft-card"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          {v.villaName ?? v.villaCode ?? "Villa"}
                        </div>
                        {v.projectName && (
                          <div className="text-xs text-ink-tertiary truncate">
                            {v.projectName}
                          </div>
                        )}
                      </div>
                      {v.healthStatus && (
                        <HandoffBadge
                          tone={
                            v.healthStatus === "excellent" ||
                            v.healthStatus === "good"
                              ? "ok"
                              : v.healthStatus === "watch"
                                ? "warn"
                                : v.healthStatus === "attention"
                                  ? "danger"
                                  : "soft"
                          }
                        >
                          {v.healthStatus}
                        </HandoffBadge>
                      )}
                    </div>
                    <div className="flex items-baseline gap-3 text-sm text-ink-secondary">
                      <span>
                        Score{" "}
                        <span className="font-mono tabular-nums text-ink">
                          {v.healthScore !== null
                            ? v.healthScore.toFixed(0)
                            : "—"}
                        </span>
                        /100
                      </span>
                      <span>
                        Occupancy{" "}
                        <span className="font-mono tabular-nums text-ink">
                          {v.occupancyRate !== null
                            ? `${(v.occupancyRate * 100).toFixed(0)}%`
                            : "—"}
                        </span>
                      </span>
                    </div>
                    <Link
                      href={`/dashboard/owner-intelligence/health/${v.villaId}`}
                      className="text-xs text-info hover:underline mt-auto"
                    >
                      Open villa →
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <div>
            <div className="label mb-2.5">Inbox</div>
            {data.alerts.length === 0 ? (
              <div className="rounded-md border border-line-soft bg-surface p-5 text-sm text-ink-secondary">
                Nothing pending. We&rsquo;ll surface watch-status villas and
                negative reviews here when they appear.
              </div>
            ) : (
              <ul className="rounded-3xl border border-line-soft bg-surface divide-y divide-line-soft shadow-soft-card overflow-hidden">
                {data.alerts.map((a, i) => (
                  <li key={`${a.kind}-${i}`} className="px-4 py-3">
                    <Link
                      href={a.href}
                      className="flex items-start justify-between gap-3 group"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-ink group-hover:underline truncate">
                          {a.villaName ?? a.villaCode ?? "Portfolio"}
                        </div>
                        <div className="text-xs text-ink-secondary truncate">
                          {a.detail}
                        </div>
                      </div>
                      <HandoffBadge
                        tone={a.kind === "attention" ? "danger" : "warn"}
                      >
                        {a.kind === "attention" ? "Attention" : "Review"}
                      </HandoffBadge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex justify-end">
              <Link
                href="/dashboard/owner-intelligence"
                className="text-xs text-ink-tertiary hover:underline"
              >
                Owner intelligence hub →
              </Link>
            </div>
          </div>

          <div>
            <div className="label mb-2.5">Quick links</div>
            <ul className="grid grid-cols-1 gap-2">
              <QuickLink
                href="/dashboard/owner-intelligence/calendar"
                label="Calendar"
              />
              <QuickLink
                href="/dashboard/owner-intelligence/bookings"
                label="Booking projection"
              />
              <QuickLink
                href="/dashboard/owner-intelligence/revenue"
                label="Revenue source mix"
              />
              <QuickLink
                href="/dashboard/owners"
                label="Statements & payouts"
              />
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <Link
        href={href}
        className="block rounded-2xl border border-line-soft bg-surface px-5 py-4 text-sm text-ink hover:border-line-strong hover:shadow-soft-card transition-all"
      >
        {label} <span aria-hidden>→</span>
      </Link>
    </li>
  );
}
