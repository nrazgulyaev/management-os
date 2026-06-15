import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { Kpi, Card } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import {
  materialPurchaseOrders,
  materialPoLines,
  materialDeliveries,
  vendors,
} from "@/lib/db/schema/site-operations";
import { projects } from "@/lib/db/schema/projects";
import { getBankAccounts } from "@/lib/development/server/bank-accounts";
import {
  MATERIAL_PO_STATUS_LABEL,
  MATERIAL_PO_PAYMENT_STATUS_LABEL,
  materialPoPaymentStatusTone,
  type MaterialPoStatus,
  type MaterialPoPaymentStatus,
} from "@/lib/development/constants/material-constants";
import {
  formatCurrencyMinor,
  formatUsdMinor,
  type SupportedCurrency,
} from "@/lib/development/constants/investor-constants";
import {
  PlaceOrderControl,
  ConfirmReceiptControl,
  MarkPoPaidControl,
  type BankAccountChoice,
} from "./_controls";

/**
 * Procurement — purchase order detail. Real reads against
 * `material_purchase_orders` (+ lines, deliveries) with the procure-to-pay
 * money lifecycle wired on: place order → confirm receipt → MANUAL pay.
 * (Was a hardcoded MOCK constant before P0 procurement-money.)
 */

export const dynamic = "force-dynamic";

function poStatusTone(status: string): "neutral" | "warning" | "success" | "danger" {
  if (status === "fully_delivered") return "success";
  if (status === "partially_delivered" || status === "ordered") return "warning";
  if (status === "cancelled") return "danger";
  return "neutral";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const db = getDb();
  if (!db) return { title: "Purchase order · Development OS" };
  const [po] = await db
    .select({ poCode: materialPurchaseOrders.poCode })
    .from(materialPurchaseOrders)
    .where(eq(materialPurchaseOrders.id, id))
    .limit(1);
  return { title: po ? `${po.poCode} · Development OS` : "Purchase order" };
}

