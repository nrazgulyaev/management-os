import Link from "next/link";
import {
  Kpi,
  SectionHeading,
  Card,
  Badge,
} from "@/components/dashboard/primitives";

/**
 * Sprint _handoff/ Task 7 (visual port) — Dev OS CFO / Accountant cabinet.
 *
 * 1:1 visual port of `_handoff/development/cfo.html` (app.js block).
 * Mock data preserved verbatim — live wiring deferred to TASK-7-DATA
 * per docs/audits/task-6-7-data-wiring-todo.md.
 *
 * CRITICAL — operator's daily bookkeeper flow protection:
 *   The functional widgets (snap-a-receipt with OCR / SpreadsheetView
 *   quick-entry / Transactions list with delete) live on dedicated
 *   routes under `/development-os/finance/transactions/*`. They are
 *   NOT embedded in this cabinet page (prototype doesn't include them
 *   either). To keep them reachable from the daily flow, this port
 *   adds three prominent CTAs in the SectionHeading actions slot that
 *   link directly into those routes:
 *     - "Snap receipt" → /development-os/finance/transactions/quick-entry
 *       (HF-7 duplicate fix · HF-8 body-size + compression ·
 *        AI-ACTIVATION-1 OCR live)
 *     - "Quick entry"  → same route, opens straight into spreadsheet
 *     - "All transactions" → /development-os/finance/transactions
 *       (HF-7 delete button)
 *
 * Sections: SectionHeading → 5-up KPIs → 2-up (P&L by project + Cash
 * position 6-week strip) → Tax types AI-categorised table → Shared
 * costs allocation table.
 */

export const metadata = { title: "CFO · Accountant" };
export const dynamic = "force-dynamic";

// TODO(task-7-data): wire to features/finance/services.getCfoKpis().
const KPIS = {
  cashOnHand: { v: "$684K", sub: "across 3 SPV banks" },
  arOpen: { v: "$184K", sub: "6 invoices · 2 past due" },
  apOpen: { v: "$248K", sub: "14 invoices · 4 this week" },
  spendMtd: { v: "$182K", sub: "hard cost 86%" },
  burn30d: { v: "$220K", sub: "vs $240K budget" },
};

// TODO(task-7-data): wire to features/development/services.getPnlByProject().
const PNL_ROWS: { code: string; hard: string; soft: string; fin: string; total: string }[] = [
  { code: "EP02", hard: "$1,840K", soft: "$420K", fin: "$84K", total: "$2,344K" },
  { code: "ES10", hard: "$680K", soft: "$220K", fin: "$42K", total: "$942K" },
  { code: "AHP3", hard: "$0", soft: "$180K", fin: "$24K", total: "$204K" },
];

// TODO(task-7-data): wire to features/development/services.getCashStrip6w().
const CASH_BARS: number[] = [760, 720, 684, 624, 580, 540, 510, 480];
const WEEK_LABELS = ["W34", "W35", "W36", "W37", "W38", "W39", "W40", "W41"];

// TODO(task-7-data): wire to features/finance/services.listTaxTypes().
const TAX_TYPES: { name: string; rate: string; mtd: string; ytd: string; status: "ok" | "warn"; statusLabel: string }[] = [
  { name: "PPN (Indonesia VAT)", rate: "11%", mtd: "$18,420", ytd: "$84,210", status: "ok", statusLabel: "Filed Q1" },
  { name: "PPh 21 (Income tax · staff)", rate: "5–30%", mtd: "$4,840", ytd: "$24,180", status: "ok", statusLabel: "On schedule" },
  { name: "PPh 23 (Withholding · vendors)", rate: "2%", mtd: "$1,820", ytd: "$8,420", status: "warn", statusLabel: "Awaiting filing · 4d" },
  { name: "PBB (Property tax)", rate: "0.5%", mtd: "—", ytd: "$12,400", status: "ok", statusLabel: "Paid annually" },
];

// TODO(task-7-data): wire to features/finance/services.listSharedCostAllocations().
const SHARED_COSTS: { category: string; total: string; rule: string; ep02: string; es10: string; ahp3: string }[] = [
  { category: "Director salary", total: "$8,400", rule: "By revenue weight", ep02: "$3,920", es10: "$2,940", ahp3: "$1,540" },
  { category: "Office rent", total: "$2,800", rule: "Equal split", ep02: "$933", es10: "$933", ahp3: "$933" },
  { category: "Software licenses", total: "$1,400", rule: "Per-user weight", ep02: "$580", es10: "$520", ahp3: "$300" },
];

