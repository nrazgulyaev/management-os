import Link from "next/link";
import {
  Kpi,
  SectionHeading,
  Card,
  Badge,
} from "@/components/dashboard/primitives";

/**
 * Sprint _handoff/ Task 6 (visual port) — Mgmt OS Bookings cabinet.
 *
 * 1:1 visual port of `_handoff/management/bookings.html` (app.js
 * block) into a Next.js server component. Mock data preserved as-is
 * from the prototype — live wiring deferred to TASK-6-DATA per
 * docs/audits/task-6-data-wiring-todo.md.
 *
 * Lives under the Task 5 dashboard shell — body content only.
 * Section order: SectionHeading → 5-up KPI strip → filter row →
 * Bookings table → 14-night calendar timeline → 2-up (Rate plans +
 * Channel sync) → channel-conflict resolver card.
 */

export const metadata = { title: "Bookings" };
export const dynamic = "force-dynamic";

// TODO(task-6-data): wire to listBookings() from features/bookings/services.
const BOOKINGS = [
  { code: "ARC-25-1042", guest: "H. Williams", villa: "EV-07", ch: "Booking.com", in: "25 Apr", out: "30 Apr", nights: 5, gross: "IDR 56.4M", state: "confirmed" as const, vip: false, lang: "EN" },
  { code: "ARC-25-1043", guest: "Family Nielsen", villa: "ES-S2", ch: "Direct", in: "25 Apr", out: "01 May", nights: 6, gross: "IDR 74.2M", state: "checking_in" as const, vip: true, lang: "DA" },
  { code: "ARC-25-1044", guest: "A. Martin", villa: "ES-S5", ch: "Booking.com", in: "26 Apr", out: "30 Apr", nights: 4, gross: "IDR 62.0M", state: "confirmed" as const, vip: false, lang: "FR" },
  { code: "ARC-25-1045", guest: "L. Okonkwo", villa: "AH-01", ch: "Airbnb", in: "27 Apr", out: "04 May", nights: 7, gross: "IDR 98.2M", state: "confirmed" as const, vip: false, lang: "EN" },
  { code: "ARC-25-1046", guest: "Mr. Tanaka", villa: "ES-S1", ch: "Direct", in: "20 Apr", out: "26 Apr", nights: 6, gross: "IDR 65.4M", state: "in_house" as const, vip: true, lang: "JA" },
  { code: "ARC-25-1047", guest: "S. Dubois", villa: "AH-02", ch: "Airbnb", in: "18 Apr", out: "24 Apr", nights: 6, gross: "IDR 88.7M", state: "checking_out" as const, vip: false, lang: "FR" },
  { code: "ARC-25-1048", guest: "Owner · Whitmore", villa: "EV-07", ch: "Owner stay", in: "02 May", out: "08 May", nights: 6, gross: "—", state: "owner_stay" as const, vip: false, lang: "EN" },
  { code: "ARC-25-1049", guest: "R. Singh", villa: "ES-S5", ch: "Booking.com", in: "30 Apr", out: "05 May", nights: 5, gross: "IDR 75.4M", state: "confirmed" as const, vip: false, lang: "EN" },
  { code: "ARC-25-1050", guest: "Anya P.", villa: "ES-S6", ch: "Airbnb", in: "29 Apr", out: "02 May", nights: 3, gross: "IDR 36.8M", state: "on_hold" as const, vip: false, lang: "EN" },
];

// TODO(task-6-data): wire to listRatePlans() — pricing rule-sets service.
const RATE_PLANS = [
  { name: "Eternal · Standard 2026", ch: "All channels", base: "IDR 7.8M/night", multipliers: "Weekend +12%, Peak +35%", mlos: "3 nights" },
  { name: "Eternal · Peak (Dec–Jan)", ch: "Direct + Airbnb", base: "IDR 10.5M/night", multipliers: "Peak window", mlos: "5 nights" },
  { name: "Enso · Pooled 2026", ch: "All channels", base: "IDR 9.2M/night", multipliers: "Weekend +15%, Peak +40%", mlos: "3 nights" },
  { name: "Ahau · Garden 2026", ch: "All channels", base: "IDR 11.2M/night", multipliers: "Weekend +10%", mlos: "4 nights" },
];

