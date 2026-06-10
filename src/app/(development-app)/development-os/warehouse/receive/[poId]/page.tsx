import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { requireInternalUser } from "@/features/auth/permissions";
import { getWarehouseReceiveDetail } from "@/lib/development/server/warehouse/warehouse-inbound-queries";
import {
  MATERIAL_PO_STATUS_LABEL,
  type MaterialPoStatus,
} from "@/lib/development/constants/material-constants";
import { ReceivePoForm } from "@/components/development/warehouse/receive-po-form";

export const metadata: Metadata = { title: "Receive PO · Warehouse" };
export const dynamic = "force-dynamic";

const PO_STATUS_TONE: Record<
  MaterialPoStatus,
  "info" | "success" | "warning" | "danger" | "neutral"
> = {
  draft: "neutral",
  ordered: "info",
  partially_delivered: "warning",
  fully_delivered: "success",
  cancelled: "neutral",
};

/** QC chain (mock §03): receive → inspect → photograph → putaway. */
const QC_STEPS = ["receive", "inspect", "photograph", "putaway"] as const;

export default async function WarehouseReceivePage({
  params,
}: {
  params: Promise<{ poId: string }>;
}) {
  await requireInternalUser();
  const { poId } = await params;

  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader
          breadcrumbs={[
            { label: "Development OS", href: "/development-os" },
            { label: "Warehouse", href: "/development-os/warehouse" },
            { label: "Receive" },
          ]}
          title="Receive purchase order"
        />
        <EmptyState
          variant="error"
          title="Database not configured"
          body="Set DATABASE_URL to load the receiving workbench."
        />
      </DevelopmentShell>
    );
  }

  const detail = await getWarehouseReceiveDetail(decodeURIComponent(poId));
  if (!detail) notFound();

  const closed = detail.status === "fully_delivered" || detail.status === "cancelled";
  // The active QC step = first stage not yet complete. Once fully received
  // the chain is done; otherwise it sits at "inspect" pending the dock call.
  const activeStepIndex = closed ? QC_STEPS.length : 1;

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Warehouse", href: "/development-os/warehouse" },
          { label: "Receiving", href: "/development-os/warehouse/stock" },
          { label: detail.poCode },
        ]}
        eyebrow={`${detail.vendorLegalName}${detail.projectName ? ` · ${detail.projectName}` : ""}`}
        title={`Receive ${detail.poCode}`}
        description="Run the QC chain line by line, then receive into stock. QC-passed lines with a matching SKU post a received movement and credit on-hand; the PO delivered total + status update atomically. Audit-logged; payment stays in its own manual flow."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/warehouse">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Warehouse
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={PO_STATUS_TONE[detail.status] ?? "neutral"}>
          {MATERIAL_PO_STATUS_LABEL[detail.status] ?? detail.status}
        </Badge>
        <Badge tone="outline">Ordered {detail.orderDate}</Badge>
        {detail.expectedDeliveryDate && (
          <Badge tone="outline">ETA {detail.expectedDeliveryDate}</Badge>
        )}
        <Badge tone={detail.outstandingQty > 0 ? "warning" : "success"}>
          {detail.outstandingQty.toFixed(2)} outstanding
        </Badge>
        <Badge tone="outline">
          {detail.lines.length} line{detail.lines.length === 1 ? "" : "s"}
        </Badge>
      </div>

      <Section
        eyebrow="QC chain"
        title="Dock → inspect → photograph → putaway"
        description="The four-step receiving chain. Receiving here advances the PO; photo + bin putaway land with the bins schema (mock §02 variant C)."
      >
        <div className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-5 md:p-6">
          <ol className="flex flex-wrap items-center gap-x-3 gap-y-3">
            {QC_STEPS.map((step, i) => {
              const state =
                i < activeStepIndex
                  ? "done"
                  : i === activeStepIndex
                    ? "active"
                    : "pending";
              return (
                <li key={step} className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] font-mono">
                    <span
                      className={
                        "w-2.5 h-2.5 rounded-full " +
                        (state === "done"
                          ? "bg-success"
                          : state === "active"
                            ? "bg-accent ring-4 ring-accent-weak"
                            : "bg-line-strong")
                      }
                      aria-hidden
                    />
                    <span
                      className={
                        state === "pending"
                          ? "text-ink-tertiary"
                          : "text-ink-secondary"
                      }
                    >
                      {step}
                    </span>
                  </span>
                  {i < QC_STEPS.length - 1 && (
                    <span className="text-ink-tertiary" aria-hidden>
                      →
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-6">
        <Section
          eyebrow="Receive"
          title="Line items"
          description="Received-qty vs ordered, per-line QC pass/fail. Hold a line to record arrival without posting stock."
        >
          {detail.lines.length === 0 ? (
            <EmptyState
              variant="caught-up"
              title="No lines on this PO"
              body="Nothing to receive."
            />
          ) : (
            <ReceivePoForm
              poId={detail.poId}
              poCode={detail.poCode}
              disabled={closed}
              lines={detail.lines.map((l) => ({
                id: l.id,
                lineNumber: l.lineNumber,
                materialName: l.materialName,
                unitOfMeasure: l.unitOfMeasure,
                quantityOrdered: l.quantityOrdered,
                quantityDelivered: l.quantityDelivered,
                outstanding: l.outstanding,
                matchedSku: l.matchedSku,
              }))}
              locations={detail.warehouseLocations}
            />
          )}
        </Section>

        <Section eyebrow="Vendor + delivery" title="Metadata">
          <dl className="rounded-3xl border border-line-soft bg-surface shadow-soft-card divide-y divide-line-soft">
            {[
              { k: "PO code", v: detail.poCode, mono: true },
              { k: "Vendor", v: detail.vendorLegalName },
              { k: "Vendor code", v: detail.vendorCode, mono: true },
              { k: "Project", v: detail.projectName ?? "—" },
              { k: "Ordered", v: detail.orderDate, mono: true },
              { k: "Expected", v: detail.expectedDeliveryDate ?? "—", mono: true },
              {
                k: "Total",
                v:
                  detail.totalAmountUsdMinor != null
                    ? `${(Number(detail.totalAmountUsdMinor) / 100).toLocaleString()} ${detail.totalAmountCurrency}`
                    : "—",
                mono: true,
              },
              {
                k: "Received at",
                v: detail.receivedAt
                  ? new Date(detail.receivedAt).toLocaleString()
                  : "—",
                mono: true,
              },
            ].map((row) => (
              <div
                key={row.k}
                className="grid grid-cols-[120px_1fr] gap-3 px-4 py-3 text-sm"
              >
                <dt className="text-[11px] uppercase tracking-[0.1em] text-ink-tertiary font-mono">
                  {row.k}
                </dt>
                <dd
                  className={
                    "text-ink " + (row.mono ? "font-mono text-xs break-all" : "")
                  }
                >
                  {row.v}
                </dd>
              </div>
            ))}
          </dl>
          {detail.notes && (
            <p className="mt-3 rounded-2xl border border-line-soft bg-muted/40 px-4 py-3 text-sm text-ink-secondary leading-relaxed">
              {detail.notes}
            </p>
          )}
        </Section>
      </div>
    </DevelopmentShell>
  );
}
