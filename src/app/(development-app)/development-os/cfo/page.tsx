import Link from "next/link";
import {
  Kpi,
  Card,
} from "@/components/dashboard/primitives";
import { safeQuery } from "@/lib/development/safe-query";
import {
  getCfoKpis,
  getPnlByProject,
  getCashStrip6Week,
  getActiveTaxTypes,
  getSharedCostsBreakdown,
  getCapitalWaterfall,
} from "@/lib/development/server/cabinets/cfo-cabinet-queries";
import { WaterfallChart } from "@/components/cfo/waterfall-chart";

/**
 * Dev OS CFO summary cabinet. KPI strip + P&L-by-project + 6-week cash
 * strip + active tax types + shared-cost allocation are all live
 * (getCfoKpis / getPnlByProject / getCashStrip6Week / getActiveTaxTypes /
 * getSharedCostsBreakdown). The capital-waterfall viz is illustrative
 * (no single aggregate query backs it yet).
 *
 * Pixel-redesign (cabinets/dev-p1/cfo.html "Transactions & profit"):
 * page-header brick + 5-up KPI strip + 2-col console grid (P&L ledger /
 * expense-breakdown bars) restyled onto the live data — wiring preserved.
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
  const [kpis, pnl, cash, taxTypes, sharedCosts, waterfall] = await Promise.all([
    safeQuery("devCfoKpis", getCfoKpis(), null),
    safeQuery("devCfoPnl", getPnlByProject(), []),
    safeQuery("devCfoCash", getCashStrip6Week(), []),
    safeQuery("devCfoTax", getActiveTaxTypes(), []),
    safeQuery("devCfoShared", getSharedCostsBreakdown(), []),
    safeQuery("devCfoWaterfall", getCapitalWaterfall(), {
      commitmentsMinor: 0,
      calledToDateMinor: 0,
      landMinor: 0,
      hardMinor: 0,
      softMinor: 0,
      financingMinor: 0,
      salesMinor: 0,
      reservedMinor: 0,
      cashMinor: 0,
    }),
  ]);

  const waterfallRows = [
    { label: "Commitments", usdMinor: waterfall.commitmentsMinor, tone: "accent" as const },
    { label: "Called to date", usdMinor: waterfall.calledToDateMinor, tone: "accent" as const },
    { label: "Land + acquisition", usdMinor: waterfall.landMinor, tone: "ink" as const },
    { label: "Hard costs", usdMinor: waterfall.hardMinor, tone: "ink" as const },
    { label: "Soft costs", usdMinor: waterfall.softMinor, tone: "ink" as const },
    { label: "Financing", usdMinor: waterfall.financingMinor, tone: "ink" as const },
    { label: "Sales + marketing", usdMinor: waterfall.salesMinor, tone: "ink" as const },
    { label: "Reserved (uncalled)", usdMinor: waterfall.reservedMinor, tone: "dashed" as const },
    { label: "Cash on hand", usdMinor: waterfall.cashMinor, tone: "ok" as const },
  ];

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

  // Expense-breakdown bars (mockup "Expense breakdown") sourced from
  // the live shared-cost MTD rows.
  const sharedMax = Math.max(1, ...sharedCosts.map((s) => s.mtdMinor));

  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">Finance · P&amp;L and ledger</div>
          <h1>
            P&amp;L · cash · AR/AP.{" "}
            <span className="text-[var(--amber)]">One source of truth.</span>
          </h1>
          <p className="mt-2 mb-0 text-[15px] text-[var(--ink-3)] max-w-[680px]">
            Tax assistant categorises every transaction, splits VAT, drafts
            journal entries. Closed periods locked. Per-project + roll-up views.
          </p>
        </div>
        <div className="actions">
          <button
            className="btn btn-dark btn-sm opacity-55 cursor-not-allowed"
            disabled
            title="Coming soon"
          >
            Tax pack PDF ↓
          </button>
          <Link
            href="/development-os/finance/transactions/quick-entry"
            className="btn btn-amber btn-sm"
          >
            + Journal entry
          </Link>
        </div>
      </div>

      <div className="cfo-kpis">
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
      <Card padding="default" className="mb-[18px]">
        <div className="cfo-card-head">
          <h3 className="cfo-card-title">Capital waterfall · YTD</h3>
          <span className="label">USD · live</span>
          <span className="actions">
            <Link href="/development-os/cashflow-forecast" className="btn btn-secondary btn-sm">
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
        <WaterfallChart rows={waterfallRows} />
      </Card>

      <div className="cfo-grid">
        <Card padding="default">
          <h3 className="cfo-card-title">P&amp;L · YTD by project</h3>
          <div className="label">USD · cost basis</div>
          <table className="data mt-[14px]">
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
                  <td colSpan={5} className="cfo-table-empty">
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
                      <td className="num cfo-amt-out">{fmtUsd(r.totalMinor)}</td>
                    </tr>
                  ))}
                  <tr className="cfo-row-total">
                    <td>Portfolio</td>
                    <td className="num">{fmtUsd(pnlTotal.hard)}</td>
                    <td className="num">{fmtUsd(pnlTotal.soft)}</td>
                    <td className="num">{fmtUsd(pnlTotal.fin)}</td>
                    <td className="num cfo-total-accent">{fmtUsd(pnlTotal.total)}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </Card>

        <Card padding="default">
          <h3 className="cfo-card-title">Net cash flow · 6 weeks</h3>
          <div className="label">USD · weekly inflow − outflow</div>
          {cash.length === 0 ? (
            <p className="mt-[14px] text-[13px] text-[var(--ink-3)] italic">
              No transactions in the window yet.
            </p>
          ) : (
            <div className="cfo-cashstrip">
              {cash.map((c) => (
                <div key={c.weekIso} className="col">
                  <span className="net">{fmtUsd(c.netMinor)}</span>
                  <div
                    className={
                      "bar " +
                      (c.isFuture
                        ? "future"
                        : c.netMinor < 0
                        ? "past-neg"
                        : "past-pos")
                    }
                    style={{ height: `${(Math.abs(c.netMinor) / cashMaxAbs) * 110}px` }}
                  />
                  <span className="wk">{c.weekLabel}</span>
                </div>
              ))}
            </div>
          )}

          <div className="cfo-bar-summary">
            <div className="cfo-card-sub mb-[10px]">Expense breakdown · MTD</div>
            {sharedCosts.length === 0 ? (
              <p className="cfo-card-sub">No shared-cost categories yet.</p>
            ) : (
              sharedCosts.map((s) => (
                <div className="cfo-bar" key={s.categoryId}>
                  <span className="cfo-bar-label">{s.displayName}</span>
                  <div className="track">
                    <div
                      className="fill"
                      style={{ width: `${(s.mtdMinor / sharedMax) * 100}%` }}
                    />
                  </div>
                  <span className="val">{fmtUsd(s.mtdMinor)}</span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <h2 id="tax" className="display text-[24px] mb-[14px] font-medium">
        Tax types · auto-categorised by AI
      </h2>
      <Card padding="none" overflowHidden className="mb-[18px]">
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
                <td colSpan={4} className="cfo-table-empty">
                  No tax types configured.
                </td>
              </tr>
            ) : (
              taxTypes.map((t) => (
                <tr key={t.typeKey}>
                  <td>{t.displayName}</td>
                  <td className="mono">{t.ratePercentage}%</td>
                  <td className="text-[var(--ink-3)]">{t.reportingPeriod}</td>
                  <td className="mono">{t.countryCode ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      <h2 id="shared" className="display text-[24px] mb-[14px] mt-6 font-medium">
        Shared costs · MTD by category
      </h2>
      <Card padding="none" overflowHidden>
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
                <td colSpan={3} className="cfo-table-empty">
                  No shared-cost categories yet.
                </td>
              </tr>
            ) : (
              sharedCosts.map((s) => (
                <tr key={s.categoryId}>
                  <td>{s.displayName}</td>
                  <td className="mono text-[var(--ink-3)]">{s.categoryCode}</td>
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
