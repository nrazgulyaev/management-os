import Link from "next/link";
import { Kpi } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { StatusPill } from "@/components/ui/status-pill";
import { DbStatusNotice } from "@/components/admin/db-status";
import {
  listAvailableVillas,
  listVillaCalendarBlocks,
  type CalendarBlockRow,
} from "@/features/availability/services";
import { listVillas } from "@/features/villas/services";
import { CalendarBlockAddButton } from "@/components/availability/block-add-button";

export const metadata = { title: "Availability" };
export const dynamic = "force-dynamic";

const NIGHTS = 14;
const DAY_MS = 86_400_000;

/** Booking-origin blocks vs. manually-entered holds. */
const BOOKING_TYPES = new Set(["guest_booking", "channel_hold"]);

/** Block fill colour on the 14-night board, by type. */
const BLOCK_COLOR: Record<string, string> = {
  guest_booking: "var(--forest)",
  channel_hold: "var(--ink)",
  owner_stay: "var(--gold)",
  maintenance_block: "var(--warn)",
  deep_cleaning: "var(--terra-soft)",
  out_of_order: "var(--danger)",
  inspection: "var(--info)",
  internal_hold: "var(--sage)",
};

const BLOCK_TONE: Record<
  string,
  "neutral" | "info" | "gold" | "warning" | "danger" | "success"
> = {
  guest_booking: "info",
  channel_hold: "neutral",
  owner_stay: "gold",
  maintenance_block: "warning",
  deep_cleaning: "warning",
  out_of_order: "danger",
  inspection: "info",
  internal_hold: "neutral",
};

