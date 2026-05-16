import {
  Kpi,
  SectionHeading,
  Card,
  Badge,
} from "@/components/dashboard/primitives";

/**
 * Sprint _handoff/ Task 6 (visual port) — Mgmt OS Finance cabinet.
 *
 * 1:1 visual port of `_handoff/management/finance.html` (app.js
 * block). Statement-detail server query wiring (replacing the Emma
 * Whitmore · EV-07 · March 2026 demo with real
 * `getStatementDetail()` / `listStatementsForPeriod()` /
 * `listPayoutsQueued()` reads) is deferred to TASK-6-DATA per
 * docs/audits/task-6-data-wiring-todo.md.
 *
 * Section order: SectionHeading → 5-up KPIs → statement detail card
 * (17 lines + net-to-owner total + approval footer) → 2-up
 * (Transparency drill-down + Distribution waterfall) → All
 * statements list → Payouts queue → Material-usage bridge nudge.
 */

export const metadata = { title: "Finance · Owner statements" };
export const dynamic = "force-dynamic";

// TODO(task-6-data): wire to features/finance/services.getStatementDetail(statementId).
// All values below are IDR in thousands (× 1,000) to match the prototype.
const STMT_LINES: { sec: SectionKey; l: string; a: number; hint: string }[] = [
  { sec: "revenue", l: "Gross booking revenue", a: 284600, hint: "19 nights · ADR 14,980,000" },
  { sec: "revenue", l: "Cleaning fee (charged to guest)", a: 18200, hint: "" },
  { sec: "revenue", l: "Extra services (breakfast, transfer)", a: 9400, hint: "3 services · 2 guest orders" },
  { sec: "fees", l: "OTA commission — Airbnb", a: -6840, hint: "3% of channel revenue" },
  { sec: "fees", l: "OTA commission — Booking.com", a: -14580, hint: "15%" },
  { sec: "fees", l: "Payment processing (Xendit / Stripe)", a: -4920, hint: "" },
  { sec: "fees", l: "Bank fees & FX loss", a: -1260, hint: "USD payout · IDR conversion" },
  { sec: "taxes", l: "PHR — Bali hospitality tax (10%)", a: -28460, hint: "Statutory · auto-allocated" },
  { sec: "taxes", l: "PPN — VAT (11%)", a: -9420, hint: "On extra services only" },
  { sec: "expenses", l: "Cleaning & laundry", a: -11200, hint: "19 turnovers" },
  { sec: "expenses", l: "Utilities (electricity, water, wifi)", a: -9450, hint: "3.4 MWh · 28 m³" },
  { sec: "expenses", l: "Maintenance & repairs", a: -4800, hint: "AC service · pool pump" },
  { sec: "expenses", l: "Toiletries & consumables", a: -3100, hint: "Per-stay replenish" },
  { sec: "shared", l: "Pool-allocated shared costs", a: -8940, hint: "Landscaping · security · GM allocation" },
  { sec: "fee_mgmt", l: "Management fee (18% of net)", a: -38420, hint: "Per MSA · 18% of net" },
  { sec: "reserves", l: "Renovation reserve (3%)", a: -7290, hint: "Locked until annual review" },
  { sec: "reserves", l: "FF&E / Depreciation reserve (5%)", a: -12150, hint: "Locked until annual review" },
];

type SectionKey = "revenue" | "fees" | "taxes" | "expenses" | "shared" | "fee_mgmt" | "reserves";

function sectionSum(s: SectionKey): number {
  return STMT_LINES.filter((l) => l.sec === s).reduce((a, l) => a + l.a, 0);
}

const TOTALS = {
  revenue: sectionSum("revenue"),
  fees: sectionSum("fees"),
  taxes: sectionSum("taxes"),
  expenses: sectionSum("expenses"),
  shared: sectionSum("shared"),
  mgmt: sectionSum("fee_mgmt"),
  reserves: sectionSum("reserves"),
};

const NET = Object.values(TOTALS).reduce((a, b) => a + b, 0);

// TODO(task-6-data): wire to features/finance/services.listStatementsForPeriod("2026-03").
const STMT_LIST = [
  { id: "STM-EV07-2026-03", owner: "Emma Whitmore", villa: "EV-07", period: "March 2026", status: "draft_signed" as const, net: NET, sent: "pending" },
  { id: "STM-ES05-2026-03", owner: "Emma Whitmore", villa: "ES-S5", period: "March 2026", status: "approved" as const, net: 312840, sent: "01 Apr" },
  { id: "STM-AHU-2026-03", owner: "Takeda Family Office", villa: "Enso pool", period: "March 2026", status: "approved" as const, net: 982310, sent: "01 Apr" },
  { id: "STM-AH02-2026-03", owner: "Larsen Holdings", villa: "AH-02", period: "March 2026", status: "approved" as const, net: 184670, sent: "01 Apr" },
  { id: "STM-EV07-2026-02", owner: "Emma Whitmore", villa: "EV-07", period: "February 2026", status: "settled" as const, net: 148920, sent: "01 Mar" },
];

