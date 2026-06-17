import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Kpi, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getMaterialDeliveryDetail } from "@/lib/development/server/materials";
import { MATERIAL_QUALITY_LABEL } from "@/lib/development/constants/material-constants";
import { DeliveryQcControl } from "@/components/development/operations/delivery-qc-control";

export const metadata: Metadata = { title: "Delivery · Development OS" };
export const dynamic = "force-dynamic";

const QUALITY_TONE: Record<
  string,
  "ok" | "warn" | "danger" | "gold" | "info" | "ink" | undefined
> = {
  accepted: "ok",
  partial_acceptance: "warn",
  rejected: "danger",
};

export default async function MaterialDeliveryDetailPage({
  params,
}: {
  params: Promise<{ deliveryCode: string }>;
}) {
  const { deliveryCode } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <header className="page-header">
          <div className="left">
            <div className="crumb">Warehouse · receiving</div>
            <h1>Delivery</h1>
          </div>
        </header>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }

  const delivery = await getMaterialDeliveryDetail(
    decodeURIComponent(deliveryCode),
  );
  if (!delivery) notFound();

  const passedLines = delivery.lines.filter((l) => l.qualityCheckPassed).length;

  return (
    <DevelopmentShell>
      <header className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os/materials">Warehouse · receiving</Link>
            <span>/</span>
            <Link href="/development-os/materials/deliveries">Deliveries</Link>
            <span>/</span>
            <span>{delivery.deliveryCode}</span>
          </div>
          <h1>{delivery.deliveryCode}</h1>
          <div className="page-header-meta">
            <span>vendor {delivery.vendorLegalName}</span>
            <span>·</span>
            <span>received {delivery.deliveryDate}</span>
            <span>·</span>
            <span>
              PO{" "}
              <Link
                href={`/development-os/materials/${encodeURIComponent(delivery.poCode)}`}
                className="hover:underline"
              >
                {delivery.poCode}
              </Link>
            </span>
          </div>
        </div>
        <div className="actions">
          <Link
            href={`/development-os/materials/${encodeURIComponent(delivery.poCode)}`}
            className="btn btn-accent btn-sm"
          >
            View PO
          </Link>
          <Link
            href="/development-os/materials/deliveries"
            className="btn btn-dark btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            All deliveries
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          label="Quality check"
          value={MATERIAL_QUALITY_LABEL[delivery.qualityCheckStatus]}
          tone={
            delivery.qualityCheckStatus === "accepted"
              ? "success"
              : delivery.qualityCheckStatus === "rejected"
                ? "danger"
                : "warn"
          }
        />
        <Kpi label="Lines" value={String(delivery.lineCount)} />
        <Kpi
          label="Lines passed QC"
          value={`${passedLines}/${delivery.lines.length}`}
        />
        <Kpi
          label="Project"
          value={delivery.projectName ?? "—"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 items-start">
        <section className="flex flex-col gap-6 min-w-0">
          <div>
            <div className="label mb-3">
              Received lines · {delivery.lines.length}
            </div>
            {delivery.lines.length === 0 ? (
              <EmptyState
                title="No line items recorded"
                description="This delivery has no received lines."
              />
            ) : (
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Material</th>
                        <th>UoM</th>
                        <th className="num">Received</th>
                        <th>QC</th>
                        <th>Rejection reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {delivery.lines.map((l) => (
                        <tr key={l.id}>
                          <td className="font-mono text-xs">{l.lineNumber}</td>
                          <td className="row-title">{l.materialName}</td>
                          <td className="text-xs">{l.unitOfMeasure}</td>
                          <td className="num">
                            {Number(l.quantityReceived).toFixed(2)}
                          </td>
                          <td>
                            <HandoffBadge tone={l.qualityCheckPassed ? "ok" : "danger"}>
                              {l.qualityCheckPassed ? "Passed" : "Failed"}
                            </HandoffBadge>
                          </td>
                          <td className="text-xs text-ink-secondary">
                            {l.rejectionReason ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="label mb-3">Quality check</div>
            <div className="card px-[18px] py-[14px]">
              <DeliveryQcControl
                deliveryId={delivery.id}
                currentStatus={delivery.qualityCheckStatus}
                currentNotes={delivery.qualityNotes}
              />
            </div>
          </div>
        </section>

        <aside className="flex flex-col gap-6 min-w-0">
          <div>
            <div className="label mb-3">Delivery</div>
            <div className="card px-[18px] py-[14px]">
              <dl className="flex flex-col">
                <div className="flex justify-between gap-4 py-2 border-b border-line-soft text-sm">
                  <dt className="label">Code</dt>
                  <dd className="font-mono text-xs text-ink">
                    {delivery.deliveryCode}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 py-2 border-b border-line-soft text-sm">
                  <dt className="label">PO</dt>
                  <dd className="font-mono text-xs text-ink text-right">
                    {delivery.poCode}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 py-2 border-b border-line-soft text-sm">
                  <dt className="label">Vendor</dt>
                  <dd className="text-ink text-right">
                    {delivery.vendorLegalName}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 py-2 border-b border-line-soft text-sm">
                  <dt className="label">Delivered</dt>
                  <dd className="font-mono text-xs text-ink">
                    {delivery.deliveryDate}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 py-2 items-center text-sm">
                  <dt className="label">Status</dt>
                  <dd>
                    <HandoffBadge tone={QUALITY_TONE[delivery.qualityCheckStatus]}>
                      {MATERIAL_QUALITY_LABEL[delivery.qualityCheckStatus]}
                    </HandoffBadge>
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {delivery.notes ? (
            <div>
              <div className="label mb-3">Notes</div>
              <div className="card px-[18px] py-[14px] text-sm text-ink-secondary leading-relaxed">
                {delivery.notes}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </DevelopmentShell>
  );
}
