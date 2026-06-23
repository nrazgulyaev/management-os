import Link from "next/link";
import { Kpi, Card } from "@/components/dashboard/primitives";
import {
  listBookingsForCabinet,
  getBookingsKpis,
  getNext14NightsTimeline,
} from "@/features/bookings/bookings-cabinet-queries";
import { BookingsListClient, type BookingRowVM } from "./_list-client";
import { BookingAddButton } from "@/components/bookings/booking-add-button";
import { listVillas, getVillaById } from "@/features/villas/services";
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

// Calendar bar colours by kind (prototype legend).
const CAL_BAR: Record<string, { bg: string; fg: string }> = {
  confirmed: { bg: "var(--forest)", fg: "var(--cream-warm)" },
  hold: { bg: "var(--terra)", fg: "var(--cream-warm)" },
  owner: { bg: "var(--gold)", fg: "var(--ink)" },
};

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

  // Villa drill-down — /dashboard/villas/[id] links here with ?villa=<id>.
  // getVillaById is org-scoped, so a forged/cross-org id resolves to null
  // (no banner). The filter is also applied server-side in the org-scoped
  // listBookingsForCabinet query, so even an un-resolved id never widens
  // beyond the caller's org.
  const villaParam = typeof params.villa === "string" ? params.villa : undefined;
  const villaFilter = villaParam
    ? await getVillaById(villaParam).catch(() => null)
    : null;

  const [list, kpis, timeline] = await Promise.all([
    listBookingsForCabinet(25, villaParam).catch(() => []),
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

  const NIGHTS = 14;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const startMs = today.getTime();
  const todayIso = new Date(startMs).toISOString().slice(0, 10);
  const days = Array.from({ length: NIGHTS }, (_, i) => {
    const d = new Date(startMs + i * 86400000);
    const iso = d.toISOString().slice(0, 10);
    return {
      iso,
      weekday: d
        .toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })
        .slice(0, 2)
        .toUpperCase(),
      day: d.getUTCDate(),
      isToday: iso === todayIso,
    };
  });

  return (
    <>
      <div className="page-header mb-0">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Guests</Link> · <span>Bookings</span>
          </div>
          <h1>Bookings</h1>
        </div>
        <div className="actions">
          <a
            href="/dashboard/bookings/export"
            className="btn btn-ghost btn-sm"
            download
          >
            Export CSV
          </a>
          <Link href="/dashboard/bookings/calendar" className="btn btn-secondary btn-sm">
            ↗ Calendar
          </Link>
          <Link href="/dashboard/bookings/new-by-type" className="btn btn-secondary btn-sm">
            Book by type
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

      {villaFilter && (
        <div className="mt-[18px] flex items-center gap-2 text-[13px]">
          <span className="text-ink-3">Filtered to villa</span>
          <Link
            href={`/dashboard/villas/${villaFilter.id}`}
            className="font-medium text-ink hover:text-accent underline"
          >
            {villaFilter.unitCode}
            {villaFilter.name ? ` · ${villaFilter.name}` : ""}
          </Link>
          <Link
            href="/dashboard/bookings"
            className="text-ink-3 hover:text-accent underline"
          >
            Clear filter ✕
          </Link>
        </div>
      )}

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
          tone="success"
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

      {/* Occupancy calendar — villa × night grid (prototype) */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3.5 mt-8">
        <h2 id="calendar" className="display text-[30px] font-normal m-0">
          Calendar <em className="text-[18px]">· next {NIGHTS} nights</em>
        </h2>
        <div className="flex items-center gap-4 text-[11px] text-ink-3">
          {(["confirmed", "hold", "owner"] as const).map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: CAL_BAR[k].bg }} />
              {k === "confirmed" ? "Confirmed" : k === "hold" ? "Hold / tentative" : "Owner stay"}
            </span>
          ))}
        </div>
      </div>
      <Card padding="none" overflowHidden className="mb-[18px]">
        {timeline.length === 0 ? (
          <p className="p-5 text-[13px] text-ink-3 italic m-0">No villas configured yet.</p>
        ) : (
          <div className="overflow-auto">
            <div className="min-w-[1100px]">
              <div className="grid grid-cols-[150px_1fr] border-b border-line-soft bg-cream-warm">
                <div className="mono text-[10px] uppercase tracking-wide text-ink-3 px-3 py-2.5 flex items-center">
                  Villa
                </div>
                <div className="grid" style={{ gridTemplateColumns: `repeat(${NIGHTS}, 1fr)` }}>
                  {days.map((d) => (
                    <div
                      key={d.iso}
                      className={`text-center py-1.5 ${d.isToday ? "text-terra" : "text-ink-3"}`}
                    >
                      <div className="mono text-[9px] uppercase leading-none">{d.weekday}</div>
                      <div className="mono text-[11px] leading-tight mt-0.5">{d.day}</div>
                    </div>
                  ))}
                </div>
              </div>
              {timeline.map((v) => (
                <div
                  key={v.villaId}
                  className="grid grid-cols-[150px_1fr] border-b border-line-soft/60 last:border-0"
                >
                  <div className="px-3 py-2 min-w-0">
                    <div className="mono text-[12px] text-ink leading-tight">{v.villaCode}</div>
                    {v.villaName && (
                      <div className="text-[11px] text-ink-3 truncate">{v.villaName}</div>
                    )}
                  </div>
                  <div className="relative min-h-[44px]">
                    <div
                      className="absolute inset-0 grid"
                      style={{ gridTemplateColumns: `repeat(${NIGHTS}, 1fr)` }}
                    >
                      {days.map((d) => (
                        <div
                          key={d.iso}
                          className="border-r border-line-soft/40"
                          style={
                            d.isToday
                              ? { background: "color-mix(in oklab, var(--terra) 5%, transparent)" }
                              : undefined
                          }
                        />
                      ))}
                    </div>
                    {v.blocks.map((b) => {
                      const ciDay = Math.max(
                        0,
                        (new Date(b.checkIn + "T00:00:00Z").getTime() - startMs) / 86400000,
                      );
                      const coDay = Math.min(
                        NIGHTS,
                        (new Date(b.checkOut + "T00:00:00Z").getTime() - startMs) / 86400000,
                      );
                      if (coDay <= 0 || ciDay >= NIGHTS) return null;
                      const color = CAL_BAR[b.kind] ?? CAL_BAR.confirmed;
                      const style = {
                        left: `calc(${(ciDay / NIGHTS) * 100}% + 3px)`,
                        width: `calc(${((coDay - ciDay) / NIGHTS) * 100}% - 6px)`,
                        background: color.bg,
                        color: color.fg,
                      };
                      const cls =
                        "absolute top-1/2 -translate-y-1/2 h-[24px] rounded-full text-[11px] flex items-center gap-1.5 px-2.5 overflow-hidden whitespace-nowrap";
                      const inner = (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 shrink-0" />
                          <span className="truncate">{b.label}</span>
                        </>
                      );
                      return b.href ? (
                        <Link key={b.id} href={b.href} title={b.label} className={cls} style={style}>
                          {inner}
                        </Link>
                      ) : (
                        <div key={b.id} title={b.label} className={cls} style={style}>
                          {inner}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="mono text-[10.5px] text-ink-4 px-3 py-2.5 border-t border-line-soft">
              CLICK A BAR TO OPEN · <span className="text-terra">●</span> TODAY
            </div>
          </div>
        )}
      </Card>

    </>
  );
}
