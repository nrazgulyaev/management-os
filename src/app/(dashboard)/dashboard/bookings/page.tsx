import Link from "next/link";
import {
  Kpi,
  SectionHeading,
  Card,
  HandoffBadge,
} from "@/components/dashboard/primitives";
import {
  listBookingsForCabinet,
  getBookingsKpis,
  getNext14NightsTimeline,
  getRatePlans,
  getChannelSyncStatus,
  getConflictResolverItems,
} from "@/features/bookings/bookings-cabinet-queries";

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

function fmtDateShort(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

const STATE_BADGE: Record<string, { tone?: "ok" | "info" | "gold" | "warn"; label: string }> = {
  confirmed: { tone: "ok", label: "Confirmed" },
  checked_in: { tone: "gold", label: "In-house" },
  checked_out: { tone: "warn", label: "Checked out" },
  inquiry: { label: "Inquiry" },
  tentative: { label: "Tentative" },
  cancelled: { label: "Cancelled" },
  no_show: { label: "No show" },
};

function initials(name: string | null): string {
  if (!name) return "—";
  return name
    .split(/\s+/)
    .filter((p) => p && /[A-Za-z]/.test(p[0]))
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const BLOCK_COLORS = ["var(--forest)", "var(--terra)", "var(--ink)", "var(--gold)"] as const;

export default async function BookingsPage() {
  const [list, kpis, timeline, ratePlans, channels, conflicts] = await Promise.all([
    listBookingsForCabinet(25).catch(() => []),
    getBookingsKpis().catch(() => null),
    getNext14NightsTimeline().catch(() => []),
    getRatePlans().catch(() => []),
    getChannelSyncStatus().catch(() => []),
    getConflictResolverItems().catch(() => []),
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
      <SectionHeading
        eyebrow={`Bookings · live across ${channels.length || "—"} channels`}
        title={
          <>
            {list.length === 0
              ? "No bookings yet."
              : `${list.length} ${list.length === 1 ? "booking" : "bookings"}`}{" "}
            <em>in motion</em>
          </>
        }
        subtitle="One source of truth for every channel. Live rows from your bookings table — channel sync and per-villa rate plans coming soon."
        actions={
          <>
            <button
              className="btn btn-secondary btn-sm opacity-55 cursor-not-allowed"
              disabled
              title="Coming soon"
            >
              Import iCal
            </button>
            <button
              className="btn btn-secondary btn-sm opacity-55 cursor-not-allowed"
              disabled
              title="Coming soon"
            >
              Export CSV
            </button>
            <Link href="/dashboard/bookings/new" className="btn btn-primary btn-sm">
              New booking +
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-5 gap-3 mb-[18px]">
        <Kpi
          label="Bookings · MTD"
          value={kpis && kpis.bookingsMtd > 0 ? String(kpis.bookingsMtd) : "—"}
          sub="this month"
        />
        <Kpi
          label="ADR · MTD"
          value={kpis && kpis.adrMtdUsdMinor > 0n ? fmtIdrFromUsd(kpis.adrMtdUsdMinor) : "—"}
          sub="avg per night"
          tone={kpis && kpis.adrMtdUsdMinor > 0n ? "accent" : undefined}
        />
        <Kpi
          label="Lead time avg"
          value={kpis && kpis.leadTimeAvgDays > 0 ? `${kpis.leadTimeAvgDays} days` : "—"}
          sub="created → check-in · YTD"
        />
        <Kpi
          label="Channel conflicts"
          value="—"
          sub="channel sync coming soon"
        />
        <Kpi
          label="Cancellation rate"
          value={kpis ? `${kpis.cancellationRatePct}%` : "—"}
          sub="YTD"
        />
      </div>

      {/* Filter row (static pills until filter state wires up) */}
      <div className="flex gap-3.5 mb-3.5 items-center py-2.5">
        <div className="label">FILTER</div>
        {["All", "Confirmed", "In-house", "Checked out", "Cancelled"].map((t, i) => (
          <button
            key={t}
            className={
              "btn px-3 py-1 text-[12px] " +
              (i === 0 ? "btn-primary" : "btn-secondary")
            }
          >
            {t}
          </button>
        ))}
        <span className="ml-auto flex gap-2">
          <button
            className="btn btn-secondary btn-sm opacity-55 cursor-not-allowed"
            disabled
            title="Coming soon"
          >
            Project
          </button>
          <button
            className="btn btn-secondary btn-sm opacity-55 cursor-not-allowed"
            disabled
            title="Coming soon"
          >
            Channel
          </button>
        </span>
      </div>

      {/* Bookings table — live */}
      <Card padding="none" overflowHidden className="mb-[18px]">
        {list.length === 0 ? (
          <p className="p-5 text-[13px] text-ink-3 italic m-0">
            No bookings to show. Create your first booking to populate the table.
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Code</th>
                <th>Guest</th>
                <th>Villa</th>
                <th>Channel</th>
                <th>Stay</th>
                <th className="num">Nights</th>
                <th className="num">Gross</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {list.map((b) => {
                const badge = STATE_BADGE[b.status] ?? { label: b.status };
                return (
                  <tr key={b.id}>
                    <td className="mono text-[11px] text-ink-3">{b.bookingCode}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="w-[26px] h-[26px] rounded-full bg-muted border border-line flex items-center justify-center text-[10px]">
                          {initials(b.guestName)}
                        </span>
                        <span>{b.guestName ?? "Guest"}</span>
                      </div>
                    </td>
                    <td className="mono">{b.villaCode}</td>
                    <td className="text-ink-3">{b.channelName ?? "Direct"}</td>
                    <td className="mono text-[12px]">
                      {fmtDateShort(b.checkIn)} → {fmtDateShort(b.checkOut)}
                    </td>
                    <td className="num">{b.nights}</td>
                    <td className="num">{fmtUsdMinor(b.grossUsdMinor)}</td>
                    <td>
                      <HandoffBadge tone={badge.tone}>{badge.label}</HandoffBadge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
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

      {/* 2-up: Rate plans + Channel sync */}
      <div
        id="rate-plans"
        className="grid grid-cols-[1.2fr_1fr] gap-3.5 mb-[18px]"
      >
        <Card padding="none" overflowHidden>
          <div className="px-[18px] py-3.5 border-b border-line-soft flex items-center">
            <h3 className="display-sm">Rate plans · active</h3>
            <button
              className="btn btn-secondary btn-sm opacity-55 cursor-not-allowed ml-auto"
              disabled
              title="Coming soon"
            >
              + New plan
            </button>
          </div>
          {ratePlans.length === 0 ? (
            <p className="p-5 text-[13px] text-ink-3 italic m-0">
              No rate plans configured. Dynamic-pricing schema lands in DEMO-3.
            </p>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Channels</th>
                  <th>Base</th>
                  <th>Multipliers</th>
                </tr>
              </thead>
              <tbody>
                {ratePlans.map((p) => (
                  <tr key={p.planName}>
                    <td className="serif text-[14px]">{p.planName}</td>
                    <td className="text-[12px] text-ink-3">{p.channels.join(", ")}</td>
                    <td className="mono text-[12px]">
                      {fmtUsdMinor(p.basePriceUsdMinor)}/night
                    </td>
                    <td className="text-[12px] text-ink-3">{p.multipliers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card id="channels" padding="none" overflowHidden>
          <div className="px-[18px] py-3.5 border-b border-line-soft flex items-center">
            <h3 className="display-sm">Channels</h3>
            <span className="mono ml-auto text-[10px] text-ink-3">
              SYNC NOT CONFIGURED
            </span>
          </div>
          {channels.length === 0 ? (
            <p className="p-5 text-[13px] text-ink-3 italic m-0">
              No channels yet.
            </p>
          ) : (
            <ul className="clean py-1">
              {channels.map((c) => (
                <li key={c.channelKey} className="px-[18px] py-2.5">
                  <span className="w-2 h-2 rounded-full bg-ink-3" />
                  <div className="flex-1">
                    <div className="text-[13px] font-medium">{c.channelName}</div>
                    <div className="mono text-[10.5px] text-ink-4">
                      sync schema lands in DEMO-3
                    </div>
                  </div>
                  <HandoffBadge>Roster</HandoffBadge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Conflict resolver — empty state */}
      {conflicts.length > 0 && (
        <Card
          id="sync"
          className="p-5 mb-[18px] bg-cream-warm border border-dashed border-terra"
        >
          <div className="label text-terra">
            {conflicts.length} channel {conflicts.length === 1 ? "conflict" : "conflicts"}
          </div>
        </Card>
      )}
    </>
  );
}