export default function CfoAccountantPage() {
  return (
    <>
      <SectionHeading
        eyebrow="CFO · books, cash, taxes"
        title={
          <>
            P&L · cash · AR/AP.{" "}
            <span style={{ color: "var(--amber)" }}>One source of truth.</span>
          </>
        }
        subtitle="Tax assistant categorises every transaction, splits VAT, drafts journal entries. Closed periods locked. Per-project + roll-up views."
        actions={
          <>
            {/* Daily-flow CTAs — preserved bookkeeper widgets live on
                dedicated routes (HF-7/HF-8/AI-ACTIVATION-1). Keeping
                these prominent in the cabinet action slot. */}
            <Link
              href="/development-os/finance/transactions/quick-entry"
              className="btn btn-amber btn-sm"
            >
              📸 Snap receipt
            </Link>
            <Link
              href="/development-os/finance/transactions/quick-entry"
              className="btn btn-dark btn-sm"
            >
              Quick entry
            </Link>
            <Link
              href="/development-os/finance/transactions"
              className="btn btn-dark btn-sm"
            >
              All transactions
            </Link>
            <button className="btn btn-dark btn-sm">Tax pack PDF ↓</button>
            <button className="btn btn-amber btn-sm">+ Journal entry</button>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 18 }}>
        <Kpi label="Cash on hand" value={KPIS.cashOnHand.v} sub={KPIS.cashOnHand.sub} tone="success" />
        <Kpi label="AR · open" value={KPIS.arOpen.v} sub={KPIS.arOpen.sub} tone="accent" />
        <Kpi label="AP · open" value={KPIS.apOpen.v} sub={KPIS.apOpen.sub} />
        <Kpi label="MTD spend" value={KPIS.spendMtd.v} sub={KPIS.spendMtd.sub} />
        <Kpi label="Forecast burn · 30d" value={KPIS.burn30d.v} sub={KPIS.burn30d.sub} tone="success" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14, marginBottom: 18 }}>
        <Card style={{ padding: 20 }}>
          <h3 className="display" style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>
            P&L · YTD by project
          </h3>
          <div className="label" style={{ marginTop: 4 }}>USD · cost basis</div>
          <table className="data" style={{ marginTop: 14 }}>
            <thead>
              <tr>
                <th>Project</th>
                <th className="num">Hard cost</th>
                <th className="num">Soft cost</th>
                <th className="num">Financing</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {PNL_ROWS.map((r) => (
                <tr key={r.code}>
                  <td className="mono">{r.code}</td>
                  <td className="num">{r.hard}</td>
                  <td className="num">{r.soft}</td>
                  <td className="num">{r.fin}</td>
                  <td className="num" style={{ color: "var(--ink)", fontWeight: 500 }}>
                    {r.total}
                  </td>
                </tr>
              ))}
              <tr style={{ background: "var(--bg-2)", fontWeight: 500 }}>
                <td>Portfolio</td>
                <td className="num">$2,520K</td>
                <td className="num">$820K</td>
                <td className="num">$150K</td>
                <td className="num" style={{ color: "var(--amber)" }}>$3,490K</td>
              </tr>
            </tbody>
          </table>
        </Card>

        <Card style={{ padding: 20 }}>
          <h3 className="display" style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>
            Cash position · 6 weeks
          </h3>
          <div
            style={{
              marginTop: 14,
              display: "flex",
              alignItems: "flex-end",
              gap: 6,
              height: 140,
            }}
          >
            {CASH_BARS.map((v, i) => (
              <div
                key={WEEK_LABELS[i]}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <span className="num" style={{ fontSize: 9, color: "var(--ink-3)" }}>{v}</span>
                <div
                  style={{
                    width: "100%",
                    height: `${v / 8}px`,
                    background: i < 3 ? "var(--steel)" : "var(--amber)",
                    borderRadius: "3px 3px 0 0",
                    opacity: i < 3 ? 1 : 0.7,
                  }}
                />
                <span className="mono" style={{ fontSize: 8, color: "var(--ink-4)" }}>
                  {WEEK_LABELS[i]}
                </span>
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: 12,
              padding: 12,
              background: "var(--bg-3)",
              border: "1px solid var(--line)",
              borderRadius: 10,
              fontSize: 12,
              color: "var(--ink-2)",
            }}
          >
            Forecast crosses{" "}
            <strong style={{ color: "var(--amber)" }}>$500K minimum reserve</strong> in
            week 41. Capital call 05 likely needed by 15 May.
          </div>
        </Card>
      </div>

      <h2
        id="tax"
        className="display"
        style={{ fontSize: 24, marginBottom: 14, fontWeight: 500 }}
      >
        Tax types · auto-categorised by AI
      </h2>
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Type</th>
              <th>Rate</th>
              <th>MTD</th>
              <th>YTD</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {TAX_TYPES.map((t) => (
              <tr key={t.name}>
                <td>{t.name}</td>
                <td className="mono">{t.rate}</td>
                <td className="num">{t.mtd}</td>
                <td className="num">{t.ytd}</td>
                <td>
                  {t.status === "ok" ? (
                    <Badge tone="ok">{t.statusLabel}</Badge>
                  ) : (
                    <Badge tone="warn">{t.statusLabel}</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <h2
        id="shared"
        className="display"
        style={{ fontSize: 24, marginBottom: 14, fontWeight: 500, marginTop: 24 }}
      >
        Shared costs · allocation
      </h2>
      <Card style={{ padding: 20 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Cost category</th>
              <th>Total · MTD</th>
              <th>Allocation rule</th>
              <th>EP02</th>
              <th>ES10</th>
              <th>AHP3</th>
            </tr>
          </thead>
          <tbody>
            {SHARED_COSTS.map((s) => (
              <tr key={s.category}>
                <td>{s.category}</td>
                <td className="num">{s.total}</td>
                <td>{s.rule}</td>
                <td className="num">{s.ep02}</td>
                <td className="num">{s.es10}</td>
                <td className="num">{s.ahp3}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
