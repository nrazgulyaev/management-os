import Link from "next/link";
import {
  Kpi,
  SectionHeading,
  Card,
  HandoffBadge,
} from "@/components/dashboard/primitives";
import {
  listOpenPurchaseRequests,
  listPosInTransit,
  listInvoicesAwaitingApproval,
  type ProcurementPrRow,
  type ProcurementPoRow,
  type ProcurementInvoiceRow,
} from "@/lib/development/server/cabinets/procurement-cabinet-queries";
import {
  loadProcurementAnalystBand,
  type ProcurementAnalystOutput,
} from "./_procurement-analyst-band";
import { listQuotationComparisons } from "@/lib/development/server/procurement/quotation-comparison-queries";

/**
 * Sprint _handoff/ Task 7 → TASK-7-DATA-PART-1 — Procurement Manager.
 *
 * Visual port from `_handoff/development/procurement.html` (commit
 * `316dc65`); this commit wires three view-shaped reads added in
 * `src/lib/development/server/cabinets/procurement-cabinet-queries.ts`:
 *
 *   - mockOPEN_PRS         → listOpenPurchaseRequests()
 *   - mockPOS_IN_TRANSIT   → listPosInTransit()
 *   - mockINVOICES         → listInvoicesAwaitingApproval()
 *   - mockKPIs             → computed live from the three reads
 *
 * Per DEMO-1: purchase_requests / POs / invoices were not seeded for
 * the Arconique org. All three queries return [] in production today.
 * Per TASK-7-DATA-PART-1 §3, the cabinet renders friendly empty
 * states + first-action CTAs instead of "0% / $0 / 0" alarms.
 */

export const metadata = { title: "Procurement Manager" };
export const dynamic = "force-dynamic";

const USD_MINOR_PER_K = 100_000;
const USD_MINOR_PER_M = 100_000_000;
const IDR_MINOR_PER_M = 10_000_000_000;

function fmtMinor(minor: number | null | undefined, currency: string | null | undefined): string {
  if (minor == null || !Number.isFinite(minor)) return "—";
  const abs = Math.abs(minor);
  const cur = currency ?? "USD";
  if (cur === "IDR") {
    if (abs >= IDR_MINOR_PER_M) return `IDR ${(minor / IDR_MINOR_PER_M).toFixed(1)}M`;
    return `IDR ${Math.round(minor / 100_000).toLocaleString()}K`;
  }
  if (abs >= USD_MINOR_PER_M) return `${cur} ${(minor / USD_MINOR_PER_M).toFixed(1)}M`;
  if (abs >= USD_MINOR_PER_K) return `${cur} ${Math.round(minor / USD_MINOR_PER_K)}K`;
  return `${cur} ${Math.round(minor / 100).toLocaleString()}`;
}

const URGENCY_TONE: Record<string, "danger" | "warn" | "ok" | undefined> = {
  critical: "danger",
  high: "warn",
  normal: undefined,
  low: undefined,
};

const STATUS_TONE: Record<string, "ok" | "warn" | "danger" | "info" | undefined> = {
  // PRs
  draft: undefined,
  submitted: "warn",
  awaiting_approval: "warn",
  approved: "ok",
  rejected: "danger",
  // POs
  ordered: "info",
  partially_delivered: "warn",
  fully_delivered: "ok",
  cancelled: undefined,
  // Invoices
  issued: "warn",
  sent: "warn",
  overdue: "danger",
};

function urgencyBadge(u: string) {
  const tone = URGENCY_TONE[u];
  return tone ? <HandoffBadge tone={tone}>{u}</HandoffBadge> : <HandoffBadge>{u}</HandoffBadge>;
}
function statusBadge(s: string) {
  const tone = STATUS_TONE[s];
  return tone ? <HandoffBadge tone={tone}>{s.replace(/_/g, " ")}</HandoffBadge> : <HandoffBadge>{s.replace(/_/g, " ")}</HandoffBadge>;
}

const ANALYST_STATUS_TONE: Record<string, "ok" | "warn" | "danger" | undefined> = {
  approved: "ok",
  edited_and_approved: "ok",
  partially_approved: "ok",
  awaiting_review: "warn",
  rejected: "danger",
  expired: undefined,
};
function analystBadge(s: string) {
  const tone = ANALYST_STATUS_TONE[s];
  const label = s.replace(/_/g, " ");
  return tone ? (
    <HandoffBadge tone={tone}>{label}</HandoffBadge>
  ) : (
    <HandoffBadge>{label}</HandoffBadge>
  );
}

interface EmptyStateProps {
  title: string;
  hint: string;
  cta?: { href: string; label: string };
}
function EmptyState({ title, hint, cta }: EmptyStateProps) {
  return (
    <div className="px-5 py-8 text-center text-ink-3 bg-bg-3 border border-dashed border-line rounded-[10px]">
      <div className="display text-[16px] font-medium text-ink-2">{title}</div>
      <p className="mt-1.5 mb-0 text-[13px]">{hint}</p>
      {cta && (
        <a href={cta.href} className="btn btn-amber btn-sm mt-4">
          {cta.label}
        </a>
      )}
    </div>
  );
}

