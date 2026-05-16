import Link from "next/link";
import {
  Kpi,
  SectionHeading,
  Card,
  Badge,
} from "@/components/dashboard/primitives";
import {
  getCfoKpis,
  getPnlByProject,
  getCashStrip6Week,
  getActiveTaxTypes,
  getSharedCostsBreakdown,
  type CashStripPoint,
  type PnlByProjectRow,
} from "@/lib/development/server/cabinets/cfo-cabinet-queries";

/**
 * Sprint _handoff/ Task 7 → TASK-7-DATA-PART-1 — Dev OS CFO / Accountant.
 *
 * Visual port from `_handoff/development/cfo.html` (TASK-7-VISUAL,
 * commit `316dc65`); this commit wires the five mock arrays to live
 * org-scoped reads added in
 * `src/lib/development/server/cabinets/cfo-cabinet-queries.ts`:
 *
 *   - mockKPIS              → getCfoKpis()
 *   - mockPNL_ROWS          → getPnlByProject()
 *   - mockCASH_BARS         → getCashStrip6Week()
 *   - mockTAX_TYPES         → getActiveTaxTypes()
 *   - mockSHARED_COSTS      → getSharedCostsBreakdown()
 *
 * Empty-state contract: every section degrades gracefully when its
 * query returns []. The KPI strip shows "—" for missing values
 * instead of alarming zeros. Tables collapse to one empty-state row.
 *
 * CRITICAL — operator's bookkeeper daily flow is unchanged:
 *   - "📸 Snap receipt", "Quick entry", "All transactions" CTAs in
 *     the SectionHeading actions slot still link to the dedicated
 *     `/development-os/finance/transactions/*` routes that own the
 *     HF-7 duplicate fix, HF-8 receipt body-size + compression, and
 *     AI-ACTIVATION-1 OCR. The cabinet page is dashboard-only — does
 *     not embed those widgets.
 */

export const metadata = { title: "CFO · Accountant" };
export const dynamic = "force-dynamic";

const USD_MINOR_PER_K = 100_000;
const USD_MINOR_PER_M = 100_000_000;

/** USD-minor → "$1.2M" / "$184K" / "$612" (compact). */
function usdCompact(minor: number | null | undefined): string {
  if (minor == null || !Number.isFinite(minor)) return "—";
  const abs = Math.abs(minor);
  if (abs >= USD_MINOR_PER_M) return `$${(minor / USD_MINOR_PER_M).toFixed(1)}M`;
  if (abs >= USD_MINOR_PER_K) return `$${Math.round(minor / USD_MINOR_PER_K)}K`;
  if (abs === 0) return "$0";
  return `$${Math.round(minor / 100).toLocaleString()}`;
}

function pnlTotalsLabel(rows: PnlByProjectRow[]) {
  const sum = (key: "hardCostMinor" | "softCostMinor" | "financingMinor") =>
    rows.reduce((s, r) => s + r[key], 0);
  return {
    hard: usdCompact(sum("hardCostMinor")),
    soft: usdCompact(sum("softCostMinor")),
    fin: usdCompact(sum("financingMinor")),
    total: usdCompact(rows.reduce((s, r) => s + r.totalMinor, 0)),
  };
}

/** Cash-strip render helper: pick a sensible per-bar scale from the
 *  largest absolute net. */
function cashBarScale(points: CashStripPoint[]): number {
  if (points.length === 0) return 1;
  const max = Math.max(...points.map((p) => Math.abs(p.netMinor)));
  return max === 0 ? 1 : max;
}

