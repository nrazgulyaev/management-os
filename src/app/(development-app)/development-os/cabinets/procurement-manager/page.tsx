import {
  Kpi,
  SectionHeading,
  Card,
  Badge,
} from "@/components/dashboard/primitives";

/**
 * Sprint _handoff/ Task 7 (visual port) — Dev OS Procurement Manager.
 *
 * 1:1 visual port of `_handoff/development/procurement.html` (app.js).
 * Mock data preserved — live wiring deferred to TASK-7-DATA per
 * docs/audits/task-6-7-data-wiring-todo.md.
 *
 * Sections: SectionHeading → 5-up KPIs → Open PRs table → POs in
 * transit table → Invoices awaiting payment table.
 */

export const metadata = { title: "Procurement Manager" };
export const dynamic = "force-dynamic";

// TODO(task-7-data): wire to features/development/services.listOpenPRs().
const OPEN_PRS: {
  pr: string;
  items: string;
  project: string;
  by: string;
  total: string;
  approvalLabel: string;
  approvalTone?: "ok" | "warn";
  stageLabel: string;
  stageTone?: "ok" | "warn";
}[] = [
  { pr: "PR-8821", items: "Hand towels · 80 pcs", project: "EP02", by: "Made S.", total: "$310", approvalLabel: "Auto", stageLabel: "Ordered", stageTone: "ok" },
  { pr: "PR-8820", items: "Marble Hindari (re-issue)", project: "EP02", by: "Wayan T.", total: "$23,808", approvalLabel: "Director", approvalTone: "warn", stageLabel: "RFQ open", stageTone: "warn" },
  { pr: "PR-8819", items: "Pool filter cartridge", project: "EP02", by: "Komang Y.", total: "$420", approvalLabel: "Approved", approvalTone: "ok", stageLabel: "RFQ open", stageTone: "warn" },
  { pr: "PR-8818", items: "Cabling YDA 4mm · 2.4km", project: "ES10", by: "Ari P.", total: "$5,040", approvalLabel: "Director", approvalTone: "warn", stageLabel: "Draft" },
  { pr: "PR-8815", items: "Stainless balustrade 304", project: "EP02", by: "Wayan T.", total: "$7,560", approvalLabel: "Approved", approvalTone: "ok", stageLabel: "PO issued", stageTone: "ok" },
];

// TODO(task-7-data): wire to features/development/services.listPOsInTransit().
const POS_IN_TRANSIT: { po: string; vendor: string; items: string; total: string; eta: string; statusLabel: string; statusTone?: "warn" | "info" }[] = [
  { po: "PO-8814", vendor: "Linen Mart Denpasar", items: "Hand towels · 40 pcs (partial)", total: "$310", eta: "today", statusLabel: "Partial", statusTone: "warn" },
  { po: "PO-8813", vendor: "BaliSteel", items: "Stainless balustrade · 180m", total: "$7,560", eta: "24 Apr", statusLabel: "In transit", statusTone: "info" },
  { po: "PO-8812", vendor: "CoolAir", items: "AC units · 6 pcs", total: "$18,420", eta: "26 Apr", statusLabel: "Scheduled" },
  { po: "PO-8810", vendor: "Krakatau Steel", items: "Rebar Ø12/16 · 84.6t", total: "$118,200", eta: "02 May", statusLabel: "Scheduled" },
];

// TODO(task-7-data): wire to features/finance/services.listAwaitingInvoices().
const INVOICES: { inv: string; vendor: string; po: string; amount: string; due: string; statusLabel: string; statusTone?: "warn" | "danger" }[] = [
  { inv: "INV-2418", vendor: "Holcim Beton", po: "PO-8807", amount: "$28,440", due: "22 Apr", statusLabel: "Due tomorrow", statusTone: "warn" },
  { inv: "INV-2417", vendor: "BaliPlywood", po: "PO-8806", amount: "$8,640", due: "15 Apr", statusLabel: "Past due 6d", statusTone: "danger" },
  { inv: "INV-2416", vendor: "CoolAir", po: "PO-8805", amount: "$3,840", due: "28 Apr", statusLabel: "On schedule" },
];