export default async function ProcurementManagerPage() {
  const [prs, pos, invoices, analystOutputs, rfqs] = await Promise.all([
    listOpenPurchaseRequests().catch(() => []),
    listPosInTransit().catch(() => []),
    listInvoicesAwaitingApproval().catch(() => []),
    loadProcurementAnalystBand().catch(() => [] as ProcurementAnalystOutput[]),
    listQuotationComparisons().catch(() => []),
  ]);

  // RFQs awaiting a decision = comparisons with quotes but no winner yet.
  const openRfqs = rfqs.filter((r) => r.selectedCount === 0);

  // Computed KPIs — derive directly from the three reads.
  const pendingApprovalCount = prs.filter((r) =>
    ["submitted", "awaiting_approval"].includes(r.status),
  ).length;
  const posCommittedMinor = pos.reduce(
    (s, p) => s + (p.totalMinor ?? 0),
    0,
  );
  const pastDueCount = invoices.filter(
    (i) => i.daysToDue !== null && i.daysToDue < 0,
  ).length;
  const overdueValueMinor = invoices.reduce((s, i) => s + i.totalMinor, 0);

  return (
    <>
      <SectionHeading
        eyebrow="Procurement · 4-stage flow"
        title={
          <>
            PR → RFQ → PO →{" "}
            <span className="text-amber">delivered.</span>
          </>
        }
        subtitle="Auto-PR from BOQ deviations. Side-by-side vendor comparison with AI scoring. Approval thresholds per role. Per-line receipts at warehouse."
        actions={
          <>
            <Link
              href="/development-os/vendors"
              className="btn btn-dark btn-sm"
            >
              Vendor directory
            </Link>
            <Link
              href="/development-os/cabinets/procurement-manager/pos"
              className="btn btn-dark btn-sm"
            >
              Purchase orders
            </Link>
            <Link
              href="/development-os/procurement/purchase-requests/new"
              className="btn btn-amber btn-sm"
            >
              + Purchase request
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-4 gap-3 mb-[18px]">
        <Kpi
          label="Open PRs"
          value={prs.length === 0 ? "—" : String(prs.length)}
          sub={
            prs.length === 0
              ? "no PRs yet"
              : `${pendingApprovalCount} pending approval`
          }
          tone={prs.length > 0 ? "accent" : undefined}
        />
        <Kpi
          label="Active RFQs"
          value={openRfqs.length === 0 ? "—" : String(openRfqs.length)}
          sub={
            openRfqs.length === 0
              ? "no quotes to compare"
              : `${rfqs.length} with quotes`
          }
          tone={openRfqs.length > 0 ? "accent" : undefined}
        />
        <Kpi
          label="POs in transit"
          value={pos.length === 0 ? "—" : String(pos.length)}
          sub={pos.length === 0 ? "no POs yet" : fmtMinor(posCommittedMinor, "USD") + " committed"}
        />
        <Kpi
          label="Invoices · awaiting"
          value={invoices.length === 0 ? "—" : String(invoices.length)}
          sub={
            invoices.length === 0
              ? "no invoices yet"
              : `${fmtMinor(overdueValueMinor, invoices[0]?.currency ?? "USD")} · ${pastDueCount} past due`
          }
          tone={invoices.length > 0 ? "accent" : undefined}
        />
      </div>

      {/* AI band — live procurement_analyst agent_outputs (vendor reliability + lead-time). */}
      <Card className="corner-marks p-5 mb-[18px] border-amber">
        <div className="flex gap-[18px] items-start">
          <span className="flex-shrink-0 w-10 h-10 rounded-xl bg-[rgba(255,107,53,0.15)] text-amber flex items-center justify-center">
            ✦
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="label label-amber">procurement-analyst</span>
              {analystOutputs.length > 0 &&
                analystBadge(analystOutputs[0].status)}
            </div>
            {analystOutputs.length === 0 ? (
              <>
                <p className="mt-1.5 mb-3 text-[14px] text-ink leading-[1.55] max-w-[780px]">
                  No procurement-analyst findings yet. Vendor reliability and
                  lead-time insights surface here once the analyst agent files
                  its first output against your PO history.
                </p>
                <div className="flex gap-2">
                  <Link
                    href="/development-os/ai-agents/procurement-analyst"
                    className="btn btn-dark btn-sm"
                  >
                    Open agent
                  </Link>
                </div>
              </>
            ) : (
              <>
                <Link
                  href={`/development-os/ai-agents/procurement-analyst/outputs/${analystOutputs[0].outputCode}`}
                  className="block mt-1.5 text-[15px] text-ink font-medium hover:underline"
                >
                  {analystOutputs[0].title}
                </Link>
                <p className="mt-1 mb-3 text-[14px] text-ink-2 leading-[1.55] max-w-[780px]">
                  {analystOutputs[0].summary}
                </p>
                {analystOutputs.length > 1 && (
                  <ul className="mb-3 mt-0 pl-0 list-none space-y-1">
                    {analystOutputs.slice(1).map((o) => (
                      <li
                        key={o.outputCode}
                        className="text-[13px] text-ink-3 flex items-center gap-2"
                      >
                        <span className="text-amber">›</span>
                        <Link
                          href={`/development-os/ai-agents/procurement-analyst/outputs/${o.outputCode}`}
                          className="hover:underline truncate"
                        >
                          {o.title}
                        </Link>
                        {analystBadge(o.status)}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2">
                  <Link
                    href="/development-os/ai-agents/procurement-analyst"
                    className="btn btn-dark btn-sm"
                  >
                    All findings
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </Card>

      {openRfqs.length > 0 && (
        <>
          <h2 className="display text-[22px] mb-3.5 font-medium">
            Quotes to compare
          </h2>
          <Card padding="none" overflowHidden className="mb-[18px]">
            <table className="data">
              <thead>
                <tr>
                  <th>RFQ</th>
                  <th>Material</th>
                  <th className="num">Quotes</th>
                  <th className="num">Lowest</th>
                  <th>Required by</th>
                  <th>Urgency</th>
                </tr>
              </thead>
              <tbody>
                {openRfqs.map((r) => (
                  <tr key={r.requestId}>
                    <td className="mono text-[11px]">
                      <Link
                        href={`/development-os/cabinets/procurement-manager/rfqs/${r.requestId}`}
                        className="hover:underline"
                      >
                        {r.requestCode}
                      </Link>
                    </td>
                    <td>{r.materialName}</td>
                    <td className="num">{r.quotationCount}</td>
                    <td className="num">
                      {r.lowestTotalMinor
                        ? fmtMinor(Number(r.lowestTotalMinor), r.currency)
                        : "—"}
                    </td>
                    <td className="mono">{r.requiredByDate}</td>
                    <td>{urgencyBadge(r.urgency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      <h2 className="display text-[22px] mb-3.5 font-medium">
        Open purchase requests
      </h2>
      <Card padding="none" overflowHidden className="mb-[18px]">
        {prs.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No open purchase requests"
              hint="DEMO-1 didn't seed procurement data for this org. Create your first PR to start the procure-to-pay flow."
              cta={{
                href: "/development-os/procurement/purchase-requests/new",
                label: "Create first PR →",
              }}
            />
          </div>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>PR</th>
                <th>Material</th>
                <th>Project</th>
                <th>Requester</th>
                <th className="num">Estimated</th>
                <th>Urgency</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {prs.map((r: ProcurementPrRow) => (
                <tr key={r.id}>
                  <td className="mono text-[11px]">{r.requestCode}</td>
                  <td>{r.materialName}</td>
                  <td className="mono">{r.projectCode ?? "—"}</td>
                  <td>{r.requesterName ?? "—"}</td>
                  <td className="num">{fmtMinor(r.estimatedMinor, r.currency)}</td>
                  <td>{urgencyBadge(r.urgency)}</td>
                  <td>{statusBadge(r.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <h2 className="display text-[22px] mb-3.5 font-medium mt-6">
        POs in transit
      </h2>
      <Card padding="none" overflowHidden className="mb-[18px]">
        {pos.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No POs in transit"
              hint="Approve a purchase request to generate a PO and surface delivery tracking here."
            />
          </div>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>PO</th>
                <th>Vendor</th>
                <th>Project</th>
                <th>Expected delivery</th>
                <th className="num">Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {pos.map((r: ProcurementPoRow) => (
                <tr key={r.id}>
                  <td className="mono text-[11px]">{r.poCode}</td>
                  <td>{r.vendorName ?? "—"}</td>
                  <td className="mono">{r.projectCode ?? "—"}</td>
                  <td className="mono">{r.expectedDelivery ?? "—"}</td>
                  <td className="num">{fmtMinor(r.totalMinor, r.currency)}</td>
                  <td>{statusBadge(r.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <h2 className="display text-[22px] mb-3.5 font-medium mt-6">
        Invoices · awaiting payment
      </h2>
      <Card padding="none" overflowHidden>
        {invoices.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No invoices awaiting"
              hint="Vendor invoices linked to POs show up here once received."
            />
          </div>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Vendor</th>
                <th>PO</th>
                <th className="num">Amount</th>
                <th>Due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((r: ProcurementInvoiceRow) => (
                <tr key={r.id}>
                  <td className="mono text-[11px]">{r.invoiceNumber}</td>
                  <td>{r.vendorName ?? "—"}</td>
                  <td className="mono">{r.poCode ?? "—"}</td>
                  <td className="num">{fmtMinor(r.totalMinor, r.currency)}</td>
                  <td className="mono">
                    {r.dueDate ?? "—"}
                    {r.daysToDue !== null && r.daysToDue < 0 && (
                      <span className="text-[var(--danger,var(--amber))] ml-1.5">
                        ({-r.daysToDue}d late)
                      </span>
                    )}
                  </td>
                  <td>{statusBadge(r.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
