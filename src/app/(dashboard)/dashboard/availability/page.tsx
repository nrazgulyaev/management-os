import Link from "next/link";
import {
  Kpi,
  SectionHeading,
  Card,
  HandoffBadge,
} from "@/components/dashboard/primitives";
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

/** Day columns rendered on the board (mockup = a 7-day strip). */
const DAYS = 7;
const DAY_MS = 86_400_000;

/** Block types that take a villa out of service (not bookable). */
const OOO_TYPES = new Set(["maintenance_block", "deep_cleaning", "out_of_order"]);

/** Cell state class on the day board, by block type. The bare
 *  `av-cell` (mint) never shows because every cell resolves to one
 *  of these modifiers or `av-free`. */
const CELL_CLASS: Record<string, string> = {
  guest_booking: "av-book",
  channel_hold: "av-book",
  owner_stay: "av-owner",
  maintenance_block: "av-maint",
  deep_cleaning: "av-maint",
  out_of_order: "av-ooo",
  inspection: "av-maint",
  internal_hold: "av-owner",
};

/** Single-glyph stamped into each occupied cell, matching the mock. */
const CELL_GLYPH: Record<string, string> = {
  guest_booking: "B",
  channel_hold: "B",
  owner_stay: "O",
  maintenance_block: "M",
  deep_cleaning: "M",
  out_of_order: "X",
  inspection: "M",
  internal_hold: "O",
};

const BLOCK_TONE: Record<
  string,
  "ok" | "info" | "gold" | "warn" | "danger" | "ink"
> = {
  guest_booking: "info",
  channel_hold: "ink",
  owner_stay: "gold",
  maintenance_block: "warn",
  deep_cleaning: "warn",
  out_of_order: "danger",
  inspection: "info",
  internal_hold: "ink",
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

function dayLabel(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", {
    weekday: "short",
    timeZone: "UTC",
  });
}

export default async function AvailabilityPage() {
  const winStart = startOfTodayUtc();
  const winStartMs = winStart.getTime();
  const winEnd = new Date(winStartMs + DAYS * DAY_MS);
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
  const activeBlocks = blocks.length;
  const oooBlocks = blocks.filter((b) => OOO_TYPES.has(b.blockType)).length;
  const ownerStayHolds = blocks.filter((b) => b.blockType === "owner_stay").length;

  // Real conflicts: same villa, two active blocks that overlap (half-open —
  // back-to-back is fine, so only start < previous end counts).
  let conflicts = 0;
  for (const list of byVilla.values()) {
    const sorted = [...list].sort((a, b) => (a.startsAt < b.startsAt ? -1 : 1));
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].startsAt < sorted[i - 1].endsAt) conflicts++;
    }
  }

  // Per-villa, per-day cell state. For each of the DAYS columns, find the
  // first active block covering that night (half-open: starts <= day <
  // ends), else the cell is free.
  const dayStartsMs = Array.from(
    { length: DAYS },
    (_, i) => winStartMs + i * DAY_MS,
  );
  const boardRows = activeVillas.map((v) => {
    const list = byVilla.get(v.id) ?? [];
    const cells = dayStartsMs.map((dayMs) => {
      const dayEndMs = dayMs + DAY_MS;
      const covering = list.find((b) => {
        const s = new Date(b.startsAt).getTime();
        const e = new Date(b.endsAt).getTime();
        return s < dayEndMs && e > dayMs;
      });
      return covering ?? null;
    });
    return { villa: v, cells };
  });

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
      <SectionHeading
        eyebrow="Front office · master calendar"
        title={
          <>
            Every reason a villa is <em>unavailable</em>.
          </>
        }
        subtitle="Confirmed bookings, owner stays, deep cleans, OOO, internal/channel holds — one source of truth. Half-open intervals, so back-to-back stays aren't a conflict."
        actions={
          <>
            <Link
              href="/dashboard/integrations/calendar-feeds"
              className="btn btn-secondary btn-sm"
            >
              Sync feeds →
            </Link>
            <CalendarBlockAddButton villas={villaOpts} label="Add manual block" />
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-[18px]">
        <Kpi
          label={`Available · ${DAYS}d`}
          value={String(availableTonight)}
          sub="bookable now"
          tone={availableTonight > 0 ? "success" : undefined}
        />
        <Kpi
          label={`Active blocks · ${DAYS}d`}
          value={String(activeBlocks)}
          sub="all reasons"
          tone="accent"
        />
        <Kpi
          label="Maintenance / OOO"
          value={String(oooBlocks)}
          sub="not bookable"
          tone={oooBlocks > 0 ? "warn" : undefined}
        />
        <Kpi
          label="Owner-stay holds"
          value={String(ownerStayHolds)}
          sub="within quota"
        />
      </div>

      {conflicts > 0 && (
        <p className="text-[12px] text-terra mb-[18px] -mt-1.5">
          {conflicts} overlapping block{conflicts === 1 ? "" : "s"} detected —
          review the affected villas.
        </p>
      )}

      <DbStatusNotice />

      {/* 7-day occupancy board */}
      <Card padding="default" className="mb-[18px] overflow-auto">
        <div className="av-card-h">
          <h3>Next {DAYS} days</h3>
          <span className="meta">
            {activeVillas.length} VILLAS · HALF-OPEN
          </span>
        </div>

        <div
          className="av-board min-w-[760px]"
          style={{ gridTemplateColumns: `130px repeat(${DAYS}, 1fr)` }}
        >
          {/* Day header row */}
          <div className="av-hd" />
          {dayStartsMs.map((ms) => (
            <div key={ms} className="av-hd">
              {dayLabel(ms)}
            </div>
          ))}

          {/* Villa rows */}
          {boardRows.map(({ villa, cells }) => (
            <div key={villa.id} className="contents">
              <div className="av-vn" title={villa.unitCode}>
                {villa.unitCode}
              </div>
              {cells.map((b, i) => {
                const cls = b ? (CELL_CLASS[b.blockType] ?? "av-book") : "av-free";
                const glyph = b ? (CELL_GLYPH[b.blockType] ?? "B") : "";
                return (
                  <div
                    key={i}
                    className={`av-cell ${cls}`}
                    title={
                      b
                        ? `${b.title} · ${b.blockType.replace(/_/g, " ")}`
                        : `${fmtDay(dayStartsMs[i])} · free`
                    }
                  >
                    {glyph}
                  </div>
                );
              })}
            </div>
          ))}

          {activeVillas.length === 0 && (
            <p
              className="text-[13px] text-ink-3 italic py-6 text-center"
              style={{ gridColumn: `1 / span ${DAYS + 1}` }}
            >
              No active villas to show.
            </p>
          )}
        </div>

        <div className="av-leg">
          <span>
            <i className="av-sw-book" />
            Booking
          </span>
          <span>
            <i className="av-sw-owner" />
            Owner stay
          </span>
          <span>
            <i className="av-sw-maint" />
            Maintenance / clean
          </span>
          <span>
            <i className="av-sw-ooo" />
            Out of order
          </span>
          <span>
            <i className="av-sw-free" />
            Available
          </span>
        </div>
      </Card>

      {/* Readiness */}
      <h2 className="display text-[22px] font-normal mt-8 mb-3.5" id="readiness">
        Readiness · per villa
      </h2>
      <Card padding="none" overflowHidden>
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
                    <HandoffBadge tone={BLOCK_TONE[covering.blockType] ?? "ink"}>
                      {covering.blockType.replace(/_/g, " ")}
                    </HandoffBadge>
                  ) : (
                    <HandoffBadge tone="ok">Available</HandoffBadge>
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
      </Card>
    </>
  );
}
