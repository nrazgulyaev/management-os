import Link from "next/link";
import {
  Kpi,
  SectionHeading,
  Card,
} from "@/components/dashboard/primitives";
import { safeQuery } from "@/lib/development/safe-query";
import {
  getCfoKpis,
  getPnlByProject,
  getCashStrip6Week,
  getActiveTaxTypes,
  getSharedCostsBreakdown,
} from "@/lib/development/server/cabinets/cfo-cabinet-queries";
import { WaterfallChart } from "@/components/cfo/waterfall-chart";

/**
 * Dev OS CFO summary cabinet. KPI strip + P&L-by-project + 6-week cash
 * strip + active tax types + shared-cost allocation are all live
 * (getCfoKpis / getPnlByProject / getCashStrip6Week / getActiveTaxTypes /
 * getSharedCostsBreakdown). The capital-waterfall viz is illustrative
 * (no single aggregate query backs it yet).
 */

export const metadata = { title: "Development OS · CFO" };
export const dynamic = "force-dynamic";

function fmtUsd(minor: number): string {
  const usd = minor / 100;
  const sign = usd < 0 ? "-" : "";
  const abs = Math.abs(usd);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${Math.round(abs)}`;
}

export default async function DevCfoPage() {
  const [kpis, pnl, cash, taxTypes, sharedCosts] = await Promise.all([
    safeQuery("devCfoKpis", getCfoKpis(), null),
    safeQuery("devCfoPnl", getPnlByProject(), []),
    safeQuery("devCfoCash", getCashStrip6Week(), []),
    safeQuery("devCfoTax", getActiveTaxTypes(), []),
    safeQuery("devCfoShared", getSharedCostsBreakdown(), []),
  ]);

  const pnlTotal = pnl.reduce(
    (a, r) => ({
      hard: a.hard + r.hardCostMinor,
      soft: a.soft + r.softCostMinor,
      fin: a.fin + r.financingMinor,
      total: a.total + r.totalMinor,
    }),
    { hard: 0, soft: 0, fin: 0, total: 0 },
  );
  const cashMaxAbs = Math.max(1, ...cash.map((c) => Math.abs(c.netMinor)));

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
            <button className="btn btn-dark btn-sm" disabled title="Coming soon" style={{ opacity: 0.55, cursor: "not-allowed" }}>Tax pack PDF ↓</button>
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
        <Kpi
          label="Cash on hand"
          value={kpis ? fmtUsd(kpis.cashOnHandMinor) : "—"}
          sub="across SPV banks"
          tone={kpis && kpis.cashOnHandMinor > 0 ? "success" : undefined}
        />
        <Kpi
          label="AR · open"
          value={kpis ? fmtUsd(kpis.receivablesMinor) : "—"}
          sub="receivables"
          tone="accent"
        />
        <Kpi
          label="AP · open · next 30d"
          value={kpis ? fmtUsd(kpis.payablesNext30Minor) : "—"}
          sub="payables"
        />
        <Kpi
          label="MTD spend"
          value={kpis ? fmtUsd(kpis.spendMtdMinor) : "—"}
          sub="outflows month-to-date"
        />
        <Kpi
          label="Forecast burn · 30d"
          value={kpis ? fmtUsd(kpis.forecastBurn30dMinor) : "—"}
          sub="trailing-30 outflow"
          tone={kpis && kpis.forecastBurn30dMinor > 0 ? "success" : undefined}
        />
      </div>

      {/* PR 2.2 dev-02 — consolidated console: waterfall + sub-route nav */}
      <Card style={{ padding: 20, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 14 }}>
          <h3 className="display" style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>
            Capital waterfall · YTD
          </h3>
          <span className="label">USD · illustrative</span>
          <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <Link href="/development-os/cfo/cashflow" className="btn btn-secondary btn-sm">
              Cashflow forecast →
            </Link>
            <Link href="/development-os/cfo/capital-calls" className="btn btn-secondary btn-sm">
              Capital calls →
            </Link>
            <Link href="/development-os/cfo/distributions" className="btn btn-secondary btn-sm">
              Distributions →
            </Link>
          </span>
        </div>
        <WaterfallChart
          rows={[
            { label: "Commitments", usdMinor: 12_400_000_00n, tone: "accent" },
            { label: "Called to date", usdMinor: 8_200_000_00n, tone: "accent" },
            { label: "Land + acquisition", usdMinor: 3_100_000_00n, tone: "ink" },
            { label: "Hard costs", usdMinor: 3_400_000_00n, tone: "ink" },
            { label: "Soft costs", usdMinor: 820_000_00n, tone: "ink" },
            { label: "Financing", usdMinor: 150_000_00n, tone: "ink" },
            { label: "Sales + marketing", usdMinor: 240_000_00n, tone: "ink" },
            { label: "Reserved (contingency)", usdMinor: 280_000_00n, tone: "dashed" },
            { label: "Cash on hand", usdMinor: 210_000_00n, tone: "ok" },
          ]}
        />
      </Card>

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
              {pnl.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", color: "var(--ink-3)", padding: "28px 0", fontStyle: "italic" }}>
                    No project transactions yet.
                  </td>
                </tr>
              ) : (
                <>
                  {pnl.map((r) => (
                    <tr key={r.projectId}>
                      <td className="mono">{r.projectCode}</td>
                      <td className="num">{fmtUsd(r.hardCostMinor)}</td>
                      <td className="num">{fmtUsd(r.softCostMinor)}</td>
                      <td className="num">{fmtUsd(r.financingMinor)}</td>
                      <td className="num" style={{ color: "var(--ink)", fontWeight: 500 }}>
                        {fmtUsd(r.totalMinor)}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: "var(--bg-2)", fontWeight: 500 }}>
                    <td>Portfolio</td>
                    <td className="num">{fmtUsd(pnlTotal.hard)}</td>
                    <td className="num">{fmtUsd(pnlTotal.soft)}</td>
                    <td className="num">{fmtUsd(pnlTotal.fin)}</td>
                    <td className="num" style={{ color: "var(--amber)" }}>{fmtUsd(pnlTotal.total)}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </Card>

        <Card style={{ padding: 20 }}>
          <h3 className="display" style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>
            Net cash flow · 6 weeks
          </h3>
          <div className="label" style={{ marginTop: 4 }}>USD · weekly inflow − outflow</div>
          {cash.length === 0 ? (
            <p style={{ marginTop: 14, fontSize: 13, color: "var(--ink-3)", fontStyle: "italic" }}>
              No transactions in the window yet.
            </p>
          ) : (
            <div style={{ marginTop: 14, display: "flex", alignItems: "flex-end", gap: 6, height: 140 }}>
              {cash.map((c) => (
                <div
                  key={c.weekIso}
                  style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}
                >
                  <span className="num" style={{ fontSize: 9, color: "var(--ink-3)" }}>
                    {fmtUsd(c.netMinor)}
                  </span>
                  <div
                    style={{
                      width: "100%",
                      height: `${(Math.abs(c.netMinor) / cashMaxAbs) * 110}px`,
                      background: c.isFuture ? "var(--amber)" : c.netMinor < 0 ? "var(--steel)" : "var(--ok)",
                      borderRadius: "3px 3px 0 0",
                      opacity: c.isFuture ? 0.7 : 1,
                    }}
                  />
                  <span className="mono" style={{ fontSize: 8, color: "var(--ink-4)" }}>
                    {c.weekLabel}
                  </span>
                </div>
              ))}
            </div>
          )}
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
              <th>Reporting period</th>
              <th>Country</th>
            </tr>
          </thead>
          <tbody>
            {taxTypes.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: "center", color: "var(--ink-3)", padding: "28px 0", fontStyle: "italic" }}>
                  No tax types configured.
                </td>
              </tr>
            ) : (
              taxTypes.map((t) => (
                <tr key={t.typeKey}>
                  <td>{t.displayName}</td>
                  <td className="mono">{t.ratePercentage}%</td>
                  <td style={{ color: "var(--ink-3)" }}>{t.reportingPeriod}</td>
                  <td className="mono">{t.countryCode ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      <h2
        id="shared"
        className="display"
        style={{ fontSize: 24, marginBottom: 14, fontWeight: 500, marginTop: 24 }}
      >
        Shared costs · MTD by category
      </h2>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <table className="data">
          <thead>
            <tr>
              <th>Cost category</th>
              <th>Code</th>
              <th className="num">MTD</th>
            </tr>
          </thead>
          <tbody>
            {sharedCosts.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ textAlign: "center", color: "var(--ink-3)", padding: "28px 0", fontStyle: "italic" }}>
                  No shared-cost categories yet.
                </td>
              </tr>
            ) : (
              sharedCosts.map((s) => (
                <tr key={s.categoryId}>
                  <td>{s.displayName}</td>
                  <td className="mono" style={{ color: "var(--ink-3)" }}>{s.categoryCode}</td>
                  <td className="num">{fmtUsd(s.mtdMinor)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}
