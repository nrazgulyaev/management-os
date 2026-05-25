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

interface EmptyStateProps {
  title: string;
  hint: string;
  cta?: { href: string; label: string };
}
function EmptyState({ title, hint, cta }: EmptyStateProps) {
  return (
    <div
      style={{
        padding: "32px 20px",
        textAlign: "center",
        color: "var(--ink-3)",
        background: "var(--bg-3, var(--cream-warm))",
        border: "1px dashed var(--line, var(--line-soft))",
        borderRadius: 10,
      }}
    >
      <div className="display" style={{ fontSize: 16, fontWeight: 500, color: "var(--ink-2)" }}>
        {title}
      </div>
      <p style={{ margin: "6px 0 0", fontSize: 13 }}>{hint}</p>
      {cta && (
        <a href={cta.href} className="btn btn-amber btn-sm" style={{ marginTop: 16 }}>
          {cta.label}
        </a>
      )}
    </div>
  );
}

export default async function ProcurementManagerPage() {
  const [prs, pos, invoices] = await Promise.all([
    listOpenPurchaseRequests().catch(() => []),
    listPosInTransit().catch(() => []),
    listInvoicesAwaitingApproval().catch(() => []),
  ]);

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
            <span style={{ color: "var(--amber)" }}>delivered.</span>
          </>
        }
        subtitle="Auto-PR from BOQ deviations. Side-by-side vendor comparison with AI scoring. Approval thresholds per role. Per-line receipts at warehouse."
        actions={
          <>
            <button className="btn btn-dark btn-sm" disabled title="Coming soon" style={{ opacity: 0.55, cursor: "not-allowed" }}>Vendor scorecards</button>
            <button className="btn btn-amber btn-sm" disabled title="Coming soon" style={{ opacity: 0.55, cursor: "not-allowed" }}>+ Purchase request</button>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 18 }}>
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
          value="—"
          sub="quotation flow coming soon"
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
        <Kpi label="Avg PR → PO" value="—" sub="cycle-time analytics coming soon" />
      </div>

      <h2 className="display" style={{ fontSize: 22, marginBottom: 14, fontWeight: 500 }}>
        Open purchase requests
      </h2>
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
        {prs.length === 0 ? (
          <div style={{ padding: 20 }}>
            <EmptyState
              title="No open purchase requests"
              hint="DEMO-1 didn't seed procurement data for this org. Create your first PR to start the procure-to-pay flow."
              cta={{
                href: "/development-os/procurement/requests/new",
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
                  <td className="mono" style={{ fontSize: 11 }}>{r.requestCode}</td>
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

      <h2
        className="display"
        style={{ fontSize: 22, marginBottom: 14, fontWeight: 500, marginTop: 24 }}
      >
        POs in transit
      </h2>
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
        {pos.length === 0 ? (
          <div style={{ padding: 20 }}>
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
                  <td className="mono" style={{ fontSize: 11 }}>{r.poCode}</td>
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

      <h2
        className="display"
        style={{ fontSize: 22, marginBottom: 14, fontWeight: 500, marginTop: 24 }}
      >
        Invoices · awaiting payment
      </h2>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {invoices.length === 0 ? (
          <div style={{ padding: 20 }}>
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
                  <td className="mono" style={{ fontSize: 11 }}>{r.invoiceNumber}</td>
                  <td>{r.vendorName ?? "—"}</td>
                  <td className="mono">{r.poCode ?? "—"}</td>
                  <td className="num">{fmtMinor(r.totalMinor, r.currency)}</td>
                  <td className="mono">
                    {r.dueDate ?? "—"}
                    {r.daysToDue !== null && r.daysToDue < 0 && (
                      <span style={{ color: "var(--danger, var(--amber))", marginLeft: 6 }}>
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