export default function ProcurementManagerPage() {
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
            <button className="btn btn-dark btn-sm">Vendor scorecards</button>
            <button className="btn btn-amber btn-sm">+ Purchase request</button>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 18 }}>
        <Kpi label="Open PRs" value="14" sub="4 pending approval" tone="accent" />
        <Kpi label="Active RFQs" value="6" sub="22 quotations received" />
        <Kpi label="POs in transit" value="9" sub="$184K committed" />
        <Kpi label="Invoices · awaiting" value="11" sub="$84K · 4 past due" tone="accent" />
        <Kpi label="Avg PR → PO" value="6.2 days" sub="−2d vs Q1" tone="success" />
      </div>

      <h2 className="display" style={{ fontSize: 22, marginBottom: 14, fontWeight: 500 }}>
        Open purchase requests
      </h2>
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
        <table className="data">
          <thead>
            <tr>
              <th>PR</th>
              <th>Items</th>
              <th>Project</th>
              <th>By</th>
              <th className="num">Total</th>
              <th>Approval</th>
              <th>Stage</th>
            </tr>
          </thead>
          <tbody>
            {OPEN_PRS.map((r) => (
              <tr key={r.pr}>
                <td className="mono" style={{ fontSize: 11 }}>{r.pr}</td>
                <td>{r.items}</td>
                <td className="mono">{r.project}</td>
                <td>{r.by}</td>
                <td className="num">{r.total}</td>
                <td>
                  {r.approvalTone === "ok" ? (
                    <Badge tone="ok">{r.approvalLabel}</Badge>
                  ) : r.approvalTone === "warn" ? (
                    <Badge tone="warn">{r.approvalLabel}</Badge>
                  ) : (
                    <Badge>{r.approvalLabel}</Badge>
                  )}
                </td>
                <td>
                  {r.stageTone === "ok" ? (
                    <Badge tone="ok">{r.stageLabel}</Badge>
                  ) : r.stageTone === "warn" ? (
                    <Badge tone="warn">{r.stageLabel}</Badge>
                  ) : (
                    <Badge>{r.stageLabel}</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <h2
        className="display"
        style={{ fontSize: 22, marginBottom: 14, fontWeight: 500, marginTop: 24 }}
      >
        POs in transit
      </h2>
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
        <table className="data">
          <thead>
            <tr>
              <th>PO</th>
              <th>Vendor</th>
              <th>Items</th>
              <th className="num">Total</th>
              <th>ETA</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {POS_IN_TRANSIT.map((r) => (
              <tr key={r.po}>
                <td className="mono" style={{ fontSize: 11 }}>{r.po}</td>
                <td>{r.vendor}</td>
                <td>{r.items}</td>
                <td className="num">{r.total}</td>
                <td className="mono">{r.eta}</td>
                <td>
                  {r.statusTone === "warn" ? (
                    <Badge tone="warn">{r.statusLabel}</Badge>
                  ) : r.statusTone === "info" ? (
                    <Badge tone="info">{r.statusLabel}</Badge>
                  ) : (
                    <Badge>{r.statusLabel}</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <h2
        className="display"
        style={{ fontSize: 22, marginBottom: 14, fontWeight: 500, marginTop: 24 }}
      >
        Invoices · awaiting payment
      </h2>
      <Card style={{ padding: 0, overflow: "hidden" }}>
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
            {INVOICES.map((r) => (
              <tr key={r.inv}>
                <td className="mono" style={{ fontSize: 11 }}>{r.inv}</td>
                <td>{r.vendor}</td>
                <td className="mono">{r.po}</td>
                <td className="num">{r.amount}</td>
                <td className="mono">{r.due}</td>
                <td>
                  {r.statusTone === "warn" ? (
                    <Badge tone="warn">{r.statusLabel}</Badge>
                  ) : r.statusTone === "danger" ? (
                    <Badge tone="danger">{r.statusLabel}</Badge>
                  ) : (
                    <Badge>{r.statusLabel}</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