export default async function PoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os">Development OS</Link> /{" "}
              <Link href="/development-os/cabinets/procurement-manager">
                Procurement
              </Link>{" "}
              /{" "}
              <Link href="/development-os/cabinets/procurement-manager/pos">
                POs
              </Link>{" "}
              / <span>Detail</span>
            </div>
            <h1>Purchase order</h1>
          </div>
        </div>
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL to view purchase order details."
          action={<Badge tone="warning">DATABASE_URL not set</Badge>}
        />
      </DevelopmentShell>
    );
  }

  const [po] = await db
    .select()
    .from(materialPurchaseOrders)
    .where(eq(materialPurchaseOrders.id, id))
    .limit(1);
  if (!po) notFound();

  const [project] = await db
    .select({ name: projects.name })
    .from(projects)
    .where(eq(projects.id, po.projectId))
    .limit(1);
  const [vendor] = await db
    .select({ name: vendors.legalName })
    .from(vendors)
    .where(eq(vendors.id, po.vendorId))
    .limit(1);

  const lines = await db
    .select()
    .from(materialPoLines)
    .where(eq(materialPoLines.poId, po.id))
    .orderBy(asc(materialPoLines.lineNumber));

  const deliveries = await db
    .select()
    .from(materialDeliveries)
    .where(eq(materialDeliveries.poId, po.id))
    .orderBy(desc(materialDeliveries.deliveryDate));

  const currency = po.totalAmountCurrency as SupportedCurrency;
  const totalUsdMinor = BigInt(po.totalAmountUsdMinor);
  const totalOriginalMinor = BigInt(po.totalAmountOriginalMinor);
  const paidUsdMinor = BigInt(po.paidAmountUsdMinor);
  const remainingUsdMinor =
    totalUsdMinor - paidUsdMinor > 0n ? totalUsdMinor - paidUsdMinor : 0n;
  const paidPercent =
    totalUsdMinor > 0n
      ? Number((paidUsdMinor * 1000n) / totalUsdMinor) / 10
      : 0;

  // Outstanding in the PO's ORIGINAL currency (what the operator pays in),
  // derived proportionally from the USD remaining — kept conservative (>= 0).
  const remainingOriginalMinor =
    totalUsdMinor > 0n
      ? (totalOriginalMinor * remainingUsdMinor) / totalUsdMinor
      : 0n;

  const bankAccounts = await getBankAccounts();
  const bankChoices: BankAccountChoice[] = bankAccounts.map((b) => ({
    id: b.id,
    label: `${b.accountCode} · ${b.accountName}`,
    currency: b.currency,
  }));

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/cabinets/procurement-manager">
              Procurement
            </Link>{" "}
            /{" "}
            <Link href="/development-os/cabinets/procurement-manager/pos">
              POs
            </Link>{" "}
            / <span>{po.poCode}</span>
          </div>
          <h1>{po.poCode}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {vendor?.name ?? "Vendor"}
            {project ? ` · ${project.name}` : ""} · Ordered {po.orderDate}
            {po.expectedDeliveryDate
              ? ` · expected ${po.expectedDeliveryDate}`
              : ""}
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/cabinets/procurement-manager/pos"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            All POs
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Terms</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi
            label="Total"
            value={formatCurrencyMinor(totalOriginalMinor, currency)}
            sub={`≈ ${formatUsdMinor(totalUsdMinor)} at FX ${po.fxRateAtOrder}`}
          />
          <Kpi
            label="Paid"
            value={formatUsdMinor(paidUsdMinor)}
            sub={`${paidPercent.toFixed(1)}% of total`}
          />
          <Kpi
            label="Outstanding"
            value={formatUsdMinor(remainingUsdMinor)}
            sub="Balance to pay"
          />
          <Kpi
            label="Lines"
            value={String(lines.length)}
            sub={`${deliveries.length} deliveries`}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-ink-secondary">
          <Badge tone={poStatusTone(po.status)}>
            {MATERIAL_PO_STATUS_LABEL[po.status as MaterialPoStatus] ??
              po.status}
          </Badge>
          <Badge tone={materialPoPaymentStatusTone(po.paymentStatus)}>
            {MATERIAL_PO_PAYMENT_STATUS_LABEL[
              po.paymentStatus as MaterialPoPaymentStatus
            ] ?? po.paymentStatus}
          </Badge>
          <span>Order date: {po.orderDate}</span>
          {po.placedAt && (
            <span>Placed: {po.placedAt.toISOString().slice(0, 10)}</span>
          )}
          {po.receivedAt && (
            <span>Received: {po.receivedAt.toISOString().slice(0, 10)}</span>
          )}
        </div>
        {po.notes && (
          <p className="mt-3 text-xs text-ink-secondary whitespace-pre-wrap">
            {po.notes}
          </p>
        )}
      </div>

      <div>
        <div className="label mb-2.5">Lifecycle</div>
        <p className="text-[13px] text-ink-3 mb-3 max-w-[680px]">
          Drive the procure-to-pay money lifecycle. Mark-paid is MANUAL (PSP
          deferred — Indonesia rails land at launch); paying records an outflow
          transaction against this PO and advances its payment status.
        </p>
        <Card padding="default">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="rounded-md border border-line-soft p-4 flex flex-col gap-3">
              <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
                Place order
              </div>
              <PlaceOrderControl poId={po.id} status={po.status} />
            </div>
            <div className="rounded-md border border-line-soft p-4 flex flex-col gap-3">
              <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
                Confirm receipt
              </div>
              <ConfirmReceiptControl poId={po.id} status={po.status} />
            </div>
            <div className="rounded-md border border-line-soft p-4 flex flex-col gap-3">
              <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
                Record manual payment
              </div>
              <MarkPoPaidControl
                poId={po.id}
                currency={currency}
                remainingMinor={remainingOriginalMinor.toString()}
                bankAccounts={bankChoices}
                paymentStatus={po.paymentStatus}
                status={po.status}
              />
            </div>
          </div>
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Line items</div>
        {lines.length === 0 ? (
          <EmptyState
            title="No line items"
            description="This purchase order has no material lines."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>#</TH>
                <TH>Material</TH>
                <TH>Category</TH>
                <TH>Unit</TH>
                <TH>Ordered</TH>
                <TH>Delivered</TH>
                <TH>Line total (USD)</TH>
              </TR>
            </THead>
            <TBody>
              {lines.map((l) => (
                <TR key={l.id}>
                  <TD className="font-mono text-xs">{l.lineNumber}</TD>
                  <TD className="text-xs">{l.materialName}</TD>
                  <TD className="text-xs text-ink-secondary">
                    {l.materialCategory ?? "—"}
                  </TD>
                  <TD className="text-xs">{l.unitOfMeasure}</TD>
                  <TDNum>{Number(l.quantityOrdered).toLocaleString()}</TDNum>
                  <TDNum>{Number(l.quantityDelivered).toLocaleString()}</TDNum>
                  <TDNum>
                    {formatUsdMinor(
                      l.lineTotalUsdMinor
                        ? BigInt(l.lineTotalUsdMinor)
                        : BigInt(l.unitPriceUsdMinor) *
                            BigInt(Math.round(Number(l.quantityOrdered))),
                    )}
                  </TDNum>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>

      <div>
        <div className="label mb-2.5">Deliveries</div>
        {deliveries.length === 0 ? (
          <EmptyState
            title="No deliveries yet"
            description="Deliveries recorded against this PO will appear here."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Date</TH>
                <TH>Quality</TH>
                <TH>Notes</TH>
              </TR>
            </THead>
            <TBody>
              {deliveries.map((d) => (
                <TR key={d.id}>
                  <TD className="font-mono text-xs">{d.deliveryCode}</TD>
                  <TD className="text-xs">{d.deliveryDate}</TD>
                  <TD className="text-xs">{d.qualityCheckStatus}</TD>
                  <TD className="text-xs text-ink-secondary">
                    {d.notes ?? "—"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </DevelopmentShell>
  );
}
