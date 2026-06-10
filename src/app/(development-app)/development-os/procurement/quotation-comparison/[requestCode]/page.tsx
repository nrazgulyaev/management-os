import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { devOsPurchaseRequests } from "@/lib/db/schema/procurement";
import { vendors } from "@/lib/db/schema/site-operations";
import { getPurchaseRequest } from "@/lib/development/server/procurement/procurement-actions";
import { QuotationSelectButton } from "@/components/development/procurement/quotation-select-button";

export const metadata: Metadata = {
  title: "Quotation comparison · Development OS",
};
export const dynamic = "force-dynamic";

export default async function QuotationComparisonPage({
  params,
}: {
  params: Promise<{ requestCode: string }>;
}) {
  const { requestCode } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <header className="page-header">
          <div className="left">
            <div className="crumb">Buyer · supply</div>
            <h1>Quotation comparison</h1>
          </div>
        </header>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const [pr] = await db
    .select()
    .from(devOsPurchaseRequests)
    .where(eq(devOsPurchaseRequests.requestCode, decodeURIComponent(requestCode)))
    .limit(1);
  if (!pr) notFound();
  const data = await getPurchaseRequest(pr.id);
  if (!data) notFound();
  const { request, quotations } = data;

  // Vendor name + performance lookup.
  const vendorIds = [...new Set(quotations.map((q) => q.vendorId))];
  const vendorRows = vendorIds.length
    ? await db
        .select({
          id: vendors.id,
          name: vendors.legalName,
          onTimeRate: vendors.onTimeDeliveryRate,
          qualityRating: vendors.qualityRating,
        })
        .from(vendors)
    : [];
  const vendorById = new Map(vendorRows.map((v) => [v.id, v]));

  // Find lowest price + earliest delivery to highlight.
  const lowestPrice = quotations.reduce<bigint | null>(
    (lowest, q) =>
      lowest === null || BigInt(q.totalAmountMinor) < lowest
        ? BigInt(q.totalAmountMinor)
        : lowest,
    null,
  );
  const earliestDelivery = quotations
    .map((q) => q.deliveryEstimatedDate)
    .filter((d): d is string => Boolean(d))
    .sort()[0] ?? null;

  return (
    <DevelopmentShell>
      <header className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os/procurement/purchase-requests">
              Purchase requests
            </Link>
            <span>/</span>
            <Link
              href={`/development-os/procurement/purchase-requests/${encodeURIComponent(request.requestCode)}`}
            >
              {request.requestCode}
            </Link>
            <span>·</span>
            <span>Compare</span>
          </div>
          <h1>Compare quotations: {request.requestCode}</h1>
          <div className="text-[13px] text-ink-3 mt-1.5">
            {request.materialName} · {request.quantity} {request.unitOfMeasure} ·
            required by {request.requiredByDate}
          </div>
        </div>
        <div className="actions">
          <Link
            href={`/development-os/procurement/purchase-requests/${encodeURIComponent(request.requestCode)}`}
            className="btn btn-dark btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Back to request
          </Link>
        </div>
      </header>

      {quotations.length === 0 ? (
        <EmptyState
          title="No quotations to compare"
          description="Add quotations via the addQuotation server action."
        />
      ) : (
        <div>
          <div className="text-[10.5px] font-mono uppercase tracking-[0.16em] text-ink-4 leading-[1.5] mb-1">
            Side-by-side
          </div>
          <h2 className="text-display text-[18px] font-semibold leading-tight tracking-[-0.01em] text-ink mb-3">
            {quotations.length} quote{quotations.length === 1 ? "" : "s"}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {quotations.map((q) => {
              const vendor = vendorById.get(q.vendorId);
              const isLowest = BigInt(q.totalAmountMinor) === lowestPrice;
              const isEarliest =
                q.deliveryEstimatedDate === earliestDelivery && earliestDelivery;
              const isSelected = q.status === "selected";
              return (
                <div
                  key={q.id}
                  className={`rounded-[14px] border p-5 transition-shadow ${
                    isSelected
                      ? "border-amber ring-1 ring-inset ring-amber/40 bg-amber/[0.04]"
                      : "border-line-2 bg-panel hover:shadow-soft-card"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h4 className="text-display text-[16px] font-semibold leading-tight tracking-[-0.01em] text-ink truncate">
                      {vendor?.name ?? q.vendorId.slice(0, 8)}
                    </h4>
                    <Badge tone={isSelected ? "accent" : "neutral"}>
                      {q.status}
                    </Badge>
                  </div>

                  {/* Vendor scorecard strip (vendor_scores-backed). */}
                  <div className="flex items-center gap-3 mb-3 rounded-[10px] border border-line-soft bg-bg-2 px-3 py-2">
                    <ScoreStat
                      label="On-time"
                      value={
                        vendor?.onTimeRate
                          ? `${Number(vendor.onTimeRate).toFixed(0)}%`
                          : "—"
                      }
                    />
                    <span className="w-px h-7 bg-line-2" />
                    <ScoreStat
                      label="Quality"
                      value={
                        vendor?.qualityRating
                          ? `${Number(vendor.qualityRating).toFixed(1)}/5`
                          : "—"
                      }
                    />
                  </div>

                  <div className="flex items-baseline gap-2 mb-1">
                    <div className="text-display font-mono tabular-nums text-[28px] leading-none font-medium text-ink">
                      {(Number(q.totalAmountMinor) / 100).toLocaleString()}
                    </div>
                    <div className="text-sm text-ink-3">{q.currency}</div>
                  </div>
                  <div className="flex items-center gap-1.5 mb-3 min-h-[20px]">
                    {isLowest && <Badge tone="accent">Lowest price</Badge>}
                    {isEarliest && <Badge tone="info">Earliest delivery</Badge>}
                  </div>

                  <dl className="grid grid-cols-2 gap-y-2 gap-x-3 text-xs mb-4">
                    <CardField label="Quote #" value={q.quotationNumber ?? "—"} />
                    <CardField label="Quoted at" value={q.quotedAt} />
                    <CardField
                      label="Valid until"
                      value={q.validityUntil ?? "—"}
                    />
                    <CardField
                      label="Delivery"
                      value={q.deliveryEstimatedDate ?? "—"}
                    />
                    <CardField
                      label="Payment terms"
                      value={q.paymentTerms ?? "—"}
                    />
                  </dl>
                  {!isSelected && q.status !== "rejected" && (
                    <QuotationSelectButton quotationId={q.id} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </DevelopmentShell>
  );
}

function ScoreStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9.5px] font-mono uppercase tracking-[0.14em] text-ink-4">
        {label}
      </span>
      <span className="font-mono tabular-nums text-[15px] font-medium text-ink leading-tight">
        {value}
      </span>
    </div>
  );
}

function CardField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-mono uppercase tracking-[0.1em] text-ink-4">
        {label}
      </dt>
      <dd className="text-ink mt-0.5">{value}</dd>
    </div>
  );
}
