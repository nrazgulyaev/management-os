import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
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
        <PageHeader title="Material PO" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const po = await getMaterialPO(decodeURIComponent(poCode));
  if (!po) notFound();
  const util = await getMaterialUtilization(po.id);

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Materials", href: "/development-os/materials" },
          { label: po.poCode },
        ]}
        eyebrow={`${po.poCode} · ${po.vendorLegalName}`}
        title="Material purchase order"
        description={po.notes ?? undefined}
        actions={
          <div className="flex items-center gap-2">
            <Button asChild>
              <Link
                href={`/development-os/materials/${po.poCode}/deliveries/new`}
              >
                + Record delivery
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/development-os/materials">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                All POs
              </Link>
            </Button>
          </div>
        }
      />

      <Section eyebrow="Snapshot" title="Order details + utilization">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard
            label="Total (USD)"
            value={formatUsdMinor(BigInt(po.totalAmountUsdMinor))}
            hint={`${po.totalAmountCurrency} ${po.totalAmountOriginalMinor}`}
          />
          <MetricCard
            label="Lines"
            value={String(util.totalLines)}
            hint={`${util.totalQtyOrdered.toFixed(2)} ordered (sum)`}
          />
          <MetricCard
            label="Delivered"
            value={`${util.totalQtyDelivered.toFixed(2)}`}
            hint={`${util.outstandingQty.toFixed(2)} outstanding`}
          />
          <MetricCard
            label="Consumed"
            value={`${util.totalQtyConsumed.toFixed(2)}`}
          />
        </div>
        <div className="mt-3 flex items-center gap-3 text-xs">
          <Badge
            tone={
              po.status === "fully_delivered"
                ? "success"
                : po.status === "partially_delivered"
                  ? "info"
                  : po.status === "ordered"
                    ? "warning"
                    : "neutral"
            }
          >
            {MATERIAL_PO_STATUS_LABEL[po.status]}
          </Badge>
          <span className="text-ink-secondary">
            Ordered {po.orderDate} · Expected {po.expectedDeliveryDate ?? "—"}
          </span>
        </div>
      </Section>

      <Section eyebrow="Lines" title="Per-material breakdown">
        <Table>
          <THead>
            <TR>
              <TH>#</TH>
              <TH>Material</TH>
              <TH>Category</TH>
              <TH>UoM</TH>
              <TH>Ordered</TH>
              <TH>Delivered</TH>
              <TH>Consumed</TH>
              <TH>Line total (USD)</TH>
            </TR>
          </THead>
          <TBody>
            {po.lines.map((l) => (
              <TR key={l.id}>
                <TD className="font-mono text-xs">{l.lineNumber}</TD>
                <TD>{l.materialName}</TD>
                <TD className="text-xs text-ink-secondary">
                  {l.materialCategory ?? "—"}
                </TD>
                <TD className="text-xs">{l.unitOfMeasure}</TD>
                <TDNum>{Number(l.quantityOrdered).toFixed(2)}</TDNum>
                <TDNum>{Number(l.quantityDelivered).toFixed(2)}</TDNum>
                <TDNum>{Number(l.quantityConsumed).toFixed(2)}</TDNum>
                <TDNum>
                  {l.lineTotalUsdMinor
                    ? formatUsdMinor(BigInt(l.lineTotalUsdMinor))
                    : "—"}
                </TDNum>
              </TR>
            ))}
          </TBody>
        </Table>
      </Section>

      {po.deliveries.length > 0 && (
        <Section eyebrow="Deliveries" title="Receipt events">
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Date</TH>
                <TH>Quality</TH>
              </TR>
            </THead>
            <TBody>
              {po.deliveries.map((d) => (
                <TR key={d.id}>
                  <TD className="font-mono text-xs">{d.deliveryCode}</TD>
                  <TD className="text-xs">{d.deliveryDate}</TD>
                  <TD>
                    <Badge
                      tone={
                        d.qualityCheckStatus === "accepted"
                          ? "success"
                          : d.qualityCheckStatus === "partial_acceptance"
                            ? "warning"
                            : d.qualityCheckStatus === "rejected"
                              ? "danger"
                              : "neutral"
                      }
                    >
                      {MATERIAL_QUALITY_LABEL[d.qualityCheckStatus]}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Section>
      )}
    </DevelopmentShell>
  );
}
