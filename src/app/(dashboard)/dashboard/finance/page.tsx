import Link from "next/link";
import {
  Kpi,
  SectionHeading,
  Card,
  Badge,
} from "@/components/dashboard/primitives";
import {
  getFinanceKpis,
  getDemoStatementPreview,
  listStatementsPreview,
  getPayoutsQueue,
  buildWaterfall,
  getMaterialUsageBridgeNudge,
  type StatementLineSection,
} from "@/features/finance/finance-cabinet-queries";

/**
 * Sprint TASK-6-DATA-PART-2 — Mgmt OS Finance cabinet live wiring.
 *
 * Replaces five mock arrays with live reads in
 * `src/features/finance/finance-cabinet-queries.ts`:
 *
 *   - STMT_LINES        → getDemoStatementPreview().lines
 *   - STMT_LIST         → listStatementsPreview()
 *   - PAYMENTS          → getPayoutsQueue() (empty — payouts generate from approved statements)
 *   - WATERFALL         → buildWaterfall(preview)
 *   - bridge nudge      → getMaterialUsageBridgeNudge() (empty — no consumption events)
 *
 * The "Statement detail" Card renders a DECORATIVE computed preview
 * synthesized from real seeded bookings × ownership shares. Real
 * statement generation (PDF, hash, approval workflow, auto-send to
 * owner portal) is the STATEMENT-1 sprint. The cabinet flags this
 * with an explicit "PREVIEW" badge so the operator doesn't mistake
 * computed numbers for signed statements.
 */

export const metadata = { title: "Finance · Owner statements" };
export const dynamic = "force-dynamic";

const IDR_BILLION_MINOR = 1_000_000_000_00;
const IDR_MILLION_MINOR = 1_000_000_00;
const IDR_K_MINOR = 1_000_00;

function fmtIdr(minor: bigint): string {
  const abs = minor < 0n ? -minor : minor;
  const sign = minor < 0n ? "−" : "";
  if (abs >= BigInt(IDR_BILLION_MINOR)) {
    return `${sign}IDR ${(Number(abs) / IDR_BILLION_MINOR).toFixed(2)}B`;
  }
  if (abs >= BigInt(IDR_MILLION_MINOR)) {
    return `${sign}IDR ${(Number(abs) / IDR_MILLION_MINOR).toFixed(1)}M`;
  }
  return `${sign}IDR ${Math.round(Number(abs) / IDR_K_MINOR)}K`;
}

function signedIdr(minor: bigint): string {
  const sign = minor >= 0n ? "+" : "−";
  const abs = minor < 0n ? -minor : minor;
  const v = Number(abs) / IDR_MILLION_MINOR;
  if (v >= 1) return `${sign}IDR ${v.toFixed(1)}M`;
  return `${sign}IDR ${Math.round(Number(abs) / IDR_K_MINOR)}K`;
}

const SECTION_LABEL: Record<StatementLineSection, string> = {
  revenue: "revenue",
  fees: "fees",
  taxes: "taxes",
  expenses: "expenses",
  net: "net",
};

