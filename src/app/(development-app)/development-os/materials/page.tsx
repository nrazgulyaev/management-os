import type { Metadata } from "next";
import Link from "next/link";
import { Card, Kpi, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getMaterialPurchaseOrders } from "@/lib/development/server/materials";
import { getDevelopmentProjects } from "@/lib/development/server/projects";
import { getVendors } from "@/lib/development/server/vendors";
import { MATERIAL_PO_STATUS_LABEL } from "@/lib/development/constants/material-constants";
import { formatUsdMinor } from "@/lib/development/constants/investor-constants";
import { safeQuery } from "@/lib/development/safe-query";
import { MaterialPOModalForm } from "@/components/development/operations/material-po-modal-form";
import { ExportButton } from "@/components/development/bulk-import/export-button";

export const metadata: Metadata = { title: "Materials · Development OS" };
export const dynamic = "force-dynamic";

type PoTone = "ok" | "warn" | "info" | "danger" | "ink";

function poTone(status: string): PoTone {
  switch (status) {
    case "fully_delivered":
      return "ok";
    case "partially_delivered":
      return "info";
    case "ordered":
      return "warn";
    case "cancelled":
      return "ink";
    default:
      return "ink";
  }
}

export default async function MaterialsPage() {
  const db = getDb();
  const [list, projects, vendors] = await Promise.all([
    db
      ? safeQuery("getMaterialPurchaseOrders", getMaterialPurchaseOrders(), [], 4000)
      : Promise.resolve([]),
    db
      ? safeQuery("getDevelopmentProjects", getDevelopmentProjects(), [], 4000)
      : Promise.resolve([]),
    db
      ? safeQuery("getVendors", getVendors(), [], 4000)
      : Promise.resolve([]),
  ]);
  const projectOptions = projects.map((p) => ({ id: p.id, name: p.name }));
  const vendorOptions = vendors.map((v) => ({
    id: v.id,
    vendorCode: v.vendorCode,
    legalName: v.legalName,
  }));

  const openOrdered = list.filter(
    (p) => p.status === "ordered" || p.status === "partially_delivered",
  );
  const openTotalUsd = openOrdered.reduce(
    (acc, p) => acc + BigInt(p.totalAmountUsdMinor),
    0n,
  );
  const partial = list.filter(
    (p) => p.status === "partially_delivered",
  ).length;

  const today = new Date().toISOString().slice(0, 10);
  const overEta = list.filter(
    (p) =>
      p.status !== "fully_delivered" &&
      p.status !== "cancelled" &&
      p.expectedDeliveryDate != null &&
      p.expectedDeliveryDate < today,
  ).length;

  const deliveredUsd = list
    .filter((p) => p.status === "fully_delivered")
    .reduce((acc, p) => acc + BigInt(p.totalAmountUsdMinor), 0n);

  return (
    <DevelopmentShell>
      <div className="flex items-end gap-[18px]">
        <div className="flex-1 min-w-0">
          <div className="label text-amber">
            Procurement · POs · deliveries
          </div>
          <h1 className="display text-[42px] mt-1.5 mb-0 font-medium">
            Material <em>purchase orders</em>.
          </h1>
          <p className="mt-2.5 mb-0 text-[15px] leading-[1.55] text-ink-3 max-w-[680px]">
            Vendor POs, deliveries, and on-site consumption. The reconciliation
            gate keeps delivered quantity equal to the sum of received delivery
            lines.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <MaterialPOModalForm projects={projectOptions} vendors={vendorOptions} />
          <Link
            href="/development-os/materials/new"
            className="btn btn-dark btn-sm"
          >
            Full form
          </Link>
          <ExportButton entity="materials" />
          <Link
            href="/development-os/materials/deliveries"
            className="btn btn-dark btn-sm"
          >
            Deliveries
          </Link>
        </div>
      </div>

      {!db ? (
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      ) : list.length === 0 ? (
        <EmptyState
          title="No POs yet"
          description="Add your first purchase order to start tracking materials and deliveries."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi
              label="Open POs"
              value={String(openOrdered.length)}
              sub={`${formatUsdMinor(openTotalUsd)} ordered`}
              tone="accent"
            />
            <Kpi
              label="Partial delivery"
              value={String(partial)}
              sub="awaiting balance"
              tone="warn"
            />
            <Kpi
              label="Over ETA"
              value={
                overEta > 0 ? (
                  <span className="text-danger">{overEta}</span>
                ) : (
                  "0"
                )
              }
              sub="chase vendor"
            />
            <Kpi
              label="Delivered · total"
              value={formatUsdMinor(deliveredUsd)}
              sub="reconciled"
              tone="success"
            />
          </div>

          <Card padding="none" overflowHidden>
            <div className="px-[22px] py-3.5 border-b border-line flex items-center">
              <h3 className="display text-[19px] font-medium m-0">
                All purchase orders
              </h3>
              <span className="mono ml-auto text-[11px] text-ink-3">
                CHRONOLOGICAL
              </span>
            </div>
            <table className="data">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Project</th>
                  <th>Vendor</th>
                  <th>Order date</th>
                  <th>Expected</th>
                  <th className="num">Total · USD</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => {
                  const late =
                    p.status !== "fully_delivered" &&
                    p.status !== "cancelled" &&
                    p.expectedDeliveryDate != null &&
                    p.expectedDeliveryDate < today;
                  return (
                    <tr key={p.id}>
                      <td className="mono text-[11px]">
                        <Link
                          href={`/development-os/materials/${p.poCode}`}
                          className="no-underline text-inherit hover:underline"
                        >
                          {p.poCode}
                        </Link>
                      </td>
                      <td>{p.projectName ?? "—"}</td>
                      <td>{p.vendorLegalName}</td>
                      <td className="mono text-[11px]">{p.orderDate}</td>
                      <td
                        className={
                          "mono text-[11px]" +
                          (late ? " text-danger" : " text-ink-3")
                        }
                      >
                        {p.expectedDeliveryDate ?? "—"}
                        {late ? " · late" : ""}
                      </td>
                      <td className="num">
                        {formatUsdMinor(BigInt(p.totalAmountUsdMinor))}
                      </td>
                      <td>
                        <HandoffBadge
                          tone={late ? "danger" : poTone(p.status)}
                        >
                          {late ? "Over ETA" : MATERIAL_PO_STATUS_LABEL[p.status]}
                        </HandoffBadge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </DevelopmentShell>
  );
}
