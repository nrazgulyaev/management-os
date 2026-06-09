import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Kpi, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import {
  getMaterialPO,
  getMaterialUtilization,
} from "@/lib/development/server/materials";
import {
  MATERIAL_PO_STATUS_LABEL,
  MATERIAL_QUALITY_LABEL,
} from "@/lib/development/constants/material-constants";
import { formatUsdMinor } from "@/lib/development/constants/investor-constants";

export const metadata: Metadata = { title: "PO · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<
  string,
  "ok" | "warn" | "danger" | "gold" | "info" | "ink" | undefined
> = {
  fully_delivered: "ok",
  partially_delivered: "info",
  ordered: "warn",
};

const QUALITY_TONE: Record<
  string,
  "ok" | "warn" | "danger" | "gold" | "info" | "ink" | undefined
> = {
  accepted: "ok",
  partial_acceptance: "warn",
  rejected: "danger",
};

export default async function MaterialPoDetailPage({
  params,
}: {
  params: Promise<{ poCode: string }>;
}) {
  const { poCode } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <header className="page-header">
          <div className="left">
            <div className="crumb">Warehouse · receiving</div>
            <h1>Material PO</h1>
          </div>
        </header>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const po = await getMaterialPO(decodeURIComponent(poCode));
  if (!po) notFound();
  const util = await getMaterialUtilization(po.id);

  return (
    <DevelopmentShell>
      <header className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os/materials">Warehouse · receiving</Link>
            <span>/</span>
            <span>{po.poCode}</span>
          </div>
          <h1>
            {po.poCode}{" "}
            <em>· {MATERIAL_PO_STATUS_LABEL[po.status].toLowerCase()}</em>
          </h1>
          <div className="page-header-meta">
            <span>vendor {po.vendorLegalName}</span>
            <span>·</span>
            <span>ordered {po.orderDate}</span>
            <span>·</span>
            <span>expected {po.expectedDeliveryDate ?? "—"}</span>
            <span>·</span>
            <span>total {formatUsdMinor(BigInt(po.totalAmountUsdMinor))}</span>
          </div>
        </div>
        <div className="actions">
          <Link
            href={`/development-os/materials/${po.poCode}/deliveries/new`}
            className="btn btn-accent btn-sm"
          >
            + Record delivery
          </Link>
          <Link href="/development-os/materials" className="btn btn-dark btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            All POs
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          label="Total (USD)"
          value={formatUsdMinor(BigInt(po.totalAmountUsdMinor))}
          sub={`${po.totalAmountCurrency} ${po.totalAmountOriginalMinor}`}
          tone="accent"
        />
        <Kpi
          label="Lines"
          value={String(util.totalLines)}
          sub={`${util.totalQtyOrdered.toFixed(2)} ordered`}
        />
        <Kpi
          label="Delivered"
          value={util.totalQtyDelivered.toFixed(2)}
          sub={`${util.outstandingQty.toFixed(2)} outstanding`}
          tone={util.outstandingQty > 0 ? "warn" : "success"}
        />
        <Kpi label="Consumed" value={util.totalQtyConsumed.toFixed(2)} sub="on site" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 items-start">
        <section className="flex flex-col gap-6 min-w-0">
          <div>
            <div className="label mb-3">Line items · {po.lines.length} SKUs</div>
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="data">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Material</th>
                      <th>UoM</th>
                      <th className="num">Ordered</th>
                      <th className="num">Recv</th>
                      <th className="num">Diff</th>
                      <th className="num">Consumed</th>
                      <th className="num">Line total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {po.lines.map((l) => {
                      const ordered = Number(l.quantityOrdered);
                      const delivered = Number(l.quantityDelivered);
                      const diff = delivered - ordered;
                      return (
                        <tr key={l.id}>
                          <td className="font-mono text-xs">{l.lineNumber}</td>
                          <td className="row-title">
                            {l.materialName}
                            {l.materialCategory ? (
                              <span className="block text-xs text-ink-tertiary font-normal">
                                {l.materialCategory}
                              </span>
                            ) : null}
                          </td>
                          <td className="text-xs">{l.unitOfMeasure}</td>
                          <td className="num">{ordered.toFixed(2)}</td>
                          <td className="num">{delivered.toFixed(2)}</td>
                          <td className={diff < 0 ? "num text-danger" : "num"}>
                            {diff > 0 ? "+" : ""}
                            {diff.toFixed(2)}
                          </td>
                          <td className="num">
                            {Number(l.quantityConsumed).toFixed(2)}
                          </td>
                          <td className="num">
                            {l.lineTotalUsdMinor
                              ? formatUsdMinor(BigInt(l.lineTotalUsdMinor))
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {po.deliveries.length > 0 && (
            <div>
              <div className="label mb-3">Receipt events · QC chain</div>
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Date</th>
                        <th>Quality check</th>
                      </tr>
                    </thead>
                    <tbody>
                      {po.deliveries.map((d) => (
                        <tr key={d.id}>
                          <td className="font-mono text-xs">{d.deliveryCode}</td>
                          <td className="text-xs">{d.deliveryDate}</td>
                          <td>
                            <HandoffBadge tone={QUALITY_TONE[d.qualityCheckStatus]}>
                              {MATERIAL_QUALITY_LABEL[d.qualityCheckStatus]}
                            </HandoffBadge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-6 min-w-0">
          <div>
            <div className="label mb-3">Vendor + order</div>
            <div className="card px-[18px] py-[14px]">
              <dl className="flex flex-col">
                <div className="flex justify-between gap-4 py-2 border-b border-line-soft text-sm">
                  <dt className="label">PO id</dt>
                  <dd className="font-mono text-xs text-ink">{po.poCode}</dd>
                </div>
                <div className="flex justify-between gap-4 py-2 border-b border-line-soft text-sm">
                  <dt className="label">Vendor</dt>
                  <dd className="text-ink text-right">{po.vendorLegalName}</dd>
                </div>
                <div className="flex justify-between gap-4 py-2 border-b border-line-soft text-sm">
                  <dt className="label">Ordered</dt>
                  <dd className="font-mono text-xs text-ink">{po.orderDate}</dd>
                </div>
                <div className="flex justify-between gap-4 py-2 border-b border-line-soft text-sm">
                  <dt className="label">Expected</dt>
                  <dd className="font-mono text-xs text-ink">
                    {po.expectedDeliveryDate ?? "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 py-2 items-center text-sm">
                  <dt className="label">Status</dt>
                  <dd>
                    <HandoffBadge tone={STATUS_TONE[po.status]}>
                      {MATERIAL_PO_STATUS_LABEL[po.status]}
                    </HandoffBadge>
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {po.notes ? (
            <div>
              <div className="label mb-3">Notes</div>
              <div className="card px-[18px] py-[14px] text-sm text-ink-secondary leading-relaxed">
                {po.notes}
              </div>
            </div>
          ) : null}

          <div>
            <div className="label mb-3">Actions</div>
            <div className="flex flex-col gap-2">
              <Link
                href={`/development-os/materials/${po.poCode}/deliveries/new`}
                className="btn btn-accent justify-center w-full"
              >
                Record delivery
              </Link>
              <Link
                href="/development-os/materials/deliveries"
                className="btn btn-dark justify-center w-full"
              >
                All deliveries
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </DevelopmentShell>
  );
}