// TODO(task-6-data): wire to getChannelHealth() — channel-sync service.
const CHANNEL_HEALTH = [
  { name: "Airbnb", lastSync: "2m ago", conflicts: 0, mtdShare: "38.2%", listings: "14" },
  { name: "Booking.com", lastSync: "5m ago", conflicts: 1, mtdShare: "26.4%", listings: "14" },
  { name: "Agoda", lastSync: "11m ago", conflicts: 0, mtdShare: "9.1%", listings: "8" },
  { name: "VRBO", lastSync: "22m ago", conflicts: 0, mtdShare: "—", listings: "6" },
  { name: "Direct", lastSync: "live", conflicts: 0, mtdShare: "19.7%", listings: "site" },
  { name: "Agent partners", lastSync: "manual", conflicts: 0, mtdShare: "6.6%", listings: "—" },
];

type BookingState =
  | "confirmed"
  | "checking_in"
  | "in_house"
  | "checking_out"
  | "owner_stay"
  | "on_hold";

function StateBadge({ state }: { state: BookingState }) {
  const map: Record<BookingState, { tone?: "ok" | "info" | "gold" | "warn"; label: string }> = {
    confirmed: { tone: "ok", label: "Confirmed" },
    checking_in: { tone: "info", label: "Checking in" },
    in_house: { tone: "gold", label: "In-house" },
    checking_out: { tone: "warn", label: "Checking out" },
    owner_stay: { tone: "gold", label: "Owner stay" },
    on_hold: { label: "On hold" },
  };
  const cfg = map[state];
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
}

// 14-night calendar mock: per-villa booking blocks (from/to in day-index, color, label).
type CalBlock = { from: number; to: number; col: string; t: string };
const CALENDAR_VILLAS: { code: string; blocks: CalBlock[] }[] = [
  { code: "EV-03", blocks: [{ from: 0, to: 14, col: "var(--gold)", t: "Owner" }] },
  { code: "EV-07", blocks: [
    { from: 4, to: 9, col: "var(--forest)", t: "H. Williams" },
    { from: 11, to: 14, col: "var(--gold)", t: "Owner · Whitmore" },
  ] },
  { code: "ES-S1", blocks: [
    { from: 0, to: 5, col: "var(--ink)", t: "Mr. Tanaka" },
    { from: 7, to: 14, col: "var(--forest)", t: "K. Park" },
  ] },
  { code: "ES-S2", blocks: [
    { from: 4, to: 10, col: "var(--terra)", t: "Family Nielsen" },
    { from: 11, to: 14, col: "var(--ink)", t: "M. Singh" },
  ] },
  { code: "ES-S5", blocks: [
    { from: 5, to: 9, col: "var(--ink)", t: "A. Martin" },
    { from: 9, to: 14, col: "var(--forest)", t: "R. Singh" },
  ] },
  { code: "ES-S6", blocks: [{ from: 8, to: 11, col: "var(--warn)", t: "OOO · pool" }] },
  { code: "AH-01", blocks: [{ from: 6, to: 13, col: "var(--terra)", t: "L. Okonkwo" }] },
  { code: "AH-02", blocks: [
    { from: 0, to: 3, col: "var(--ink)", t: "S. Dubois" },
    { from: 5, to: 9, col: "var(--forest)", t: "K. Tanaka" },
  ] },
];

