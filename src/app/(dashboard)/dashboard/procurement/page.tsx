import Link from "next/link";
import { Kpi } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import { PurchaseOrderStatusPill } from "@/components/procurement/purchase-status-pill";
import { PurchaseRequestAddButton } from "@/components/procurement/request-add-button";
import { PurchaseOrderAddButton } from "@/components/procurement/order-add-button";
import {
  listPurchaseOrders,
  listPurchaseRequests,
} from "@/features/procurement/services";
import { listSuppliers } from "@/features/inventory/services";
import { listProjects } from "@/features/projects/services";
import { listVillas } from "@/features/villas/services";

export const metadata = { title: "Procurement" };
export const dynamic = "force-dynamic";

const PR_TONE: Record<
  string,
  "warning" | "neutral" | "success" | "danger" | "info"
> = {
  submitted: "warning",
  draft: "neutral",
  approved: "success",
  rejected: "danger",
  ordered: "info",
  received: "success",
  cancelled: "neutral",
};

const CLOSED_PR = new Set(["received", "cancelled", "rejected"]);
const CLOSED_PO = new Set(["received", "cancelled"]);

function money(minor: bigint | null, currency: string | null): string {
  if (minor === null) return "—";
  return `${currency ?? ""} ${Math.round(Number(minor) / 100).toLocaleString()}`.trim();
}

export default async function ProcurementHomePage() {
  const [requests, orders, suppliers, projects, villas] = await Promise.all([
    listPurchaseRequests(),
    listPurchaseOrders(),
    listSuppliers(),
    listProjects(),
    listVillas(),
  ]);
  const supplierOpts = suppliers.map((s) => ({ id: s.id, label: s.name }));
  const projectOpts = projects.map((p) => ({ id: p.id, label: p.name }));
  const villaOpts = villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }));

  const pending = requests.filter((r) => r.status === "submitted").length;
  const approved = requests.filter((r) => r.status === "approved").length;
  const openRequests = requests.filter((r) => !CLOSED_PR.has(r.status));
  const openOrders = orders.filter((o) => !CLOSED_PO.has(o.status));

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const spendMtdMinor = orders
    .filter((o) => new Date(o.createdAt) >= monthStart)
    .reduce((s, o) => s + Number(o.totalMinor ?? 0n), 0);
  const spendCurrency =
    orders.find((o) => o.currency)?.currency ??
    requests.find((r) => r.currency)?.currency ??
    "";
  const spendLabel =
    spendMtdMinor > 0
      ? `${spendCurrency} ${Math.round(spendMtdMinor / 100).toLocaleString()}`.trim()
      : "—";

  return (
    <>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/inventory">Inventory</Link> / <span>Procurement</span>
          </div>
          <h1>Procurement</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            PR → RFQ → PO → receive. Auto-PR from low stock, vendor comparison,
            per-line receipts, approval thresholds enforced per role.
          </p>
        </div>
        <div className="actions">
          <PurchaseOrderAddButton suppliers={supplierOpts} projects={projectOpts} villas={villaOpts} />
          <PurchaseRequestAddButton suppliers={supplierOpts} projects={projectOpts} villas={villaOpts} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-[18px] mb-[18px]">
        <Kpi
          label="PR · open"
          value={String(openRequests.length)}
          sub={`${pending} pending approval`}
          tone={pending > 0 ? "accent" : undefined}
        />
        <Kpi label="PO · open" value={String(openOrders.length)} sub="not yet received" />
        <Kpi label="Spend · MTD" value={spendLabel} sub="purchase orders" />
        <Kpi label="Suppliers" value={String(suppliers.length)} sub="vendors on file" />
        <Kpi
          label="Approved PRs"
          value={String(approved)}
          sub="ready to order"
          tone={approved > 0 ? "success" : undefined}
        />
      </div>

      <DbStatusNotice />

      {/* Open purchase requests */}
      <div className="flex items-end justify-between mt-2 mb-3.5">
        <h2 className="display text-[22px] font-normal">Open purchase requests</h2>
        <Link
          href="/dashboard/procurement/requests"
          className="text-[12px] text-ink-3 hover:text-ink underline"
        >
          All requests →
        </Link>
      </div>
      <div className="card p-0 overflow-hidden mb-[18px]">
        <table className="data">
          <thead>
            <tr>
              <th>PR</th>
              <th>Title</th>
              <th>Requested by</th>
              <th className="num">Total</th>
              <th>Priority</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {openRequests.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-ink-3 italic py-8">
                  No open purchase requests.
                </td>
              </tr>
            ) : (
              openRequests.slice(0, 12).map((r) => (
                <tr key={r.id}>
                  <td className="mono text-[11px] text-ink-3">
                    <Link href={`/dashboard/procurement/requests/${r.id}`} className="hover:text-terra">
                      {r.requestCode}
                    </Link>
                  </td>
                  <td>
                    {r.title}{" "}
                    <span className="text-ink-4 text-[11px]">· {r.lineCount} line{r.lineCount === 1 ? "" : "s"}</span>
                  </td>
                  <td className="text-[12px] text-ink-3">{r.requestedByName ?? "—"}</td>
                  <td className="num mono text-[12px]">
                    {money(r.totalEstimatedMinor, r.currency)}
                  </td>
                  <td>
                    <Badge tone={r.priority === "urgent" || r.priority === "high" ? "warning" : "neutral"}>
                      {r.priority}
                    </Badge>
                  </td>
                  <td>
                    <Badge tone={PR_TONE[r.status] ?? "neutral"}>{r.status}</Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Purchase orders */}
      <div className="flex items-end justify-between mt-8 mb-3.5">
        <h2 className="display text-[22px] font-normal" id="orders">
          Purchase orders
        </h2>
        <Link
          href="/dashboard/procurement/orders"
          className="text-[12px] text-ink-3 hover:text-ink underline"
        >
          All orders →
        </Link>
      </div>
      <div className="card p-0 overflow-hidden">
        <table className="data">
          <thead>
            <tr>
              <th>PO</th>
              <th>Supplier</th>
              <th>Project</th>
              <th className="num">Total</th>
              <th>ETA</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-ink-3 italic py-8">
                  No purchase orders yet.
                </td>
              </tr>
            ) : (
              orders.slice(0, 12).map((o) => (
                <tr key={o.id}>
                  <td className="mono text-[11px] text-ink-3">
                    <Link href={`/dashboard/procurement/orders/${o.id}`} className="hover:text-terra">
                      {o.poCode}
                    </Link>
                  </td>
                  <td>{o.supplierName ?? "—"}</td>
                  <td className="text-[12px] text-ink-3">{o.projectName ?? "—"}</td>
                  <td className="num mono text-[12px]">{money(o.totalMinor, o.currency)}</td>
                  <td className="mono text-[11px] text-ink-3">{o.expectedDelivery ?? "—"}</td>
                  <td>
                    <PurchaseOrderStatusPill status={o.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
