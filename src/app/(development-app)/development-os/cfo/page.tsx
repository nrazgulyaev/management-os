import Link from "next/link";
import {
  Kpi,
  SectionHeading,
  Card,
  Badge,
} from "@/components/dashboard/primitives";

/**
 * TASK-8-MISSING-ROUTES-1 — Dev OS CFO summary cabinet.
 *
 * Ported from `_handoff/development/cfo.html` (TASK-7-VISUAL). This
 * is the top-level CFO summary (P&L · cash · AR/AP roll-up), distinct
 * from the per-role cabinet at /development-os/cabinets/cfo-accountant
 * which already ships with live data wiring (cfo-cabinet-queries.ts).
 *
 * Mock data preserved verbatim from prototype this sprint. Live
 * wiring to dev_transactions + tax_types + shared_costs lands in
 * TASK-7-DATA-PART-4 (already partly covered by cfo-cabinet-queries
 * for the per-role page — extending here is a follow-up).
 */

export const metadata = { title: "Development OS · CFO" };
export const dynamic = "force-dynamic";

const PL_ROWS = [
  { code: "EP02", hardCost: "$1,840K", softCost: "$420K", financing: "$84K", total: "$2,344K" },
  { code: "ES10", hardCost: "$680K", softCost: "$220K", financing: "$42K", total: "$942K" },
  { code: "AHP3", hardCost: "$0", softCost: "$180K", financing: "$24K", total: "$204K" },
];

const CASH_BARS = [760, 720, 684, 624, 580, 540, 510, 480];
const CASH_LABELS = ["W34", "W35", "W36", "W37", "W38", "W39", "W40", "W41"];
const CASH_MAX = Math.max(...CASH_BARS);

const TAX_ROWS = [
  { type: "PPN (Indonesia VAT)", rate: "11%", mtd: "$18,420", ytd: "$84,210", status: "filed", label: "Filed Q1" },
  { type: "PPh 21 (Income tax · staff)", rate: "5–30%", mtd: "$4,840", ytd: "$24,180", status: "ok", label: "On schedule" },
  { type: "PPh 23 (Withholding · vendors)", rate: "2%", mtd: "$1,820", ytd: "$8,420", status: "warn", label: "Awaiting filing · 4d" },
  { type: "PBB (Property tax)", rate: "0.5%", mtd: "—", ytd: "$12,400", status: "ok", label: "Paid annually" },
];

const SHARED_COSTS = [
  { category: "Director salary", total: "$8,400", rule: "By revenue weight", ep02: "$3,920", es10: "$2,940", ahp3: "$1,540" },
  { category: "Office rent", total: "$2,800", rule: "Equal split", ep02: "$933", es10: "$933", ahp3: "$933" },
  { category: "Software licenses", total: "$1,400", rule: "Per-user weight", ep02: "$580", es10: "$520", ahp3: "$300" },
];

export default function DevCfoPage() {
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
            <button className="btn btn-dark btn-sm">Tax pack PDF ↓</button>
            <Link
              href="/development-os/finance/transactions/quick-entry"
              className="btn btn-amber btn-sm"
            >
              + Journal entry
            </Link>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 18 }}>
        <Kpi label="Cash on hand" value="$684K" sub="across 3 SPV banks" tone="success" />
        <Kpi label="AR · open" value="$184K" sub="6 invoices · 2 past due" tone="accent" />
        <Kpi label="AP · open" value="$248K" sub="14 invoices · 4 this week" />
        <Kpi label="MTD spend" value="$182K" sub="hard cost 86%" />
        <Kpi label="Forecast burn · 30d" value="$220K" sub="vs $240K budget" tone="success" />
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
              {PL_ROWS.map((r) => (
                <tr key={r.code}>
                  <td className="mono">{r.code}</td>
                  <td className="num">{r.hardCost}</td>
                  <td className="num">{r.softCost}</td>
                  <td className="num">{r.financing}</td>
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
          <div style={{ marginTop: 14, display: "flex", alignItems: "flex-end", gap: 6, height: 140 }}>
            {CASH_BARS.map((v, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <span className="num" style={{ fontSize: 9, color: "var(--ink-3)" }}>
                  {v}
                </span>
                <div
                  style={{
                    width: "100%",
                    height: `${(v / CASH_MAX) * 110}px`,
                    background: i < 3 ? "var(--steel)" : "var(--amber)",
                    borderRadius: "3px 3px 0 0",
                    opacity: i < 3 ? 1 : 0.7,
                  }}
                />
                <span className="mono" style={{ fontSize: 8, color: "var(--ink-4)" }}>
                  {CASH_LABELS[i]}
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
            Forecast crosses <strong style={{ color: "var(--amber)" }}>$500K minimum reserve</strong> in week 41. Capital call 05 likely needed by 15 May.
          </div>
        </Card>
      </div>

      <h2 id="tax" className="display" style={{ fontSize: 24, marginBottom: 14, fontWeight: 500 }}>
        Tax types · auto-categorised by AI
      </h2>
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Type</th>
              <th>Rate</th>
              <th className="num">MTD</th>
              <th className="num">YTD</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {TAX_ROWS.map((t) => (
              <tr key={t.type}>
                <td>{t.type}</td>
                <td className="mono">{t.rate}</td>
                <td className="num">{t.mtd}</td>
                <td className="num">{t.ytd}</td>
                <td>
                  <Badge tone={t.status === "warn" ? "warn" : "ok"}>{t.label}</Badge>
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
              <th className="num">Total · MTD</th>
              <th>Allocation rule</th>
              <th className="num">EP02</th>
              <th className="num">ES10</th>
              <th className="num">AHP3</th>
            </tr>
          </thead>
          <tbody>
            {SHARED_COSTS.map((s) => (
              <tr key={s.category}>
                <td>{s.category}</td>
                <td className="num">{s.total}</td>
                <td style={{ color: "var(--ink-3)" }}>{s.rule}</td>
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
