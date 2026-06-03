import Link from "next/link";
import { Kpi, Card } from "@/components/dashboard/primitives";
import {
  listBookingsForCabinet,
  getBookingsKpis,
  getNext14NightsTimeline,
} from "@/features/bookings/bookings-cabinet-queries";
import { BookingsListClient, type BookingRowVM } from "./_list-client";
import { BookingAddButton } from "@/components/bookings/booking-add-button";
import { listVillas } from "@/features/villas/services";
import { listBookingChannels } from "@/features/channels/services";
import { listGuests } from "@/features/guests/services";
import { parseFilters } from "@/lib/url-state";

/**
 * Sprint TASK-6-DATA-PART-1 — Mgmt OS Bookings cabinet live wiring.
 *
 * Visual port from `_handoff/management/bookings.html`. This commit
 * replaces four mock arrays with live reads in
 * `src/features/bookings/bookings-cabinet-queries.ts`:
 *
 *   - BOOKINGS         → listBookingsForCabinet(25)
 *   - CALENDAR_VILLAS  → getNext14NightsTimeline()
 *   - RATE_PLANS       → getRatePlans() (empty until rate-plan schema)
 *   - CHANNEL_HEALTH   → getChannelSyncStatus() (roster only — no sync)
 *
 * Conflict resolver collapses to empty state — no channel-sync table
 * yet. KPI strip wired via getBookingsKpis() — channel-conflicts
 * count stays "—" until the sync schema lands.
 */

export const metadata = { title: "Bookings" };
export const dynamic = "force-dynamic";

const FX_USD_TO_IDR = 15_800;

