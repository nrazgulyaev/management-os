import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentOwnerContext } from "@/features/owner-portal/owner-context";
import { getOwnerCalendar } from "@/features/owner-portal/get-calendar";
import { MonthCalendar } from "@/components/owner-portal/month-calendar";
import { PipelineList } from "@/components/owner-portal/pipeline-list";

/**
 * Sprint OWNER-PORTAL · redesign owner-04 — Calendar.
 *
 * Visual port of cc-handoff-bundle/cabinets/owner-p1/04-calendar.html.
 * Wires the Phase 2.3 owner-04 primitives (MonthCalendar / PipelineList)
 * to `getOwnerCalendar(ownerId, ?month)`. Month view + ?month=YYYY-MM.
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
  const data = await getOwnerCalendar(owner.ownerId, isYm(sp.month) ? sp.month : undefined);

  const ym = data.month;
  const prev = shiftMonth(ym, -1);
  const next = shiftMonth(ym, 1);
  const villaLabel = data.villas.length === 1 ? ` · ${data.villas[0].label}` : "";
  const pipelineItems = data.pipeline.map((p) => ({ ...p, dateLabel: fmtDay(p.dateLabel) }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[200px]">
          <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-tertiary mb-2">
            Your calendar{villaLabel}
          </div>
          <h1
            className="display"
            style={{ fontSize: 42, fontWeight: 400, margin: 0, lineHeight: 1.05, letterSpacing: "-0.02em", color: "var(--ink)" }}
          >
            {monthName(ym)}
          </h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href={`/owner/calendar?month=${prev}`} className="btn btn-ghost btn-sm">
            ← {monthShort(prev)}
          </Link>
          <Link href="/owner/calendar" className="btn btn-ghost btn-sm">
            Today
          </Link>
          <Link href={`/owner/calendar?month=${next}`} className="btn btn-ghost btn-sm">
            {monthShort(next)} →
          </Link>
          <Link href="/owner/stays/new" className="btn btn-accent btn-sm">
            + Request personal stay
          </Link>
        </div>
      </div>

      <MonthCalendar month={ym} events={data.events} />

      <section className="flex flex-col gap-3">
        <h2 className="display" style={{ fontSize: 22, fontWeight: 400, margin: 0, color: "var(--ink)" }}>
          Upcoming stays
        </h2>
        <PipelineList bookings={pipelineItems} emptyLabel="No upcoming stays in the next 30 days." />
      </section>

      <p
        className="font-mono text-[10.5px] tracking-[0.08em] text-center"
        style={{ color: "var(--ink-4)" }}
      >
        LEGEND · TERRA = GUEST BOOKING · GOLD = YOUR REQUEST (PENDING) · GREEN ={" "}
        YOUR CONFIRMED STAY · GUEST NAMES MASKED
      </p>
    </div>
  );
}