function initials(name: string): string {
  return name
    .split(" ")
    .filter((p) => p && /[A-Za-z]/.test(p[0]))
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function BookingsPage() {
  return (
    <>
      <SectionHeading
        eyebrow="Bookings · live across 6 channels"
        title={
          <>
            9 bookings <em style={{ color: "var(--terra)", fontStyle: "italic" }}>in motion</em> · 142 confirmed YTD
          </>
        }
        subtitle="One source of truth for every channel — Airbnb, Booking.com, Agoda, VRBO, Direct, Agent. Auto-conflict resolution + per-villa rate plans."
        actions={
          <>
            <button className="btn btn-secondary btn-sm">Import iCal</button>
            <button className="btn btn-secondary btn-sm">Export CSV</button>
            <Link href="/dashboard/bookings/new" className="btn btn-primary btn-sm">
              New booking +
            </Link>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 18 }}>
        <Kpi label="Bookings · MTD" value="38" sub="+12 vs Apr '25" />
        <Kpi label="ADR · MTD" value="IDR 912K" sub="+3.1% YoY" tone="accent" />
        <Kpi label="Lead time avg" value="22 days" sub="vs 18d last year" />
        <Kpi label="Channel conflicts" value="1" sub="ES-S5 · Booking.com" tone="success" />
        <Kpi label="Cancellation rate" value="4.2%" sub="−1.8pp YoY" />
      </div>

      {/* Filter row */}
      <div style={{ display: "flex", gap: 14, marginBottom: 14, alignItems: "center", padding: "10px 0" }}>
        <div className="label">FILTER</div>
        {["All", "Confirmed", "In-house", "Owner stays", "On hold", "Cancelled"].map((t, i) => (
          <button
            key={t}
            className={"btn " + (i === 0 ? "btn-primary" : "btn-secondary")}
            style={{ padding: "4px 12px", fontSize: 12 }}
          >
            {t}
          </button>
        ))}
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn btn-secondary btn-sm">Project</button>
          <button className="btn btn-secondary btn-sm">Channel</button>
        </span>
      </div>

      {/* Bookings table */}
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {BOOKINGS.map((b) => (
              <tr key={b.code}>
                <td className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{b.code}</td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        width: 26, height: 26, borderRadius: 999,
                        background: "var(--cream-deep)", border: "1px solid var(--line)",
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10,
                      }}
                    >
                      {initials(b.guest)}
                    </span>
                    <span>{b.guest}</span>
                    {b.vip && (
                      <span className="badge badge-gold" style={{ fontSize: 9 }}>
                        VIP
                      </span>
                    )}
                    <span className="mono" style={{ fontSize: 9.5, color: "var(--ink-4)" }}>{b.lang}</span>
                  </div>
                </td>
                <td className="mono">{b.villa}</td>
                <td style={{ color: "var(--ink-3)" }}>{b.ch}</td>
                <td className="mono" style={{ fontSize: 12 }}>{b.in} → {b.out}</td>
                <td className="num">{b.nights}</td>
                <td className="num">{b.gross}</td>
                <td><StateBadge state={b.state} /></td>
                <td>
                  <button className="btn btn-ghost btn-sm" aria-label="More" style={{ padding: "4px 8px" }}>···</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Calendar timeline */}
      <h2
        id="calendar"
        className="display"
        style={{ fontSize: 30, fontWeight: 400, marginBottom: 14, marginTop: 32 }}
      >
        Calendar · next 14 nights{" "}
        <em style={{ fontSize: 18, color: "var(--terra)", fontStyle: "italic" }}>per villa</em>
      </h2>
      <Card style={{ padding: 20, marginBottom: 18, overflow: "auto" }}>
        <div style={{ minWidth: 1100, display: "grid", gridTemplateColumns: "100px 1fr" }}>
          <div />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(14, 1fr)", gap: 2 }}>
            {Array.from({ length: 14 }).map((_, i) => (
              <div
                key={i}
                className="mono"
                style={{
                  fontSize: 10,
                  textAlign: "center",
                  color: i < 3 ? "var(--terra)" : "var(--ink-3)",
                }}
              >
                {21 + i <= 30 ? 21 + i : 21 + i - 30}
              </div>
            ))}
          </div>
        </div>
        {CALENDAR_VILLAS.map((v) => (
          <div
            key={v.code}
            style={{ display: "grid", gridTemplateColumns: "100px 1fr", marginTop: 6, alignItems: "center" }}
          >
            <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>{v.code}</div>
            <div
              style={{
                position: "relative",
                height: 24,
                background: "var(--cream-warm)",
                borderRadius: 6,
                border: "1px solid var(--line-soft)",
              }}
            >
              <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "repeat(14, 1fr)" }}>
                {Array.from({ length: 13 }).map((_, i) => (
                  <div key={i} style={{ borderRight: "1px dashed var(--line-soft)" }} />
                ))}
              </div>
              {v.blocks.map((b, i) => (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    top: 3,
                    height: 18,
                    left: `${(b.from / 14) * 100}%`,
                    width: `${((b.to - b.from) / 14) * 100}%`,
                    background: b.col,
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
                  {b.t}
                </div>
              ))}
            </div>
          </div>
        ))}
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
            <button className="btn btn-secondary btn-sm" style={{ marginLeft: "auto" }}>+ New plan</button>
          </div>
          <table className="data">
            <thead>
              <tr><th>Plan</th><th>Channels</th><th>Base</th><th>Multipliers</th><th>MLOS</th></tr>
            </thead>
            <tbody>
              {RATE_PLANS.map((p) => (
                <tr key={p.name}>
                  <td style={{ fontFamily: "var(--font-newsreader), serif", fontSize: 14 }}>{p.name}</td>
                  <td style={{ fontSize: 12, color: "var(--ink-3)" }}>{p.ch}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{p.base}</td>
                  <td style={{ fontSize: 12, color: "var(--ink-3)" }}>{p.multipliers}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{p.mlos}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
              Channels · sync
            </h3>
            <span className="pulse-dot" style={{ marginLeft: "auto", marginRight: 8 }} />
            <span className="mono" style={{ fontSize: 10, color: "var(--ok)" }}>ALL LIVE</span>
          </div>
          <ul className="clean" style={{ padding: "4px 0" }}>
            {CHANNEL_HEALTH.map((c) => (
              <li key={c.name} style={{ padding: "10px 18px" }}>
                <span
                  style={{
                    width: 8, height: 8, borderRadius: 999,
                    background: c.conflicts ? "var(--warn)" : "var(--ok)",
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</div>
                  <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)" }}>
                    Last sync: {c.lastSync} · {c.listings} listings
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="num" style={{ fontSize: 12, color: "var(--ink)" }}>{c.mtdShare}</div>
                  {c.conflicts > 0 && (
                    <div className="mono" style={{ fontSize: 10, color: "var(--warn)" }}>{c.conflicts} conflict</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div
            style={{
              padding: "12px 18px",
              borderTop: "1px solid var(--line-soft)",
              background: "var(--cream-warm)",
            }}
          >
            <button
              className="btn btn-secondary btn-sm"
              style={{ width: "100%", justifyContent: "center" }}
            >
              Run sync now →
            </button>
          </div>
        </Card>
      </div>

      {/* Conflict resolver */}
      <Card
        id="sync"
        style={{
          padding: 20,
          marginBottom: 18,
          background: "var(--cream-warm)",
          border: "1px dashed var(--terra)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <span
            style={{
              width: 36, height: 36, borderRadius: 999,
              background: "rgba(196,88,60,0.12)", color: "var(--terra)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}
          >
            !
          </span>
          <div style={{ flex: 1 }}>
            <div className="label" style={{ color: "var(--terra)" }}>1 channel conflict · ES-S5</div>
            <h3 style={{ margin: "4px 0 8px", fontFamily: "var(--font-newsreader), serif", fontSize: 20, fontWeight: 400 }}>
              Booking.com hold for 28 Apr overlaps a direct booking we accepted
            </h3>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--ink-2)" }}>
              Booking.com pulled an iCal block at 22:14 yesterday. Our direct booking ARC-25-1049
              (R. Singh, 30 Apr–5 May) is OK; the conflict is on 28 Apr · 1 night. Likely a
              closed-elsewhere lag.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-terra btn-sm">Resolve · keep direct</button>
              <button className="btn btn-secondary btn-sm">Open both</button>
              <button className="btn btn-ghost btn-sm">Snooze 2h</button>
            </div>
          </div>
        </div>
      </Card>
    </>
  );
}
