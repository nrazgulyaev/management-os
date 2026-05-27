import Link from "next/link";
import {
  SectionHeading,
  Card,
  HandoffBadge,
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
        eyebrow="QS · variance review queue"
        title={
          <>
            Variance review ·{" "}
            <span className="text-amber">QS sign-off queue.</span>
          </>
        }
        subtitle="Lines crossing 5% drift surface here for QS approval. Per-project BOQ tables live under /development-os/projects/<slug>/boq; import a new revision via the wizard."
        actions={
          <>
            <Link href="/development-os/cabinets/qs/import" className="btn btn-amber btn-sm">
              + Import BOQ
            </Link>
            <Link href="/development-os/boq" className="btn btn-dark btn-sm">
              Open full BOQ
            </Link>
            <Link href="/development-os/boq/quick-entry" className="btn btn-dark btn-sm">
              Quick entry
            </Link>
            <button
              className="btn btn-dark btn-sm opacity-55 cursor-not-allowed"
              disabled
              title="Coming soon"
            >
              Export XLSX ↓
            </button>
            <button
              className="btn btn-dark btn-sm opacity-55 cursor-not-allowed"
              disabled
              title="Coming soon"
            >
              Compare REV
            </button>
            <button
              className="btn btn-amber btn-sm opacity-55 cursor-not-allowed"
              disabled
              title="Coming soon"
            >
              + Change order
            </button>
          </>
        }
      />

      {/* WP rollup strip — live boq_sections subtotal_minor */}
      {wpRollup.length === 0 ? (
        <Card className="p-5 mb-[18px]">
          <p className="text-[13px] text-ink-3 italic m-0">
            No work-package sections yet. Create or import a BOQ to see the
            rollup strip here.
          </p>
        </Card>
      ) : (
        <div
          className="grid gap-0 border border-line rounded-[14px] overflow-hidden mb-[18px]"
          style={{
            gridTemplateColumns: `repeat(${Math.min(wpRollup.length, 6)}, 1fr)`,
          }}
        >
          {wpRollup.slice(0, 6).map((wp, i, arr) => (
            <div
              key={wp.wpCode}
              className={
                "px-[18px] py-4 bg-panel " +
                (i < arr.length - 1 ? "border-r border-line" : "")
              }
            >
              <div className="label text-[10px]">
                {wp.wpCode} · {wp.wpTitle}
              </div>
              <div className="num text-[22px] mt-1 text-ink font-medium">
                {fmtMinor(wp.budgetMinor || wp.baselineMinor, wp.currency)}
              </div>
              <div className="text-[11px] text-ink-3 mt-0.5">
                {wp.itemCount} {wp.itemCount === 1 ? "line" : "lines"} · baseline
                {" "}{fmtMinor(wp.baselineMinor, wp.currency)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* AI anomaly band — empty state until agent_outputs seeded */}
      <Card
        className="corner-marks p-5 mb-[18px] border-amber"
      >
        <div className="flex gap-[18px] items-start">
          <span className="flex-shrink-0 w-10 h-10 rounded-xl bg-[rgba(255,107,53,0.15)] text-amber flex items-center justify-center">
            ✦
          </span>
          <div className="flex-1">
            <div className="label label-amber">qs-cost-analyst</div>
            <p className="mt-1.5 mb-3 text-[14px] text-ink leading-[1.55] max-w-[780px]">
              No cost anomalies detected in the active BOQ. Anomaly runs will
              surface here once the qs-cost-analyst agent files them against
              your baseline.
            </p>
            <div className="flex gap-2">
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
      <Card id="boq" padding="none" overflowHidden className="mb-[18px]">
        <div className="px-[22px] py-3.5 border-b border-line flex items-center">
          <h2 className="display text-[18px] font-medium m-0">
            BOQ · top {boqLines.length === 0 ? "7" : boqLines.length} lines by total
          </h2>
          <Link
            href="/development-os/boq"
            className="btn btn-dark btn-sm ml-auto"
          >
            Filter / full BOQ
          </Link>
        </div>
        {boqLines.length === 0 ? (
          <p className="p-5 text-[13px] text-ink-3 italic">
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
                  <td className="mono text-[11px] text-ink-3">
                    {r.sectionCode}.{r.itemCode}
                  </td>
                  <td className="text-[13px]">{r.description}</td>
                  <td className="num">{fmtQuantity(r.quantity)}</td>
                  <td className="mono text-[11px] text-ink-3">
                    {r.unitOfMeasure}
                  </td>
                  <td className="num">{fmtMinor(r.unitRateMinor, r.currency)}</td>
                  <td className="num text-ink font-medium">
                    {fmtMinor(r.totalMinor, r.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* RFQ matrix — live procurement_quotations */}
      <h2 className="display text-[24px] mb-3.5 font-medium">
        RFQ matrix
      </h2>
      <Card padding="none" overflowHidden>
        {rfqMatrix.length === 0 ? (
          <p className="p-5 text-[13px] text-ink-3 italic">
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
                  <td className="mono text-[11px] text-ink-3">
                    {v.prCode ?? "—"}
                  </td>
                  <td>{v.materialName ?? "—"}</td>
                  <td>{v.vendorName ?? "—"}</td>
                  <td className="num">{fmtMinor(v.totalAmountMinor, v.currency)}</td>
                  <td className="mono text-[12px]">{v.deliveryEta ?? "—"}</td>
                  <td>
                    {v.status === "selected" ? (
                      <HandoffBadge tone="ok">Selected</HandoffBadge>
                    ) : v.status === "under_review" ? (
                      <HandoffBadge tone="warn">Under review</HandoffBadge>
                    ) : (
                      <HandoffBadge>{v.status.replace(/_/g, " ")}</HandoffBadge>
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