function startOfTodayUtc() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function fmtDay(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export default async function AvailabilityPage() {
  const winStart = startOfTodayUtc();
  const winStartMs = winStart.getTime();
  const winEnd = new Date(winStartMs + NIGHTS * DAY_MS);
  const tonightEnd = new Date(winStartMs + DAY_MS);

  const [available, blocks, villas] = await Promise.all([
    listAvailableVillas({ rangeStart: winStart, rangeEnd: tonightEnd }),
    listVillaCalendarBlocks({
      rangeStart: winStart,
      rangeEnd: winEnd,
      status: "active",
      limit: 400,
    }),
    listVillas(),
  ]);

  const activeVillas = villas.filter((v) => v.status !== "archived");
  const villaOpts = activeVillas.map((v) => ({
    id: v.id,
    label: `${v.unitCode} · ${v.projectName ?? ""}`,
  }));

  // Group blocks per villa.
  const byVilla = new Map<string, CalendarBlockRow[]>();
  for (const b of blocks) {
    const list = byVilla.get(b.villaId);
    if (list) list.push(b);
    else byVilla.set(b.villaId, [b]);
  }

  // KPIs.
  const availableTonight = available.length;
  const occupiedTonight = activeVillas.length - availableTonight;
  const bookingBlocks = blocks.filter((b) => BOOKING_TYPES.has(b.blockType)).length;
  const manualBlocks = blocks.length - bookingBlocks;

  // Real conflicts: same villa, two active blocks that overlap (half-open —
  // back-to-back is fine, so only start < previous end counts).
  let conflicts = 0;
  for (const list of byVilla.values()) {
    const sorted = [...list].sort((a, b) => (a.startsAt < b.startsAt ? -1 : 1));
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].startsAt < sorted[i - 1].endsAt) conflicts++;
    }
  }

  // Day-header labels.
  const dayCols = Array.from({ length: NIGHTS }, (_, i) =>
    new Date(winStartMs + i * DAY_MS).getUTCDate(),
  );

  // Per-villa readiness (current state tonight + next change).
  const tonightStartIso = winStart.toISOString();
  const tonightEndIso = tonightEnd.toISOString();
  const readiness = activeVillas.map((v) => {
    const list = (byVilla.get(v.id) ?? []).sort((a, b) =>
      a.startsAt < b.startsAt ? -1 : 1,
    );
    const covering = list.find(
      (b) => b.startsAt < tonightEndIso && b.endsAt > tonightStartIso,
    );
    const upcoming = list.find((b) => b.startsAt >= tonightStartIso);
    return {
      villa: v,
      covering: covering ?? null,
      upcoming: upcoming ?? null,
    };
  });

  return (
    <>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Dashboard</Link> / <span>Availability</span>
          </div>
          <h1>Availability board</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Every reason a villa is unavailable lives here — confirmed bookings,
            owner stays, deep cleans, OOO and channel holds. Half-open intervals,
            so back-to-back stays are never a conflict.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/dashboard/integrations/calendar-feeds"
            className="btn btn-secondary btn-sm"
          >
            Sync feeds →
          </Link>
          <CalendarBlockAddButton villas={villaOpts} label="Add manual block" />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-[18px] mb-[18px]">
        <Kpi
          label="Available tonight"
          value={String(availableTonight)}
          sub={`of ${activeVillas.length} villas`}
          tone={availableTonight > 0 ? "success" : undefined}
        />
        <Kpi label="Occupied tonight" value={String(occupiedTonight)} sub="guests + owners in-house" />
        <Kpi label="Booking blocks" value={String(bookingBlocks)} sub="bookings + channel holds" />
        <Kpi label="Manual blocks" value={String(manualBlocks)} sub="owner / maintenance / OOO" />
        <Kpi
          label="Conflicts"
          value={String(conflicts)}
          sub={conflicts > 0 ? "overlapping blocks" : "none — all clear"}
          tone={conflicts > 0 ? "accent" : undefined}
        />
      </div>

      <DbStatusNotice />

      {/* 14-night board */}
      <div className="card p-5 mb-[18px] overflow-auto">
        <div className="flex items-center justify-between mb-3.5 flex-wrap gap-2">
          <div className="label">
            {NIGHTS}-night board · {fmtDay(winStartMs)} — {fmtDay(winEnd.getTime() - DAY_MS)}
          </div>
          <div className="flex items-center gap-3 flex-wrap text-[10.5px] text-ink-3">
            {[
              ["Booking", "var(--forest)"],
              ["Channel", "var(--ink)"],
              ["Owner stay", "var(--gold)"],
              ["Maintenance", "var(--warn)"],
              ["OOO", "var(--danger)"],
            ].map(([l, c]) => (
              <span key={l} className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-[3px]"
                  style={{ background: c }}
                />
                {l}
              </span>
            ))}
          </div>
        </div>

        <div className="min-w-[980px]">
          {/* Day header */}
          <div className="grid" style={{ gridTemplateColumns: "100px 1fr" }}>
            <div />
            <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${NIGHTS}, 1fr)` }}>
              {dayCols.map((d, i) => (
                <div key={i} className="mono text-[10px] text-center text-ink-3">
                  {d}
                </div>
              ))}
            </div>
          </div>

          {/* Villa rows */}
          {activeVillas.map((v) => {
            const list = byVilla.get(v.id) ?? [];
            return (
              <div
                key={v.id}
                className="grid mt-1.5 items-center"
                style={{ gridTemplateColumns: "100px 1fr" }}
              >
                <div className="mono text-[12px] text-ink-3 truncate pr-2">{v.unitCode}</div>
                <div
                  className="relative h-[22px] rounded-md border border-line-soft"
                  style={{ background: "var(--cream-warm)" }}
                >
                  <div
                    className="absolute inset-0 grid"
                    style={{ gridTemplateColumns: `repeat(${NIGHTS}, 1fr)` }}
                  >
                    {Array.from({ length: NIGHTS - 1 }).map((_, i) => (
                      <div key={i} style={{ borderRight: "1px dashed var(--line-soft)" }} />
                    ))}
                  </div>
                  {list.map((b) => {
                    const from = clamp((new Date(b.startsAt).getTime() - winStartMs) / DAY_MS, 0, NIGHTS);
                    const to = clamp((new Date(b.endsAt).getTime() - winStartMs) / DAY_MS, 0, NIGHTS);
                    if (to <= from) return null;
                    return (
                      <div
                        key={b.id}
                        title={`${b.title} · ${b.blockType.replace(/_/g, " ")}`}
                        className="absolute top-0.5 h-[18px] rounded-[4px] px-1.5 flex items-center overflow-hidden whitespace-nowrap text-[10.5px]"
                        style={{
                          left: `${(from / NIGHTS) * 100}%`,
                          width: `${((to - from) / NIGHTS) * 100}%`,
                          background: BLOCK_COLOR[b.blockType] ?? "var(--ink-3)",
                          color: "var(--cream-warm)",
                        }}
                      >
                        {b.title}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {activeVillas.length === 0 && (
            <p className="text-[13px] text-ink-3 italic py-6 text-center">
              No active villas to show.
            </p>
          )}
        </div>
      </div>

      {/* Readiness */}
      <h2 className="display text-[22px] font-normal mt-8 mb-3.5" id="readiness">
        Readiness · per villa
      </h2>
      <div className="card p-0 overflow-hidden">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Villa</th>
              <th scope="col">Status</th>
              <th scope="col">Tonight</th>
              <th scope="col">Next change</th>
              <th scope="col">Project</th>
            </tr>
          </thead>
          <tbody>
            {readiness.map(({ villa, covering, upcoming }) => (
              <tr key={villa.id}>
                <td className="mono">{villa.unitCode}</td>
                <td>
                  <StatusPill status={villa.status} />
                </td>
                <td>
                  {covering ? (
                    <Badge tone={BLOCK_TONE[covering.blockType] ?? "neutral"}>
                      {covering.blockType.replace(/_/g, " ")}
                    </Badge>
                  ) : (
                    <Badge tone="success">Available</Badge>
                  )}
                </td>
                <td className="mono text-[11px] text-ink-3">
                  {covering
                    ? `free ${fmtDay(new Date(covering.endsAt).getTime())}`
                    : upcoming
                      ? `booked ${fmtDay(new Date(upcoming.startsAt).getTime())}`
                      : "—"}
                </td>
                <td className="text-[12px] text-ink-3">{villa.projectName ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
