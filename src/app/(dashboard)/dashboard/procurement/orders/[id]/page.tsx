import Link from "next/link";
import { notFound } from "next/navigation";
import { PurchaseOrderStatusPill } from "@/components/procurement/purchase-status-pill";
import { ReceiveLineForm } from "@/components/procurement/receive-line-form";
import { DbStatusNotice } from "@/components/admin/db-status";
import { getPurchaseOrderById } from "@/features/procurement/services";
import { listInventoryLocations } from "@/features/inventory/services";
import { formatMoneyMinor } from "@/lib/money";

export const metadata = { title: "Purchase order" };
export const dynamic = "force-dynamic";

/** PO lifecycle as a left-to-right approval flow. Index of the current
 *  status marks how far the order has progressed; `cancelled` is shown
 *  as a terminal off-path state. */
const FLOW = ["draft", "sent", "confirmed", "partially_received", "received"] as const;
const FLOW_LABEL: Record<(typeof FLOW)[number], string> = {
  draft: "draft",
  sent: "sent",
  confirmed: "confirmed",
  partially_received: "partial",
  received: "received",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function PurchaseOrderDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const po = await getPurchaseOrderById(id);
  if (!po) notFound();
  const locations = await listInventoryLocations();

  const totalLabel =
    po.totalMinor !== null && po.currency
      ? formatMoneyMinor(po.totalMinor, po.currency)
      : "—";
  const currentIdx = FLOW.indexOf(po.status as (typeof FLOW)[number]);
  const cancelled = po.status === "cancelled";

  return (
    <>
      <div className="page-header mb-0">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/procurement">Procurement</Link> /{" "}
            <Link href="/dashboard/procurement/orders">Orders</Link> / <span>{po.poCode}</span>
          </div>
          <h1>
            {po.poCode}{" "}
            <em className="text-terra italic">· {po.status.replace(/_/g, " ")}</em>
          </h1>
          <p className="page-header-meta">
            <span>
              vendor <strong className="text-ink-2">{po.supplierName ?? "—"}</strong>
            </span>
            <span>
              created <strong className="text-ink-2">{fmtDate(po.createdAt)}</strong>
            </span>
            <span>
              delivery <strong className="text-ink-2">{fmtDate(po.expectedDelivery)}</strong>
            </span>
            <span>
              total <strong className="text-ink-2">{totalLabel}</strong>
            </span>
          </p>
        </div>
        <div className="actions">
          <PurchaseOrderStatusPill status={po.status} />
        </div>
      </div>

      <DbStatusNotice />

      <div className="card overflow-hidden grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] mt-[18px]">
        {/* Left — line items + approval flow */}
        <div className="px-[28px] py-[22px] border-b lg:border-b-0 lg:border-r border-line-soft">
          <h2 className="mono text-[10.5px] uppercase tracking-[0.18em] text-ink-3 font-medium mb-3.5">
            Line items · {po.lines.length} SKU{po.lines.length === 1 ? "" : "s"}
          </h2>
          {po.lines.length === 0 ? (
            <p className="text-[12.5px] text-ink-3">No lines on this order.</p>
          ) : (
            <div className="rounded-[10px] border border-line overflow-hidden bg-paper">
              <table className="data">
                <thead>
                  <tr>
                    <th scope="col">SKU · description</th>
                    <th scope="col" className="num">Ordered</th>
                    <th scope="col" className="num">Recv</th>
                    <th scope="col" className="num">Unit</th>
                    <th scope="col">Receive</th>
                  </tr>
                </thead>
                <tbody>
                  {po.lines.map((l) => {
                    const outstanding = l.quantityOrdered - l.quantityReceived;
                    return (
                      <tr key={l.id}>
                        <td>
                          <span className="block text-[13px] font-medium text-ink">
                            {l.description}
                          </span>
                          <span className="mono text-[10px] text-ink-4">{l.unit}</span>
                        </td>
                        <td className="num">{l.quantityOrdered.toLocaleString()}</td>
                        <td className="num">{l.quantityReceived.toLocaleString()}</td>
                        <td className="num text-terra">
                          {l.unitCostMinor !== null && l.currency
                            ? formatMoneyMinor(l.unitCostMinor, l.currency)
                            : "—"}
                        </td>
                        <td>
                          <ReceiveLineForm
                            poId={po.id}
                            lineId={l.id}
                            outstanding={outstanding}
                            unit={l.unit}
                            locations={locations.map((loc) => ({ id: loc.id, label: loc.name }))}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <h2 className="mono text-[10.5px] uppercase tracking-[0.18em] text-ink-3 font-medium mb-3.5 mt-[22px]">
            Approval flow
          </h2>
          <div className="flex items-center gap-2 flex-wrap rounded-[10px] border border-line bg-paper px-3.5 py-3 mono text-[10.5px] uppercase tracking-[0.10em] text-ink-3">
            {cancelled ? (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-danger" />
                cancelled
              </span>
            ) : (
              FLOW.map((step, idx) => {
                const state =
                  idx < currentIdx ? "done" : idx === currentIdx ? "on" : "pending";
                return (
                  <span key={step} className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={
                          "inline-block h-2 w-2 rounded-full " +
                          (state === "on"
                            ? "bg-terra ring-[3px] ring-[color-mix(in_oklab,var(--terra)_20%,transparent)]"
                            : state === "done"
                            ? "bg-ok"
                            : "bg-ink-4")
                        }
                      />
                      <span className={state === "on" ? "text-ink" : ""}>
                        {FLOW_LABEL[step]}
                      </span>
                    </span>
                    {idx < FLOW.length - 1 && <span className="text-ink-4">→</span>}
                  </span>
                );
              })
            )}
          </div>
        </div>

        {/* Right — vendor + delivery, threshold, notes */}
        <div className="px-[28px] py-[22px]">
          <h2 className="mono text-[10.5px] uppercase tracking-[0.18em] text-ink-3 font-medium mb-3.5">
            Vendor + delivery
          </h2>
          <dl className="rounded-[10px] border border-line bg-paper px-4 py-3">
            <KvRow k="vendor" v={po.supplierName ?? "—"} />
            <KvRow k="project" v={po.projectName ?? "—"} />
            <KvRow k="delivery" v={fmtDate(po.expectedDelivery)} />
            <KvRow
              k="received"
              v={po.receivedAt ? fmtDate(po.receivedAt) : "—"}
            />
            <KvRow k="PO no" v={po.poCode} mono />
            <KvRow k="created" v={fmtDate(po.createdAt)} last />
          </dl>

          <h2 className="mono text-[10.5px] uppercase tracking-[0.18em] text-ink-3 font-medium mb-3.5 mt-[22px]">
            Approval threshold
          </h2>
          <div className="rounded-[8px] border border-line bg-paper px-3.5 py-3 text-[12.5px] text-ink-2 leading-relaxed">
            Orders over the director threshold are auto-queued for sign-off in the
            Workspace attention feed. Receive lines as goods arrive to advance the
            order toward reconciliation.
          </div>

          {po.notes && (
            <>
              <h2 className="mono text-[10.5px] uppercase tracking-[0.18em] text-ink-3 font-medium mb-3.5 mt-[22px]">
                Order notes
              </h2>
              <div className="rounded-[8px] border border-line bg-paper px-3.5 py-3 text-[12.5px] text-ink-2 leading-relaxed whitespace-pre-line">
                {po.notes}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function KvRow({
  k,
  v,
  mono = false,
  last = false,
}: {
  k: string;
  v: React.ReactNode;
  mono?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className={
        "grid grid-cols-[110px_1fr] gap-3 py-[7px] text-[12.5px] " +
        (last ? "" : "border-b border-line-soft")
      }
    >
      <dt className="mono text-[10.5px] uppercase tracking-[0.10em] text-ink-3">{k}</dt>
      <dd className={"m-0 text-ink" + (mono ? " mono text-[12px]" : "")}>{v}</dd>
    </div>
  );
}