export default async function FinancePage() {
  const [kpis, preview, statementList, payouts, bridge] = await Promise.all([
    getFinanceKpis().catch(() => null),
    getDemoStatementPreview().catch(() => null),
    listStatementsPreview(8).catch(() => []),
    getPayoutsQueue().catch(() => []),
    getMaterialUsageBridgeNudge().catch(() => null),
  ]);

  const waterfall = buildWaterfall(preview);
  const revenueLineCount = preview?.lines.filter((l) => l.section === "revenue").length ?? 0;
  const feeLineCount = preview?.lines.filter((l) => l.section === "fees").length ?? 0;
  const taxLineCount = preview?.lines.filter((l) => l.section === "taxes").length ?? 0;
  const expenseLineCount = preview?.lines.filter((l) => l.section === "expenses").length ?? 0;
  const grossTotal = preview?.lines
    .filter((l) => l.section === "revenue")
    .reduce((s, l) => s + l.amountIdrMinor, 0n) ?? 0n;
  const feesTotal = preview?.lines
    .filter((l) => l.section === "fees")
    .reduce((s, l) => s + l.amountIdrMinor, 0n) ?? 0n;
  const taxesTotal = preview?.lines
    .filter((l) => l.section === "taxes")
    .reduce((s, l) => s + l.amountIdrMinor, 0n) ?? 0n;
  const expensesTotal = preview?.lines
    .filter((l) => l.section === "expenses")
    .reduce((s, l) => s + l.amountIdrMinor, 0n) ?? 0n;

  return (
    <>
      <SectionHeading
        eyebrow={
          preview
            ? `Finance · ${preview.monthLabel} · PREVIEW (STATEMENT-1 will sign real statements)`
            : "Finance · no statements yet"
        }
        title={
          preview ? (
            <>
              {preview.ownerName} ·{" "}
              <em style={{ color: "var(--terra)", fontStyle: "italic" }}>
                {preview.villaCode}
              </em>{" "}
              · {preview.monthLabel}
            </>
          ) : (
            <>No statements yet.</>
          )
        }
        subtitle={
          preview
            ? `Computed preview from ${preview.bookingsCount} ${preview.bookingsCount === 1 ? "booking" : "bookings"} · ${preview.totalNights} nights. Real statements (hash-signed, PDF, auto-send) land in the STATEMENT-1 sprint.`
            : "Once bookings land for a given owner × villa × month, a statement preview surfaces here. Real generation, sign-off, and payout workflow are tracked under STATEMENT-1."
        }
        actions={
          <>
            <button className="btn btn-secondary btn-sm" disabled>Statement PDF ↓</button>
            <button className="btn btn-secondary btn-sm" disabled>Sign + queue payout</button>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 18 }}>
        <Kpi
          label="Gross revenue"
          value={preview ? fmtIdr(grossTotal) : "—"}
          sub={preview ? `${revenueLineCount} line${revenueLineCount === 1 ? "" : "s"}` : "no bookings"}
        />
        <Kpi
          label="Channel + mgmt fees"
          value={preview ? fmtIdr(feesTotal) : "—"}
          sub={preview ? `${feeLineCount} lines` : "—"}
        />
        <Kpi
          label="Taxes"
          value={preview ? fmtIdr(taxesTotal) : "—"}
          sub="PB1 + VAT (decorative %)"
        />
        <Kpi
          label="Direct opex"
          value={preview ? fmtIdr(expensesTotal) : "—"}
          sub="proportional · STATEMENT-1 will split"
        />
        <Kpi
          label="Net to owner"
          value={preview ? fmtIdr(preview.netToOwnerIdrMinor) : "—"}
          sub={kpis ? `${kpis.statementsPendingCount} statements pending` : ""}
          tone={preview ? "accent" : undefined}
        />
      </div>

      {/* Statement detail — DECORATIVE preview */}
      <Card id="statements" style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
        <div style={{ padding: "16px 22px", display: "flex", alignItems: "flex-start", borderBottom: "1px solid var(--line-soft)" }}>
          <div>
            <div className="label">Statement preview</div>
            <h2 style={{ margin: "6px 0 0", fontFamily: "var(--font-newsreader), serif", fontSize: 24 }}>
              {preview ? `${preview.villaCode} · ${preview.monthLabel}` : "—"}
            </h2>
            <div className="mono" style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 4 }}>
              {preview
                ? `${preview.lines.length} lines · computed from bookings × commission · IDR`
                : "no data — bookings + ownership_shares empty"}
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <Badge tone="warn">PREVIEW · not signed</Badge>
            <span className="mono" style={{ fontSize: 10, color: "var(--ink-4)" }}>
              Real signing flow → STATEMENT-1
            </span>
          </div>
        </div>

        {preview ? (
          <table className="data">
            <thead>
              <tr>
                <th>Section</th>
                <th>Line item</th>
                <th>Notes</th>
                <th className="num">Amount (IDR)</th>
              </tr>
            </thead>
            <tbody>
              {preview.lines
                .filter((l) => l.section !== "net")
                .map((r, i) => (
                  <tr key={`${r.section}-${i}`}>
                    <td>
                      <Badge>{SECTION_LABEL[r.section]}</Badge>
                    </td>
                    <td style={{ fontWeight: 500 }}>{r.label}</td>
                    <td className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                      {r.hint}
                    </td>
                    <td
                      className="num"
                      style={{ color: r.amountIdrMinor >= 0n ? "var(--ok)" : "var(--ink-2)" }}
                    >
                      {signedIdr(r.amountIdrMinor)}
                    </td>
                  </tr>
                ))}
              <tr style={{ borderTop: "2px solid var(--ink)", background: "var(--cream-warm)" }}>
                <td
                  colSpan={2}
                  style={{
                    padding: "16px 14px",
                    fontFamily: "var(--font-newsreader), serif",
                    fontSize: 22,
                    fontWeight: 400,
                  }}
                >
                  Net to owner · {preview.monthLabel}
                </td>
                <td className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                  preview only
                </td>
                <td className="num" style={{ padding: "16px 14px", fontSize: 24, color: "var(--terra)" }}>
                  {fmtIdr(preview.netToOwnerIdrMinor)}
                </td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p style={{ padding: 20, fontSize: 13, color: "var(--ink-3)", fontStyle: "italic", margin: 0 }}>
            No bookings linked to an owner share yet. Seed bookings + ownership_shares to see a preview.
          </p>
        )}
      </Card>

      {/* Transparency + waterfall */}
      <h2
        id="transparency"
        className="display"
        style={{ fontSize: 30, marginTop: 32, marginBottom: 14, fontWeight: 400 }}
      >
        Distribution{" "}
        <em style={{ color: "var(--terra)", fontStyle: "italic" }}>waterfall</em>
      </h2>
      <Card style={{ padding: 20, marginBottom: 18 }}>
        {waterfall.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--ink-3)", fontStyle: "italic", margin: 0 }}>
            Waterfall renders once a statement preview is available.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {waterfall.map((b, i) => {
              const isNet = i === waterfall.length - 1;
              return (
                <div key={b.label}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 12,
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        color: isNet ? "var(--terra)" : "var(--ink-2)",
                        fontWeight: isNet ? 500 : 400,
                      }}
                    >
                      {b.label}
                    </span>
                    <span className="num">{b.pct.toFixed(1)}%</span>
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
                        width: `${Math.min(b.pct, 100)}%`,
                        background: isNet ? "var(--terra)" : "var(--ink-2)",
                        borderRadius: 999,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* All statements list */}
      <h2
        className="display"
        style={{ fontSize: 30, marginTop: 32, marginBottom: 14, fontWeight: 400 }}
      >
        All statements ·{" "}
        <em style={{ color: "var(--terra)", fontStyle: "italic" }}>last 6 months</em>
      </h2>
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
        {statementList.length === 0 ? (
          <p style={{ padding: 20, fontSize: 13, color: "var(--ink-3)", fontStyle: "italic", margin: 0 }}>
            No statements (real or preview) yet.
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Owner</th>
                <th>Villa</th>
                <th>Period</th>
                <th className="num">Net (IDR)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {statementList.map((s) => (
                <tr key={s.id}>
                  <td>{s.ownerName}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{s.villaCode}</td>
                  <td style={{ fontFamily: "var(--font-newsreader), serif", fontSize: 14 }}>
                    {s.monthLabel}
                  </td>
                  <td className="num" style={{ color: "var(--terra)", fontWeight: 500 }}>
                    {fmtIdr(s.netIdrMinor)}
                  </td>
                  <td>
                    <Badge tone="warn">PREVIEW</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Payouts queue */}
      <h2
        id="payments"
        className="display"
        style={{ fontSize: 30, marginTop: 32, marginBottom: 14, fontWeight: 400 }}
      >
        Payouts{" "}
        <em style={{ color: "var(--terra)", fontStyle: "italic" }}>queued</em>
      </h2>
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
        {payouts.length === 0 ? (
          <p style={{ padding: 20, fontSize: 13, color: "var(--ink-3)", fontStyle: "italic", margin: 0 }}>
            No payouts queued. Payouts populate once statements are approved
            (STATEMENT-1 sprint).
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Recipient</th>
                <th className="num">Amount</th>
                <th>Rail</th>
                <th>Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id}>
                  <td>{p.ownerName}</td>
                  <td className="num">{fmtIdr(p.amountIdrMinor)}</td>
                  <td style={{ color: "var(--ink-3)" }}>{p.method}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{p.scheduledFor}</td>
                  <td>
                    <Badge tone={p.status === "settled" ? "ok" : "gold"}>{p.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Material-usage bridge nudge */}
      {bridge ? (
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
                width: 36,
                height: 36,
                borderRadius: 999,
                background: "rgba(196,88,60,0.12)",
                color: "var(--terra)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              ⚡
            </span>
            <div style={{ flex: 1 }}>
              <div className="label" style={{ color: "var(--terra)" }}>
                Material usage bridge · {bridge.consumedBookingsCount} entries
              </div>
              <h3
                style={{
                  margin: "4px 0 8px",
                  fontFamily: "var(--font-newsreader), serif",
                  fontSize: 20,
                  fontWeight: 400,
                }}
              >
                Inventory consumption ready to post to statements
              </h3>
              <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--ink-2)" }}>
                {bridge.consumedBookingsCount} items consumed totaling{" "}
                <strong>{fmtIdr(bridge.pendingValueIdrMinor)}</strong>. Will materialise as
                expense lines on next bridge run.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <Link href="/dashboard/operations" className="btn btn-terra btn-sm">
                  Open operations →
                </Link>
              </div>
            </div>
          </div>
        </Card>
      ) : null}
    </>
  );
}