export default async function CfoAccountantPage() {
  const [kpis, pnl, cashStrip, taxTypes, shared] = await Promise.all([
    getCfoKpis().catch(() => null),
    getPnlByProject().catch(() => []),
    getCashStrip6Week().catch(() => []),
    getActiveTaxTypes().catch(() => []),
    getSharedCostsBreakdown().catch(() => []),
  ]);

  const pnlTotals = pnlTotalsLabel(pnl);
  const cashScale = cashBarScale(cashStrip);
  const sharedColCount = pnl.length;

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
                dedicated routes (HF-7/HF-8/AI-ACTIVATION-1). */}
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
        <Kpi
          label="Cash on hand"
          value={usdCompact(kpis?.cashOnHandMinor)}
          sub={kpis ? "across all bank accounts" : "no snapshot yet"}
          tone={kpis && kpis.cashOnHandMinor > 0 ? "success" : undefined}
        />
        <Kpi
          label="AR · open"
          value={usdCompact(kpis?.receivablesMinor)}
          sub={kpis ? "from buyer + investor invoices" : "—"}
          tone="accent"
        />
        <Kpi
          label="AP · open"
          value={usdCompact(kpis?.payablesNext30Minor)}
          sub={kpis ? "due in next 30 days" : "—"}
        />
        <Kpi
          label="MTD spend"
          value={usdCompact(kpis?.spendMtdMinor)}
          sub={kpis ? "month-to-date outflow" : "—"}
        />
        <Kpi
          label="Trailing 30d burn"
          value={usdCompact(kpis?.forecastBurn30dMinor)}
          sub={kpis ? "outflow last 30 days" : "—"}
          tone={kpis && kpis.forecastBurn30dMinor > 0 ? "success" : undefined}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14, marginBottom: 18 }}>
        <Card style={{ padding: 20 }}>
          <h3 className="display" style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>
            P&L · YTD by project
          </h3>
          <div className="label" style={{ marginTop: 4 }}>USD · cost basis</div>
          {pnl.length === 0 ? (
            <p
              style={{
                marginTop: 16,
                fontSize: 13,
                color: "var(--ink-3)",
                fontStyle: "italic",
              }}
            >
              No project transactions yet — categorise expenses against a
              project to see this roll up.
            </p>
          ) : (
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
                {pnl.map((r) => (
                  <tr key={r.projectId}>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span className="mono" style={{ fontSize: 12 }}>{r.projectCode}</span>
                        <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{r.projectName}</span>
                      </div>
                    </td>
                    <td className="num">{usdCompact(r.hardCostMinor)}</td>
                    <td className="num">{usdCompact(r.softCostMinor)}</td>
                    <td className="num">{usdCompact(r.financingMinor)}</td>
                    <td className="num" style={{ color: "var(--ink)", fontWeight: 500 }}>
                      {usdCompact(r.totalMinor)}
                    </td>
                  </tr>
                ))}
                <tr style={{ background: "var(--bg-2)", fontWeight: 500 }}>
                  <td>Portfolio</td>
                  <td className="num">{pnlTotals.hard}</td>
                  <td className="num">{pnlTotals.soft}</td>
                  <td className="num">{pnlTotals.fin}</td>
                  <td className="num" style={{ color: "var(--amber)" }}>{pnlTotals.total}</td>
                </tr>
              </tbody>
            </table>
          )}
        </Card>

        <Card style={{ padding: 20 }}>
          <h3 className="display" style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>
            Cash position · 8 weeks
          </h3>
          {cashStrip.length === 0 ? (
            <p
              style={{
                marginTop: 16,
                fontSize: 13,
                color: "var(--ink-3)",
                fontStyle: "italic",
              }}
            >
              No transactions in the trailing 8-week window yet — quick-entry
              one to populate this strip.
            </p>
          ) : (
            <>
              <div
                style={{
                  marginTop: 14,
                  display: "flex",
                  alignItems: "flex-end",
                  gap: 6,
                  height: 140,
                }}
              >
                {cashStrip.map((p) => {
                  const heightPx = Math.max(
                    4,
                    Math.round((Math.abs(p.netMinor) / cashScale) * 120),
                  );
                  const negative = p.netMinor < 0;
                  return (
                    <div
                      key={p.weekIso}
                      style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      <span className="num" style={{ fontSize: 9, color: "var(--ink-3)" }}>
                        {usdCompact(p.netMinor)}
                      </span>
                      <div
                        style={{
                          width: "100%",
                          height: `${heightPx}px`,
                          background: negative
                            ? "var(--danger, var(--amber))"
                            : p.isFuture
                              ? "var(--amber)"
                              : "var(--steel)",
                          borderRadius: "3px 3px 0 0",
                          opacity: p.isFuture ? 0.7 : 1,
                        }}
                      />
                      <span className="mono" style={{ fontSize: 8, color: "var(--ink-4)" }}>
                        {p.weekLabel}
                      </span>
                    </div>
                  );
                })}
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
                Bars show net (inflow − outflow) USD by ISO week. Steel = past,
                amber = recent. Cash forecasting wires in TASK-7-DATA-PART-2.
              </div>
            </>
          )}
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
        {taxTypes.length === 0 ? (
          <p
            style={{
              padding: 20,
              fontSize: 13,
              color: "var(--ink-3)",
              fontStyle: "italic",
            }}
          >
            No active tax types configured. Seed PPN / PPh 21 / PPh 23 / PBB
            via the tax-types admin route.
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Type</th>
                <th>Rate</th>
                <th>Country</th>
                <th>Reporting</th>
              </tr>
            </thead>
            <tbody>
              {taxTypes.map((t) => (
                <tr key={t.typeKey}>
                  <td>{t.displayName}</td>
                  <td className="mono">{Number(t.ratePercentage).toFixed(2)}%</td>
                  <td className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                    {t.countryCode ?? "—"}
                  </td>
                  <td>
                    <Badge>{t.reportingPeriod}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <h2
        id="shared"
        className="display"
        style={{ fontSize: 24, marginBottom: 14, fontWeight: 500, marginTop: 24 }}
      >
        Shared costs · allocation
      </h2>
      <Card style={{ padding: 20 }}>
        {shared.length === 0 ? (
          <p
            style={{
              fontSize: 13,
              color: "var(--ink-3)",
              fontStyle: "italic",
              margin: 0,
            }}
          >
            No company-overhead cost categories yet — flag a category with
            type <span className="mono">corporate_event</span> to surface it
            here.
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Cost category</th>
                <th className="num">MTD spend</th>
                <th>Allocation rule</th>
                {pnl.map((p) => (
                  <th key={p.projectId}>{p.projectCode}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shared.map((s) => (
                <tr key={s.categoryId}>
                  <td>{s.displayName}</td>
                  <td className="num">{usdCompact(s.mtdMinor)}</td>
                  <td className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                    pending rule engine
                  </td>
                  {Array.from({ length: sharedColCount }).map((_, i) => (
                    <td key={i} className="num" style={{ color: "var(--ink-4)" }}>
                      —
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p
          className="mono"
          style={{
            marginTop: 12,
            fontSize: 10,
            color: "var(--ink-4)",
            letterSpacing: "0.08em",
          }}
        >
          ALLOCATION RULES SHIP IN TASK-7-DATA-PART-2
        </p>
      </Card>
    </>
  );
}
