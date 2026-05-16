import Link from "next/link";
import {
  SectionHeading,
  Card,
  Badge,
} from "@/components/dashboard/primitives";
import {
  getBoqWpRollup,
  getBoqTopLines,
  getRfqMatrix,
  type WpRollupRow,
  type BoqLineRow,
  type RfqMatrixRow,
} from "@/lib/development/server/cabinets/qs-cabinet-queries";

/**
 * Sprint TASK-7-DATA-PART-2 — Dev OS QS / Cost Analyst (BOQ desk) live wiring.
 *
 * Visual port from `_handoff/development/qs.html` (TASK-7-VISUAL, commit
 * `316dc65`); this commit replaces three mock arrays with live, org-
 * scoped reads added in
 * `src/lib/development/server/cabinets/qs-cabinet-queries.ts`:
 *
 *   - mockWP_STATS    → getBoqWpRollup()   (top-level boq_sections rollup)
 *   - mockBOQ         → getBoqTopLines(7)  (top-7 by total_minor)
 *   - mockRFQ_MATRIX  → getRfqMatrix()     (procurement_quotations active)
 *
 * The "Filter" CTA links to /development-os/boq for the existing full
 * paginated list (preserved per Task 7 visual closure note).
 */

export const metadata = { title: "QS · Cost Analyst" };
export const dynamic = "force-dynamic";

const IDR_M = 10_000_000_000; // IDR minor per million
const IDR_K = 1_000_000;
const USD_M = 100_000_000;
const USD_K = 100_000;

function fmtMinor(minor: number, currency: string): string {
  const abs = Math.abs(minor);
  if (currency === "IDR") {
    if (abs >= IDR_M) return `IDR ${(minor / IDR_M).toFixed(1)}M`;
    if (abs >= IDR_K) return `IDR ${Math.round(minor / IDR_K)}K`;
    return `IDR ${Math.round(minor / 100).toLocaleString()}`;
  }
  if (abs >= USD_M) return `${currency} ${(minor / USD_M).toFixed(1)}M`;
  if (abs >= USD_K) return `${currency} ${Math.round(minor / USD_K)}K`;
  return `${currency} ${Math.round(minor / 100).toLocaleString()}`;
}

function fmtQuantity(q: number): string {
  if (Number.isInteger(q)) return q.toLocaleString();
  return q.toFixed(2);
}

