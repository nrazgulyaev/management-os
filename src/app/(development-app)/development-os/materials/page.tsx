import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Kpi, HandoffBadge } from "@/components/dashboard/primitives";
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

const STATUS_TONE: Record<
  string,
  "ok" | "warn" | "danger" | "gold" | "info" | "ink" | undefined
> = {
  fully_delivered: "ok",
  partially_delivered: "info",
  ordered: "warn",
};

/** Compact M-suffixed major-unit value for the KPI strip. */
function fmtCompactUsd(minor: bigint): string {
  const major = Number(minor) / 100;
  if (major >= 1e9) return `$${(major / 1e9).toFixed(1)}B`;
  if (major >= 1e6) return `$${(major / 1e6).toFixed(1)}M`;
  if (major >= 1e3) return `$${(major / 1e3).toFixed(0)}k`;
  return `$${Math.round(major)}`;
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

  const totalUsd = list.reduce(
    (acc, p) => acc + BigInt(p.totalAmountUsdMinor),
    0n,
  );
  const openCount = list.filter(
    (p) => p.status === "ordered" || p.status === "partially_delivered",
  ).length;
  const deliveredCount = list.filter(
    (p) => p.status === "fully_delivered",
  ).length;
  const vendorCount = new Set(list.map((p) => p.vendorLegalName)).size;

  return (
    <DevelopmentShell>
      <header className="page-header">
        <div className="left">
          <div className="crumb">Warehouse · receiving</div>
          <h1>
            Material POs <em>· {openCount} open</em>
          </h1>
          <div className="page-header-meta">
            <span>{list.length} POs</span>
            <span>·</span>
            <span>{formatUsdMinor(totalUsd)} ordered</span>
            <span>·</span>
            <span>{vendorCount} vendors</span>
          </div>
        </div>
        <div className="actions">
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
          <Link href="/development-os" className="btn btn-dark btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Command center
          </Link>
        </div>
      </header>

      <p className="text-ink-secondary text-sm max-w-3xl leading-relaxed">
        Vendor POs, deliveries, and on-site consumption. The reconciliation gate
        ensures po_lines.quantity_delivered always equals the sum of
        delivery_lines.quantity_received.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          label="Ordered · total"
          value={list.length ? fmtCompactUsd(totalUsd) : "—"}
          sub="across POs"
          tone={list.length ? "accent" : undefined}
        />
        <Kpi
          label="Open"
          value={openCount || "—"}
          sub="ordered + partial"
          tone={openCount > 0 ? "warn" : undefined}
        />
        <Kpi
          label="Delivered"
          value={deliveredCount || "—"}
          sub="fully received"
          tone={deliveredCount > 0 ? "success" : undefined}
        />
        <Kpi label="Vendors" value={vendorCount || "—"} sub="sourcing" />
      </div>

      {!db ? (
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      ) : list.length === 0 ? (
        <EmptyState
          title="No POs yet"
          description="Add your first purchase order to start tracking materials and deliveries."
        />
      ) : (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <span className="label">Receiving queue · all POs</span>
            <span className="label">{formatUsdMinor(totalUsd)}</span>
          </div>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Project</th>
                    <th>Vendor</th>
                    <th>Order date</th>
                    <th>Expected</th>
                    <th className="num">Lines</th>
                    <th className="num">Total (USD)</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((p) => (
                    <tr key={p.id}>
                      <td className="font-mono text-xs">
                        <Link
                          href={`/development-os/materials/${p.poCode}`}
                          className="hover:underline"
                        >
                          {p.poCode}
                        </Link>
                      </td>
                      <td className="text-sm">{p.projectName ?? "—"}</td>
                      <td className="row-title">{p.vendorLegalName}</td>
                      <td className="text-xs">{p.orderDate}</td>
                      <td className="text-xs">
                        {p.expectedDeliveryDate ?? "—"}
                      </td>
                      <td className="num">{p.lineCount}</td>
                      <td className="num">
                        {formatUsdMinor(BigInt(p.totalAmountUsdMinor))}
                      </td>
                      <td>
                        <HandoffBadge tone={STATUS_TONE[p.status]}>
                          {MATERIAL_PO_STATUS_LABEL[p.status]}
                        </HandoffBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </DevelopmentShell>
  );
}