function fmtUsdMinor(minor: bigint): string {
  const usd = Number(minor) / 100;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(1)}K`;
  return `$${Math.round(usd)}`;
}

function fmtIdrFromUsd(usdMinor: bigint): string {
  const idr = (Number(usdMinor) / 100) * FX_USD_TO_IDR;
  if (idr >= 1_000_000_000) return `IDR ${(idr / 1_000_000_000).toFixed(2)}B`;
  if (idr >= 1_000_000) return `IDR ${(idr / 1_000_000).toFixed(1)}M`;
  return `IDR ${Math.round(idr / 1000)}K`;
}

// PR 2 — STATE_BADGE + initials helpers moved into _list-client.tsx
// when the table rendering became client-side (selection + sort
// require client state).

const BLOCK_COLORS = ["var(--forest)", "var(--terra)", "var(--ink)", "var(--gold)"] as const;

type SearchParams = Record<string, string | string[] | undefined>;

export default async function BookingsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  // PR 2 proof-of-life — parse the chip filters off the URL so deep
  // links render the right active chips on first paint. Filter
  // application against the DB lands in 2.2 alongside the row-count
  // helper; today the filters are display-only.
  const initialActive = parseFilters(params, ["status", "channel", "date"]);

  const [list, kpis, timeline] = await Promise.all([
    listBookingsForCabinet(25).catch(() => []),
    getBookingsKpis().catch(() => null),
    getNext14NightsTimeline().catch(() => []),
  ]);
  // Data for the "New booking" modal (the real BookingForm — villa dropdown,
  // channels, guests). Same shapes as /dashboard/bookings/new.
  const [villaList, channelList, guestList] = await Promise.all([
    listVillas().catch(() => []),
    listBookingChannels().catch(() => []),
    listGuests().catch(() => []),
  ]);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const startMs = today.getTime();
  const dayLabels = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(startMs + i * 86400000);
    return { day: d.getUTCDate(), highlighted: i < 3 };
  });

  return (
    <>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Dashboard</Link> / <span>Bookings</span>
          </div>
          <h1>Bookings</h1>
        </div>
        <div className="actions">
          <button
            className="btn btn-ghost btn-sm opacity-55 cursor-not-allowed"
            disabled
            title="Coming soon"
          >
            Export
          </button>
          <Link href="/dashboard/bookings/calendar" className="btn btn-secondary btn-sm">
            ↗ Calendar
          </Link>
          <BookingAddButton
            villas={villaList.map((v) => ({
              id: v.id,
              label: `${v.unitCode} · ${v.projectName}`,
            }))}
            channels={channelList.map((c) => ({ id: c.id, label: c.name, key: c.key }))}
            guests={guestList.map((g) => ({ id: g.id, label: g.fullName }))}
            label="New booking"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-[18px] mb-[18px]">
        <Kpi
          label="Today · arrivals"
          value={kpis ? String(kpis.todayArrivals) : "—"}
          sub="checking in today"
          tone="accent"
        />
        <Kpi
          label="In-stay tonight"
          value={kpis ? String(kpis.inStayTonight) : "—"}
          sub="across your villas"
        />
        <Kpi
          label="7d gross"
          value={kpis && kpis.gross7dUsdMinor > 0n ? fmtIdrFromUsd(kpis.gross7dUsdMinor) : "—"}
          sub="last 7 days"
        />
        <Kpi
          label="Auto-reply rate"
          value="—"
          sub="messaging metrics soon"
        />
      </div>

      {/* Phase 2.1 PR 2 — list+filter shell with sortable Code,
          chip filters, bulk-mode swap. */}
      <Card padding="none" overflowHidden className="mb-[18px]">
        <BookingsListClient
          rows={list.map<BookingRowVM>((b) => ({
            id: b.id,
            bookingCode: b.bookingCode,
            villaCode: b.villaCode,
            channelKey: b.channelKey,
            channelName: b.channelName,
            guestName: b.guestName,
            checkIn: b.checkIn,
            checkOut: b.checkOut,
            nights: b.nights,
            grossUsdFormatted: fmtUsdMinor(b.grossUsdMinor),
            status: b.status,
          }))}
          initialActive={initialActive}
        />
      </Card>

      {/* 14-night calendar timeline — live */}
      <h2
        id="calendar"
        className="display text-[30px] font-normal mb-3.5 mt-8"
      >
        Calendar · next 14 nights{" "}
        <em className="text-[18px]">per villa</em>
      </h2>
      <Card className="p-5 mb-[18px] overflow-auto">
        {timeline.length === 0 ? (
          <p className="text-[13px] text-ink-3 italic m-0">
            No villas configured yet.
          </p>
        ) : (
          <>
            <div className="min-w-[1100px] grid grid-cols-[120px_1fr]">
              <div />
              <div className="grid grid-cols-14 gap-0.5">
                {dayLabels.map((d, i) => (
                  <div
                    key={i}
                    className={
                      "mono text-[10px] text-center " +
                      (d.highlighted ? "text-terra" : "text-ink-3")
                    }
                  >
                    {d.day}
                  </div>
                ))}
              </div>
            </div>
            {timeline.map((v) => (
              <div
                key={v.villaId}
                className="grid grid-cols-[120px_1fr] mt-1.5 items-center"
              >
                <div className="mono text-[12px] text-ink-3">{v.villaCode}</div>
                <div className="relative h-6 bg-cream-warm rounded-md border border-line-soft">
                  <div className="absolute inset-0 grid grid-cols-14">
                    {Array.from({ length: 13 }).map((_, i) => (
                      <div key={i} className="border-r border-dashed border-line-soft" />
                    ))}
                  </div>
                  {v.blocks.map((b, i) => {
                    const ciDay = Math.max(
                      0,
                      Math.floor(
                        (new Date(b.checkIn + "T00:00:00Z").getTime() - startMs) / 86400000,
                      ),
                    );
                    const coDay = Math.min(
                      14,
                      Math.ceil(
                        (new Date(b.checkOut + "T00:00:00Z").getTime() - startMs) / 86400000,
                      ),
                    );
                    if (coDay <= 0 || ciDay >= 14) return null;
                    return (
                      <div
                        key={b.bookingId}
                        title={`${b.guestName ?? "Guest"} · ${b.bookingCode}`}
                        className="absolute top-[3px] h-[18px] rounded text-cream-warm text-[11px] flex items-center overflow-hidden whitespace-nowrap px-2"
                        style={{
                          left: `${(ciDay / 14) * 100}%`,
                          width: `${((coDay - ciDay) / 14) * 100}%`,
                          background: BLOCK_COLORS[i % BLOCK_COLORS.length],
                        }}
                      >
                        {b.guestName ?? b.bookingCode}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </>
        )}
      </Card>

    </>
  );
}
