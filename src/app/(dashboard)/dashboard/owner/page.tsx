import type { Metadata } from "next";
import Link from "next/link";
import { DashboardKpi, NoItemsYet, PageHeaderHero } from "@/components/ui/primitives";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { loadOwnerCabinet } from "@/lib/development/server/cabinets/owner-cabinet-queries";
import { safeQuery } from "@/lib/development/safe-query";

/**
 * Stage 10.5.A.1.1 — Owner dashboard (Mgmt OS).
 *
 * First of three "award-winning" cabinet dashboards in batch 10.5.A.1.
 * Pattern: <PageHeaderHero> + 4 <DashboardKpi> with trend deltas + a
 * portfolio grid + a side-column alerts feed. Establishes the layout
 * vocabulary the next two batches reuse.
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

  return (
    <div className="flex flex-col gap-8">
      <PageHeaderHero
        firstName={firstName ?? undefined}
        eyebrow="Owner overview"
        title={
          data.villasCount === 0
            ? "Welcome to Arconique."
            : `${data.villasCount} villa${data.villasCount === 1 ? "" : "s"} under your watch.`
        }
        description="Portfolio health, reviews, and what needs your attention this week."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <DashboardKpi
          label="Portfolio size"
          value={String(data.villasCount)}
          unit={data.villasCount === 1 ? "villa" : "villas"}
          status="neutral"
          drillHref="/dashboard/villas"
          hint="Active ownership shares"
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
          <Section
            eyebrow="Portfolio"
            title="Villas at a glance"
            action={
              data.villasCount > data.villas.length ? (
                <Link
                  href="/dashboard/villas"
                  className="text-sm text-info hover:underline"
                >
                  View all →
                </Link>
              ) : null
            }
          >
            {data.villas.length === 0 ? (
              <NoItemsYet
                entityLabel="villas"
                description="When ownership shares are linked to your account, your villas will surface here."
              />
            ) : (
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {data.villas.map((v) => (
                  <li
                    key={v.villaId}
                    className="rounded-md border border-line-soft bg-surface p-4 flex flex-col gap-2"
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
                        <Badge
                          tone={
                            v.healthStatus === "excellent" ||
                            v.healthStatus === "good"
                              ? "success"
                              : v.healthStatus === "watch"
                                ? "warning"
                                : v.healthStatus === "attention"
                                  ? "danger"
                                  : "neutral"
                          }
                        >
                          {v.healthStatus}
                        </Badge>
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
          </Section>
        </div>

        <aside className="flex flex-col gap-4">
          <Section eyebrow="Inbox" title="Needs attention">
            {data.alerts.length === 0 ? (
              <div className="rounded-md border border-line-soft bg-surface p-5 text-sm text-ink-secondary">
                Nothing pending. We&rsquo;ll surface watch-status villas and
                negative reviews here when they appear.
              </div>
            ) : (
              <ul className="rounded-md border border-line-soft bg-surface divide-y divide-line-soft">
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
                      <Badge
                        tone={a.kind === "attention" ? "danger" : "warning"}
                      >
                        {a.kind === "attention" ? "Attention" : "Review"}
                      </Badge>
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
          </Section>

          <Section eyebrow="Quick links" title="Jump to">
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
          </Section>
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
        className="block rounded-md border border-line-soft bg-surface px-4 py-3 text-sm text-ink hover:border-line-strong transition-colors"
      >
        {label} <span aria-hidden>→</span>
      </Link>
    </li>
  );
}
