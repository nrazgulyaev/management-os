import Link from "next/link";
import {
  Kpi,
  SectionHeading,
  Card,
  Badge,
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
            <em style={{ color: "var(--terra)", fontStyle: "italic" }}>in motion</em>
          </>
        }
        subtitle="One source of truth for every channel. Live rows from your bookings table — channel sync and per-villa rate plans coming soon."
        actions={
          <>
            <button className="btn btn-secondary btn-sm" disabled title="Coming soon" style={{ opacity: 0.55, cursor: "not-allowed" }}>Import iCal</button>
            <button className="btn btn-secondary btn-sm" disabled title="Coming soon" style={{ opacity: 0.55, cursor: "not-allowed" }}>Export CSV</button>
            <Link href="/dashboard/bookings/new" className="btn btn-primary btn-sm">
              New booking +
            </Link>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 18 }}>
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
      <div style={{ display: "flex", gap: 14, marginBottom: 14, alignItems: "center", padding: "10px 0" }}>
        <div className="label">FILTER</div>
        {["All", "Confirmed", "In-house", "Checked out", "Cancelled"].map((t, i) => (
          <button
            key={t}
            className={"btn " + (i === 0 ? "btn-primary" : "btn-secondary")}
            style={{ padding: "4px 12px", fontSize: 12 }}
          >
            {t}
          </button>
        ))}
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn btn-secondary btn-sm" disabled title="Coming soon" style={{ opacity: 0.55, cursor: "not-allowed" }}>Project</button>
          <button className="btn btn-secondary btn-sm" disabled title="Coming soon" style={{ opacity: 0.55, cursor: "not-allowed" }}>Channel</button>
        </span>
      </div>

      {/* Bookings table — live */}
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
        {list.length === 0 ? (
          <p style={{ padding: 20, fontSize: 13, color: "var(--ink-3)", fontStyle: "italic", margin: 0 }}>
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
                    <td className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                      {b.bookingCode}
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: 999,
                            background: "var(--cream-deep)",
                            border: "1px solid var(--line)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 10,
                          }}
                        >
                          {initials(b.guestName)}
                        </span>
                        <span>{b.guestName ?? "Guest"}</span>
                      </div>
                    </td>
                    <td className="mono">{b.villaCode}</td>
                    <td style={{ color: "var(--ink-3)" }}>{b.channelName ?? "Direct"}</td>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {fmtDateShort(b.checkIn)} → {fmtDateShort(b.checkOut)}
                    </td>
                    <td className="num">{b.nights}</td>
                    <td className="num">{fmtUsdMinor(b.grossUsdMinor)}</td>
                    <td>
                      <Badge tone={badge.tone}>{badge.label}</Badge>
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
        className="display"
        style={{ fontSize: 30, fontWeight: 400, marginBottom: 14, marginTop: 32 }}
      >
        Calendar · next 14 nights{" "}
        <em style={{ fontSize: 18, color: "var(--terra)", fontStyle: "italic" }}>per villa</em>
      </h2>
      <Card style={{ padding: 20, marginBottom: 18, overflow: "auto" }}>
        {timeline.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--ink-3)", fontStyle: "italic", margin: 0 }}>
            No villas configured yet.
          </p>
        ) : (
          <>
            <div style={{ minWidth: 1100, display: "grid", gridTemplateColumns: "120px 1fr" }}>
              <div />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(14, 1fr)", gap: 2 }}>
                {dayLabels.map((d, i) => (
                  <div
                    key={i}
                    className="mono"
                    style={{
                      fontSize: 10,
                      textAlign: "center",
                      color: d.highlighted ? "var(--terra)" : "var(--ink-3)",
                    }}
                  >
                    {d.day}
                  </div>
                ))}
              </div>
            </div>
            {timeline.map((v) => (
              <div
                key={v.villaId}
                style={{
                  display: "grid",
                  gridTemplateColumns: "120px 1fr",
                  marginTop: 6,
                  alignItems: "center",
                }}
              >
                <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>
                  {v.villaCode}
                </div>
                <div
                  style={{
                    position: "relative",
                    height: 24,
                    background: "var(--cream-warm)",
                    borderRadius: 6,
                    border: "1px solid var(--line-soft)",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "grid",
                      gridTemplateColumns: "repeat(14, 1fr)",
                    }}
                  >
                    {Array.from({ length: 13 }).map((_, i) => (
                      <div key={i} style={{ borderRight: "1px dashed var(--line-soft)" }} />
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
                        style={{
                          position: "absolute",
                          top: 3,
                          height: 18,
                          left: `${(ciDay / 14) * 100}%`,
                          width: `${((coDay - ciDay) / 14) * 100}%`,
                          background: BLOCK_COLORS[i % BLOCK_COLORS.length],
                          borderRadius: 4,
                          padding: "0 8px",
                          color: "var(--cream-warm)",
                          fontSize: 11,
                          display: "flex",
                          alignItems: "center",
                          overflow: "hidden",
                          whiteSpace: "nowrap",
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
        style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 14, marginBottom: 18 }}
      >
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "14px 18px",
              borderBottom: "1px solid var(--line-soft)",
              display: "flex",
              alignItems: "center",
            }}
          >
            <h3 style={{ margin: 0, fontFamily: "var(--font-newsreader), serif", fontSize: 18, fontWeight: 400 }}>
              Rate plans · active
            </h3>
            <button className="btn btn-secondary btn-sm" disabled title="Coming soon" style={{ opacity: 0.55, cursor: "not-allowed", marginLeft: "auto" }}>+ New plan</button>
          </div>
          {ratePlans.length === 0 ? (
            <p style={{ padding: 20, fontSize: 13, color: "var(--ink-3)", fontStyle: "italic", margin: 0 }}>
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
                    <td style={{ fontFamily: "var(--font-newsreader), serif", fontSize: 14 }}>
                      {p.planName}
                    </td>
                    <td style={{ fontSize: 12, color: "var(--ink-3)" }}>{p.channels.join(", ")}</td>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {fmtUsdMinor(p.basePriceUsdMinor)}/night
                    </td>
                    <td style={{ fontSize: 12, color: "var(--ink-3)" }}>{p.multipliers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card id="channels" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "14px 18px",
              borderBottom: "1px solid var(--line-soft)",
              display: "flex",
              alignItems: "center",
            }}
          >
            <h3 style={{ margin: 0, fontFamily: "var(--font-newsreader), serif", fontSize: 18, fontWeight: 400 }}>
              Channels
            </h3>
            <span className="mono" style={{ marginLeft: "auto", fontSize: 10, color: "var(--ink-3)" }}>
              SYNC NOT CONFIGURED
            </span>
          </div>
          {channels.length === 0 ? (
            <p style={{ padding: 20, fontSize: 13, color: "var(--ink-3)", fontStyle: "italic", margin: 0 }}>
              No channels yet.
            </p>
          ) : (
            <ul className="clean" style={{ padding: "4px 0" }}>
              {channels.map((c) => (
                <li key={c.channelKey} style={{ padding: "10px 18px" }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: "var(--ink-3)",
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{c.channelName}</div>
                    <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)" }}>
                      sync schema lands in DEMO-3
                    </div>
                  </div>
                  <Badge>Roster</Badge>
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
          style={{
            padding: 20,
            marginBottom: 18,
            background: "var(--cream-warm)",
            border: "1px dashed var(--terra)",
          }}
        >
          <div className="label" style={{ color: "var(--terra)" }}>
            {conflicts.length} channel {conflicts.length === 1 ? "conflict" : "conflicts"}
          </div>
        </Card>
      )}
    </>
  );
}
