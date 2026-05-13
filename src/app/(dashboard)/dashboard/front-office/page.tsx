import Link from "next/link";
import {
  CabinetGreetingBlock,
  DashboardKpi,
  PageHeaderHero,
} from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { getCurrentAppUser } from "@/features/auth/current-user";
import {
  listArrivals,
  listDepartures,
  listInHouseGuests,
  listCheckinCheckoutRequests,
} from "@/features/front-office/services";

/**
 * Stage 10.5.A.3.3 — Front Office cabinet (Mgmt OS, replatformed).
 *
 * KPI mapping:
 *   - Arrivals today        → arrivals.length
 *   - Departures today      → departures.length
 *   - In-house              → inHouse.length
 *   - Pending requests      → openRequests.length  (status warn when > 0)
 *
 * Side panel: board jump cards. Main column: today's flow summary +
 * the stay-by-stay snapshot (deferred — links to existing boards).
 */

export const metadata = { title: "Front office" };
export const dynamic = "force-dynamic";

export default async function FrontOfficeTodayPage() {
  const today = new Date();
  const me = await getCurrentAppUser();
  const firstName = me?.fullName?.trim().split(/\s+/)[0] ?? null;

  const [arrivals, departures, inHouse, openRequests] = await Promise.all([
    listArrivals(today),
    listDepartures(today),
    listInHouseGuests(today),
    listCheckinCheckoutRequests({ status: "requested", limit: 50 }),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <CabinetGreetingBlock
        firstName={firstName}
        eyebrow="Front office · Cabinet"
        subline={`${arrivals.length} arrival${arrivals.length === 1 ? "" : "s"} · ${departures.length} departure${departures.length === 1 ? "" : "s"} · ${inHouse.length} in-house`}
        badge={
          openRequests.length > 0 ? (
            <Badge tone="warning">{openRequests.length} pending</Badge>
          ) : null
        }
      />

      <PageHeaderHero
        eyebrow="Today"
        title="Today at the front desk"
        description="Arrivals, departures, in-house guests, and pending check-in / check-out requests."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <DashboardKpi
          variant="hero"
          tone="coral-soft"
          label="Arrivals today"
          value={String(arrivals.length)}
          status={arrivals.length === 0 ? "neutral" : "good"}
          drillHref="/dashboard/front-office/arrivals"
          hint="Expected check-ins"
          className="sm:col-span-2 lg:col-span-2"
        />
        <DashboardKpi
          label="Departures today"
          value={String(departures.length)}
          status={departures.length === 0 ? "neutral" : "good"}
          drillHref="/dashboard/front-office/departures"
          hint="Expected check-outs"
        />
        <DashboardKpi
          label="In-house"
          value={String(inHouse.length)}
          status="neutral"
          drillHref="/dashboard/front-office/in-house"
          hint="Currently staying"
        />
        <DashboardKpi
          label="Pending requests"
          value={String(openRequests.length)}
          status={
            openRequests.length === 0
              ? "good"
              : openRequests.length > 5
                ? "bad"
                : "warn"
          }
          drillHref="/dashboard/front-office/requests"
          hint="Awaiting front-office review"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <Section eyebrow="Boards" title="Today's flow">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <BoardCard
                href="/dashboard/front-office/arrivals"
                title="Arrivals"
                detail={`${arrivals.length} expected today`}
              />
              <BoardCard
                href="/dashboard/front-office/readiness"
                title="Arrival readiness"
                detail="Per-villa prep status + open blockers"
              />
              <BoardCard
                href="/dashboard/front-office/departures"
                title="Departures"
                detail={`${departures.length} expected today`}
              />
              <BoardCard
                href="/dashboard/front-office/in-house"
                title="In-house"
                detail={`${inHouse.length} stays right now`}
              />
            </div>
          </Section>
        </div>

        <aside className="flex flex-col gap-4">
          <Section eyebrow="Inbox" title="Guest requests">
            {openRequests.length === 0 ? (
              <div className="rounded-2xl border border-line-soft bg-surface shadow-soft-card p-5 text-sm text-ink-secondary">
                No pending check-in / check-out requests right now.
              </div>
            ) : (
              <div className="rounded-2xl border border-line-soft bg-surface shadow-soft-card p-5">
                <div className="text-display text-[40px] leading-none font-medium font-mono tabular-nums text-ink">
                  {openRequests.length}
                </div>
                <div className="text-sm text-ink-secondary mt-2">
                  awaiting review
                </div>
                <Link
                  href="/dashboard/front-office/requests"
                  className="mt-4 inline-block text-sm text-info hover:underline"
                >
                  Open requests board →
                </Link>
              </div>
            )}
          </Section>

          <Section eyebrow="Quick links" title="Operations">
            <ul className="grid grid-cols-1 gap-2">
              <CrossLink
                href="/dashboard/operations"
                label="Operations overview"
              />
              <CrossLink
                href="/dashboard/villas"
                label="Villa directory"
              />
              <CrossLink
                href="/dashboard/bookings"
                label="Bookings"
              />
              <CrossLink
                href="/dashboard/guest-services"
                label="Guest services"
              />
            </ul>
          </Section>
        </aside>
      </div>
    </div>
  );
}

function BoardCard({
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

function CrossLink({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <Link
        href={href}
        className="block rounded-2xl border border-line-soft bg-surface px-4 py-3 text-sm text-ink shadow-soft-card hover:shadow-elevated-card hover:border-line-strong transition-all"
      >
        {label} <span aria-hidden>→</span>
      </Link>
    </li>
  );
}