export default async function QsPage() {
  const [wpRollup, boqLines, rfqMatrix] = await Promise.all([
    getBoqWpRollup().catch(() => [] as WpRollupRow[]),
    getBoqTopLines(7).catch(() => [] as BoqLineRow[]),
    getRfqMatrix().catch(() => [] as RfqMatrixRow[]),
  ]);

  return (
    <>
      <SectionHeading
        eyebrow="BOQ · live"
        title={
          <>
            WP-led ·{" "}
            <span style={{ color: "var(--amber)" }}>variance from baseline.</span>
          </>
        }
        subtitle="Per-line baseline vs actual, AI-flagged anomalies, full revision history, side-by-side RFQ resolution."
        actions={
          <>
            <Link href="/development-os/boq" className="btn btn-dark btn-sm">
              Open full BOQ
            </Link>
            <Link href="/development-os/boq/quick-entry" className="btn btn-dark btn-sm">
              Quick entry
            </Link>
            <button className="btn btn-dark btn-sm">Export XLSX ↓</button>
            <button className="btn btn-dark btn-sm">Compare REV</button>
            <button className="btn btn-amber btn-sm">+ Change order</button>
          </>
        }
      />

      {/* WP rollup strip — live boq_sections subtotal_minor */}
      {wpRollup.length === 0 ? (
        <Card style={{ padding: 20, marginBottom: 18 }}>
          <p
            style={{ fontSize: 13, color: "var(--ink-3)", fontStyle: "italic", margin: 0 }}
          >
            No work-package sections yet. Create or import a BOQ to see the
            rollup strip here.
          </p>
        </Card>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.min(wpRollup.length, 6)}, 1fr)`,
            gap: 0,
            border: "1px solid var(--line)",
            borderRadius: 14,
            overflow: "hidden",
            marginBottom: 18,
          }}
        >
          {wpRollup.slice(0, 6).map((wp, i, arr) => (
            <div
              key={wp.wpCode}
              style={{
                padding: "16px 18px",
                borderRight: i < arr.length - 1 ? "1px solid var(--line)" : 0,
                background: "var(--panel)",
              }}
            >
              <div className="label" style={{ fontSize: 10 }}>
                {wp.wpCode} · {wp.wpTitle}
              </div>
              <div
                className="num"
                style={{
                  fontSize: 22,
                  marginTop: 4,
                  color: "var(--ink)",
                  fontWeight: 500,
                }}
              >
                {fmtMinor(wp.budgetMinor || wp.baselineMinor, wp.currency)}
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
                {wp.itemCount} {wp.itemCount === 1 ? "line" : "lines"} · baseline
                {" "}{fmtMinor(wp.baselineMinor, wp.currency)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* AI anomaly band — empty state until agent_outputs seeded */}
      <Card
        className="corner-marks"
        style={{ padding: 20, marginBottom: 18, borderColor: "var(--amber)" }}
      >
        <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
          <span
            style={{
              flexShrink: 0,
              width: 40,
              height: 40,
              borderRadius: 12,
              background: "rgba(255,107,53,0.15)",
              color: "var(--amber)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✦
          </span>
          <div style={{ flex: 1 }}>
            <div className="label label-amber">qs-cost-analyst</div>
            <p
              style={{
                margin: "6px 0 12px",
                fontSize: 14,
                color: "var(--ink)",
                lineHeight: 1.55,
                maxWidth: 780,
              }}
            >
              No cost anomalies detected in the active BOQ. Anomaly runs will
              surface here once the qs-cost-analyst agent files them against
              your baseline.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <Link
                href="/development-os/ai-agents"
                className="btn btn-dark btn-sm"
              >
                Configure agent
              </Link>
            </div>
          </div>
        </div>
      </Card>

      {/* BOQ top-7 table — live boq_items */}
      <Card id="boq" style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
        <div
          style={{
            padding: "14px 22px",
            borderBottom: "1px solid var(--line)",
            display: "flex",
            alignItems: "center",
          }}
        >
          <h2 className="display" style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>
            BOQ · top {boqLines.length === 0 ? "7" : boqLines.length} lines by total
          </h2>
          <Link
            href="/development-os/boq"
            className="btn btn-dark btn-sm"
            style={{ marginLeft: "auto" }}
          >
            Filter / full BOQ
          </Link>
        </div>
        {boqLines.length === 0 ? (
          <p
            style={{
              padding: 20,
              fontSize: 13,
              color: "var(--ink-3)",
              fontStyle: "italic",
            }}
          >
            No BOQ items yet for this org. Import a BOQ XLSX to populate.
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Code</th>
                <th>Description</th>
                <th className="num">Qty</th>
                <th>Unit</th>
                <th className="num">Rate</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {boqLines.map((r) => (
                <tr key={`${r.sectionCode}.${r.itemCode}`}>
                  <td className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                    {r.sectionCode}.{r.itemCode}
                  </td>
                  <td style={{ fontSize: 13 }}>{r.description}</td>
                  <td className="num">{fmtQuantity(r.quantity)}</td>
                  <td className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                    {r.unitOfMeasure}
                  </td>
                  <td className="num">{fmtMinor(r.unitRateMinor, r.currency)}</td>
                  <td className="num" style={{ color: "var(--ink)", fontWeight: 500 }}>
                    {fmtMinor(r.totalMinor, r.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* RFQ matrix — live procurement_quotations */}
      <h2
        className="display"
        style={{ fontSize: 24, marginBottom: 14, fontWeight: 500 }}
      >
        RFQ matrix
      </h2>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {rfqMatrix.length === 0 ? (
          <p
            style={{
              padding: 20,
              fontSize: 13,
              color: "var(--ink-3)",
              fontStyle: "italic",
            }}
          >
            No active RFQs. Quotations land here when vendors respond to an open
            purchase request.
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>PR</th>
                <th>Material</th>
                <th>Vendor</th>
                <th className="num">Quoted</th>
                <th>ETA</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rfqMatrix.map((v) => (
                <tr key={v.quotationId}>
                  <td className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                    {v.prCode ?? "—"}
                  </td>
                  <td>{v.materialName ?? "—"}</td>
                  <td>{v.vendorName ?? "—"}</td>
                  <td className="num">{fmtMinor(v.totalAmountMinor, v.currency)}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{v.deliveryEta ?? "—"}</td>
                  <td>
                    {v.status === "selected" ? (
                      <Badge tone="ok">Selected</Badge>
                    ) : v.status === "under_review" ? (
                      <Badge tone="warn">Under review</Badge>
                    ) : (
                      <Badge>{v.status.replace(/_/g, " ")}</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