// TODO(task-6-data): wire to features/finance/services.listPayoutsQueued().
const PAYMENTS = [
  { id: "pay-1", to: "Emma Whitmore", amt: "USD 9,840", method: "Wise transfer", date: "01 May 2026 · scheduled", status: "queued" as const },
  { id: "pay-2", to: "Takeda Family Office", amt: "JPY 1,420K", method: "SBI Sumishin direct", date: "01 May 2026 · scheduled", status: "queued" as const },
  { id: "pay-3", to: "Larsen Holdings", amt: "SGD 2,180", method: "DBS local", date: "01 May 2026 · scheduled", status: "queued" as const },
  { id: "pay-4", to: "Emma Whitmore", amt: "USD 8,210", method: "Wise transfer", date: "01 Apr 2026", status: "settled" as const },
  { id: "pay-5", to: "Takeda Family Office", amt: "JPY 1,340K", method: "SBI Sumishin direct", date: "01 Apr 2026", status: "settled" as const },
];

function fmtMagnitude(v: number): string {
  const n = Math.abs(v);
  if (n >= 1000) return `${(n / 1000).toFixed(1)}M`;
  return `${n}K`;
}
function signedIdr(v: number): string {
  return `${v >= 0 ? "+" : "−"}IDR ${fmtMagnitude(v)}`;
}

const SECTION_LABEL: Record<SectionKey, string> = {
  revenue: "revenue",
  fees: "fees",
  taxes: "taxes",
  expenses: "expenses",
  shared: "shared",
  fee_mgmt: "fee mgmt",
  reserves: "reserves",
};

const TRANSPARENCY_ROWS: [string, string, string, string, number, string][] = [
  ["ARC-25-0991", "T. Larsen", "Booking.com", "3–8 Mar", 5, "IDR 78.4M"],
  ["ARC-25-0993", "K. Williams", "Direct", "9–12 Mar", 3, "IDR 48.8M"],
  ["ARC-25-0998", "Family Park", "Airbnb", "13–17 Mar", 4, "IDR 62.0M"],
  ["ARC-25-1002", "M. Khan", "Booking.com", "18–21 Mar", 3, "IDR 46.4M"],
  ["ARC-25-1004", "R. Singh", "Direct", "22–28 Mar", 6, "IDR 88.8M"],
];

const WATERFALL: { l: string; v: number; c: string; hl?: boolean }[] = [
  { l: "Gross to villa", v: 100, c: "var(--ink)" },
  { l: "Channels + processing", v: 8.2, c: "var(--info)" },
  { l: "Taxes (PHR + PPN)", v: 13.3, c: "var(--gold)" },
  { l: "Direct opex", v: 10.1, c: "var(--sage)" },
  { l: "Shared", v: 3.1, c: "var(--ink-3)" },
  { l: "Management fee", v: 13.5, c: "var(--ink-2)" },
  { l: "Reserves", v: 6.8, c: "var(--line-strong)" },
  { l: "→ Net to owner", v: 44.9, c: "var(--terra)", hl: true },
];

