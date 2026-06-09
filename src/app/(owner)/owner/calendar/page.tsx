import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentOwnerContext } from "@/features/owner-portal/owner-context";
import { getOwnerCalendar } from "@/features/owner-portal/get-calendar";
import {
  getOwnerPoolState,
  getUpcomingOwnerStays,
} from "@/features/owner-portal/get-pool-state";
import { getOwnerStayQuota } from "@/features/owner-portal/owner-portal-queries";
import { MonthCalendar } from "@/components/owner-portal/month-calendar";
import { PipelineList } from "@/components/owner-portal/pipeline-list";
import { PoolManager } from "@/components/owner-portal/pool-manager";
import { PoolStatusLegend } from "@/components/owner-portal/pool-status-legend";

/**
 * Sprint OWNER-PORTAL · redesign owner-04 — Calendar.
 *
 * Pixel port of cc-functional-handoff/cabinets/owner-p1/04-calendar.html:
 * a calm investor-narrative surface — terra eyebrow + Newsreader title +
 * lede, a status bar reading the villa's rental participation, then the
 * month grid alongside the free-night quota / personal stays / "how it
 * works" rail. Density is owner-narrative (bigger type, airier rhythm),
 * not an operator console.
 *
 * Wires the owner-04 primitives (MonthCalendar / PipelineList) +
 * the P1 rental-pool manager (PoolManager / PoolStatusLegend) to
 * `getOwnerCalendar(ownerId, ?month)`. Month view + ?month=YYYY-MM.
 *
 * Privacy: guest names are masked to initials in `getOwnerCalendar`
 * (owners see "Guest JW", never the full name; emails / phones / access
 * codes are never selected). Terra = guest booking, gold = pending
 * owner request, green = confirmed owner stay.
 */

export const metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

function isYm(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}$/.test(s);
}
function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function monthName(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
function monthShort(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "short",
    timeZone: "UTC",
  });
}
function fmtDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d
    .toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
    .toUpperCase();
}

export default async function OwnerCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const owner = await getCurrentOwnerContext();
  if (!owner) redirect("/dashboard");

  const sp = await searchParams;
  const [data, pool, quota, upcomingStays] = await Promise.all([
    getOwnerCalendar(owner.ownerId, isYm(sp.month) ? sp.month : undefined),
    getOwnerPoolState(owner.ownerId).catch(() => ({ villas: [], coolingOffDays: 14 })),
    getOwnerStayQuota(owner.ownerId).catch(() => null),
    getUpcomingOwnerStays(owner.ownerId).catch(() => []),
  ]);

  const ym = data.month;
  const prev = shiftMonth(ym, -1);
  const next = shiftMonth(ym, 1);
  const villaLabel = data.villas.length === 1 ? ` · ${data.villas[0].label}` : "";
  const pipelineItems = data.pipeline.map((p) => ({ ...p, dateLabel: fmtDay(p.dateLabel) }));

  // Three-state tally for the rental-pool legend (in pool / cooling / out).
  const poolCounts = pool.villas.reduce(
    (acc, v) => {
      if (v.isCoolingOff) acc.cooling += 1;
      else if (v.status === "out_of_pool") acc.outOfPool += 1;
      else acc.inPool += 1;
      return acc;
    },
    { inPool: 0, cooling: 0, outOfPool: 0 },
  );

  return (
    <div className="flex flex-col gap-8">
      {/* Narrative intro — terra eyebrow + Newsreader title + lede
          (04-calendar.html .ow-eyebrow / .ow-h1 / .ow-sub). */}
      <header className="flex flex-col">
        <p className="owner-eyebrow">Calendar · pool &amp; personal nights</p>
        <h1 className="owner-h1">Your time at the villa</h1>
        <p className="owner-cal-sub">
          Book personal stays, manage the villa&apos;s rental participation, and
          track your free-night quota{villaLabel}.
        </p>
      </header>

      {/* P1 owner-calendar-pool — interactive rental-pool manager. The
          take-out / return toggle (14-day cooling-off), free-nights
          allowance, Pay-&-book vs Book-free, and cancel-stay live here. */}
      <section className="flex flex-col gap-4">
        <div className="owner-sec-head flex-wrap gap-y-2">
          <h2 className="owner-sec-title">Rental pool</h2>
          <div className="ml-auto">
            <PoolStatusLegend counts={poolCounts} />
          </div>
        </div>
        <PoolManager
          villas={pool.villas}
          quota={
            quota
              ? {
                  policyName: quota.policyName,
                  year: quota.year,
                  usedNights: quota.usedNights,
                  freeNightsPerYear: quota.freeNightsPerYear,
                  remainingNights: quota.remainingNights,
                }
              : null
          }
          coolingOffDays={pool.coolingOffDays}
          upcomingStays={upcomingStays}
        />
      </section>

      {/* Month grid — the calendar card. Month name is the card heading;
          prev / today / next are calm ghost controls (04-calendar.html). */}
      <section className="flex flex-col gap-4">
        <div className="owner-sec-head flex-wrap gap-y-2">
          <h2 className="owner-sec-title">{monthName(ym)}</h2>
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <Link href={`/owner/calendar?month=${prev}`} className="btn btn-ghost btn-sm">
              ← {monthShort(prev)}
            </Link>
            <Link href="/owner/calendar" className="btn btn-ghost btn-sm">
              Today
            </Link>
            <Link href={`/owner/calendar?month=${next}`} className="btn btn-ghost btn-sm">
              {monthShort(next)} →
            </Link>
            <Link href="/owner/stays" className="btn btn-secondary btn-sm">
              All my stays
            </Link>
          </div>
        </div>
        <MonthCalendar month={ym} events={data.events} />
        <p className="owner-cal-legend">
          Terra = guest · Gold = your request (pending) · Green = your confirmed
          stay · Grey = villa blocked · Guest names masked
        </p>
      </section>

      {/* Upcoming stays + the "how it works" note, side by side on wide
          viewports (04-calendar.html sidebar rail). */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="flex flex-col gap-4">
          <div className="owner-sec-head">
            <h2 className="owner-sec-title">Upcoming stays</h2>
          </div>
          <PipelineList
            bookings={pipelineItems}
            emptyLabel="No upcoming stays in the next 30 days."
          />
        </div>
        <aside className="owner-note">
          <h3 className="owner-note-title">How it works</h3>
          <p className="owner-note-body">
            Personal dates take the villa out of rental for that time. After
            returning to the pool there&apos;s a{" "}
            <strong>{pool.coolingOffDays}-day cooling-off period</strong> before
            it earns again. Beyond your free-night quota, nights are billed at
            your owner rate.
          </p>
        </aside>
      </section>
    </div>
  );
}