export default function FinancePage() {
  return (
    <>
      <SectionHeading
        eyebrow="Finance · March 2026 statement · DRAFT, awaiting sign"
        title={
          <>
            Emma Whitmore ·{" "}
            <em style={{ color: "var(--terra)", fontStyle: "italic" }}>Eternal 07</em> · March 2026
          </>
        }
        subtitle="Auto-generated from 142 ledger entries, 19 bookings, 3 owner stays, 27 service orders. Hash-signed when approved."
        actions={
          <>
            <button className="btn btn-secondary btn-sm">Statement PDF ↓</button>
            <button className="btn btn-secondary btn-sm">Bookings CSV</button>
            <button className="btn btn-primary btn-sm">Sign + queue payout</button>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 18 }}>
        <Kpi label="Gross revenue" value={`IDR ${fmtMagnitude(TOTALS.revenue)}`} sub="3 lines" />
        <Kpi label="Channel + processing" value={`IDR ${fmtMagnitude(TOTALS.fees)}`} sub="4 lines" />
        <Kpi label="Taxes (PHR + PPN)" value={`IDR ${fmtMagnitude(TOTALS.taxes)}`} sub="Statutory" />
        <Kpi label="Direct opex" value={`IDR ${fmtMagnitude(TOTALS.expenses)}`} sub="4 lines" />
        <Kpi label="Net to owner" value={`IDR ${fmtMagnitude(NET)}`} sub="≈ USD 9,840" tone="accent" />
      </div>

      {/* Statement detail */}
      <Card id="statements" style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
        <div style={{ padding: "16px 22px", display: "flex", alignItems: "flex-start", borderBottom: "1px solid var(--line-soft)" }}>
          <div>
            <div className="label">Statement</div>
            <h2 style={{ margin: "6px 0 0", fontFamily: "var(--font-newsreader), serif", fontSize: 24 }}>
              STM-EV07-2026-03
            </h2>
            <div className="mono" style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 4 }}>
              17 lines · period 1–31 Mar 2026 · IDR · hash{" "}
              <span style={{ color: "var(--ink-3)" }}>a91f2c…7d4b</span>
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <Badge tone="warn">Draft · awaiting Director</Badge>
            <span className="mono" style={{ fontSize: 10, color: "var(--ink-4)" }}>
              Prepared by Dewi S. · 21 Apr 09:14
            </span>
          </div>
        </div>

        <table className="data">
          <thead>
            <tr>
              <th>Section</th>
              <th>Line item</th>
              <th>Notes</th>
              <th className="num">Amount (IDR)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {STMT_LINES.map((r, i) => (
              <tr key={i}>
                <td>
                  <Badge>{SECTION_LABEL[r.sec]}</Badge>
                </td>
                <td style={{ fontWeight: 500 }}>{r.l}</td>
                <td className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{r.hint}</td>
                <td className="num" style={{ color: r.a >= 0 ? "var(--ok)" : "var(--ink-2)" }}>
                  {signedIdr(r.a)}
                </td>
                <td style={{ textAlign: "right", color: "var(--ink-4)" }}>↗</td>
              </tr>
            ))}
            <tr style={{ borderTop: "2px solid var(--ink)", background: "var(--cream-warm)" }}>
              <td colSpan={2} style={{ padding: "16px 14px", fontFamily: "var(--font-newsreader), serif", fontSize: 22, fontWeight: 400 }}>
                Net to owner · March 2026
              </td>
              <td className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                Wired 01 May 09:00 GMT+8
              </td>
              <td className="num" style={{ padding: "16px 14px", fontSize: 24, color: "var(--terra)" }}>
                IDR {fmtMagnitude(NET)}
              </td>
              <td></td>
            </tr>
          </tbody>
        </table>

        <div
          style={{
            padding: "14px 22px",
            borderTop: "1px solid var(--line-soft)",
            display: "flex",
            gap: 12,
            background: "var(--cream-warm)",
            flexWrap: "wrap",
          }}
        >
          <button className="btn btn-secondary btn-sm">Statement PDF · 6 pages</button>
          <button className="btn btn-secondary btn-sm">Per-line audit log</button>
          <button className="btn btn-secondary btn-sm">Receipts ZIP · 19 items</button>
          <span
            className="mono"
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: "var(--ink-3)",
            }}
          >
            APPROVALS: Dewi S. · Nikita R. (pending)
          </span>
        </div>
      </Card>

      {/* Transparency + waterfall */}
      <h2
        id="transparency"
        className="display"
        style={{ fontSize: 30, marginTop: 32, marginBottom: 14, fontWeight: 400 }}
      >
        Statement transparency ·{" "}
        <em style={{ color: "var(--terra)", fontStyle: "italic" }}>drill-down</em>
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 14, marginBottom: 18 }}>
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-soft)" }}>
            <h3 style={{ margin: 0, fontFamily: "var(--font-newsreader), serif", fontSize: 18, fontWeight: 400 }}>
              Gross revenue · 19 bookings
            </h3>
            <div className="label" style={{ marginTop: 4 }}>Every line linked to a booking + channel + payment</div>
          </div>
          <table className="data">
            <thead>
              <tr>
                <th>Booking</th>
                <th>Guest</th>
                <th>Channel</th>
                <th>Stay</th>
                <th className="num">Nights</th>
                <th className="num">Gross</th>
              </tr>
            </thead>
            <tbody>
              {TRANSPARENCY_ROWS.map((r) => (
                <tr key={r[0]}>
                  <td className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{r[0]}</td>
                  <td>{r[1]}</td>
                  <td style={{ color: "var(--ink-3)" }}>{r[2]}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{r[3]}</td>
                  <td className="num">{r[4]}</td>
                  <td className="num" style={{ color: "var(--ok)" }}>{r[5]}</td>
                </tr>
              ))}
              <tr style={{ background: "var(--cream-warm)", fontWeight: 500 }}>
                <td colSpan={4} style={{ color: "var(--ink-3)" }}>… 14 more bookings (collapsed)</td>
                <td className="num">19</td>
                <td className="num" style={{ color: "var(--ok)" }}>IDR 284.6M</td>
              </tr>
            </tbody>
          </table>
        </Card>

        <Card style={{ padding: 20 }}>
          <h3 style={{ margin: 0, fontFamily: "var(--font-newsreader), serif", fontSize: 18, fontWeight: 400 }}>
            Distribution waterfall · YTD
          </h3>
          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 11 }}>
            {WATERFALL.map((b) => (
              <div key={b.l}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: b.hl ? "var(--terra)" : "var(--ink-2)", fontWeight: b.hl ? 500 : 400 }}>
                    {b.l}
                  </span>
                  <span className="num">{b.v}%</span>
                </div>
                <div
                  style={{
                    height: 6,
                    background: "var(--cream-deep)",
                    borderRadius: 999,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${b.v}%`,
                      background: b.c,
                      borderRadius: 999,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: 18,
              paddingTop: 14,
              borderTop: "1px dashed var(--line)",
              fontSize: 12,
              color: "var(--ink-3)",
            }}
          >
            <span>Last 12 months — annual yield for Emma: </span>
            <span className="num" style={{ color: "var(--terra)" }}>11.4%</span>
          </div>
        </Card>
      </div>

      <h2
        className="display"
        style={{ fontSize: 30, marginTop: 32, marginBottom: 14, fontWeight: 400 }}
      >
        All statements ·{" "}
        <em style={{ color: "var(--terra)", fontStyle: "italic" }}>March 2026</em>
      </h2>
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Statement</th>
              <th>Owner</th>
              <th>Villa / pool</th>
              <th>Period</th>
              <th className="num">Net (IDR K)</th>
              <th>Status</th>
              <th>Sent</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {STMT_LIST.map((s) => (
              <tr key={s.id}>
                <td className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{s.id}</td>
                <td>{s.owner}</td>
                <td className="mono" style={{ fontSize: 12 }}>{s.villa}</td>
                <td style={{ fontFamily: "var(--font-newsreader), serif", fontSize: 14 }}>{s.period}</td>
                <td className="num" style={{ color: "var(--terra)", fontWeight: 500 }}>
                  {fmtMagnitude(s.net)}
                </td>
                <td>
                  {s.status === "draft_signed" ? (
                    <Badge tone="warn">Draft</Badge>
                  ) : s.status === "approved" ? (
                    <Badge tone="info">Approved</Badge>
                  ) : (
                    <Badge tone="ok">Settled</Badge>
                  )}
                </td>
                <td className="mono" style={{ fontSize: 11 }}>{s.sent}</td>
                <td><button className="btn btn-ghost btn-sm">Open →</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <h2
        id="payments"
        className="display"
        style={{ fontSize: 30, marginTop: 32, marginBottom: 14, fontWeight: 400 }}
      >
        Payouts{" "}
        <em style={{ color: "var(--terra)", fontStyle: "italic" }}>queued</em>
      </h2>
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Recipient</th>
              <th>Amount</th>
              <th>Rail</th>
              <th>Date</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {PAYMENTS.map((p) => (
              <tr key={p.id}>
                <td>{p.to}</td>
                <td className="num" style={{ color: "var(--ink)", fontWeight: 500 }}>{p.amt}</td>
                <td style={{ color: "var(--ink-3)" }}>{p.method}</td>
                <td className="mono" style={{ fontSize: 12 }}>{p.date}</td>
                <td>
                  {p.status === "queued" ? <Badge tone="gold">Queued</Badge> : <Badge tone="ok">Settled</Badge>}
                </td>
                <td>
                  <button className="btn btn-ghost btn-sm" aria-label="More">···</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div
          className="mono"
          style={{
            padding: "14px 22px",
            background: "var(--cream-warm)",
            borderTop: "1px solid var(--line-soft)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 12,
            color: "var(--ink-3)",
          }}
        >
          <span>3 payouts queued for 01 May</span>
          <span style={{ marginLeft: "auto" }}>
            Total disbursement:{" "}
            <span className="num" style={{ color: "var(--terra)" }}>USD ~28K</span>
          </span>
        </div>
      </Card>

      {/* Material-usage bridge */}
      <Card
        id="bridge"
        style={{
          padding: 20,
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
            ⚡
          </span>
          <div style={{ flex: 1 }}>
            <div className="label" style={{ color: "var(--terra)" }}>
              Material usage bridge · 8 entries
            </div>
            <h3
              style={{
                margin: "4px 0 8px",
                fontFamily: "var(--font-newsreader), serif",
                fontSize: 20,
                fontWeight: 400,
              }}
            >
              Inventory consumption ready to post to Mar 2026 statements
            </h3>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--ink-2)" }}>
              8 items consumed from stock (toiletries · linens · cleaning supplies) totaling{" "}
              <strong>IDR 3.1M</strong> across 3 villas. Will materialise as expense lines on
              next bridge run.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-terra btn-sm">Bridge pending</button>
              <button className="btn btn-secondary btn-sm">View 8 entries</button>
            </div>
          </div>
        </div>
      </Card>
    </>
  );
}
