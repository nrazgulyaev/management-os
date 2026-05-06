import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
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
        <PageHeader title="Quotation comparison" />
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
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          {
            label: "Purchase requests",
            href: "/development-os/procurement/purchase-requests",
          },
          {
            label: request.requestCode,
            href: `/development-os/procurement/purchase-requests/${encodeURIComponent(request.requestCode)}`,
          },
          { label: "Compare" },
        ]}
        title={`Compare quotations: ${request.requestCode}`}
        description={`${request.materialName} · ${request.quantity} ${request.unitOfMeasure} · required by ${request.requiredByDate}`}
        actions={
          <Button asChild variant="secondary">
            <Link
              href={`/development-os/procurement/purchase-requests/${encodeURIComponent(request.requestCode)}`}
            >
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Back to request
            </Link>
          </Button>
        }
      />

      {quotations.length === 0 ? (
        <EmptyState
          title="No quotations to compare"
          description="Add quotations via the addQuotation server action."
        />
      ) : (
        <Section eyebrow="Side-by-side" title={`${quotations.length} quote${quotations.length === 1 ? "" : "s"}`}>
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
                  className={`rounded-lg border p-4 ${
                    isSelected
                      ? "border-success bg-success/5"
                      : "border-line-soft bg-surface"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium">
                      {vendor?.name ?? q.vendorId.slice(0, 8)}
                    </h4>
                    <Badge tone={isSelected ? "success" : "neutral"}>
                      {q.status}
                    </Badge>
                  </div>
                  <div className="flex items-baseline gap-2 mb-3">
                    <div className="text-2xl font-semibold">
                      {(Number(q.totalAmountMinor) / 100).toLocaleString()}
                    </div>
                    <div className="text-sm text-ink-tertiary">{q.currency}</div>
                    {isLowest && (
                      <Badge tone="success">Lowest price</Badge>
                    )}
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-xs mb-3">
                    <div>
                      <dt className="text-ink-tertiary">Quote #</dt>
                      <dd>{q.quotationNumber ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-tertiary">Quoted at</dt>
                      <dd>{q.quotedAt}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-tertiary">Valid until</dt>
                      <dd>{q.validityUntil ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-tertiary">Delivery</dt>
                      <dd>
                        {q.deliveryEstimatedDate ?? "—"}{" "}
                        {isEarliest && (
                          <Badge tone="success">Earliest</Badge>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-tertiary">Payment terms</dt>
                      <dd>{q.paymentTerms ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-tertiary">Vendor on-time</dt>
                      <dd>
                        {vendor?.onTimeRate
                          ? `${Number(vendor.onTimeRate).toFixed(1)}%`
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-tertiary">Vendor quality</dt>
                      <dd>
                        {vendor?.qualityRating
                          ? `${Number(vendor.qualityRating).toFixed(2)}/5`
                          : "—"}
                      </dd>
                    </div>
                  </dl>
                  {!isSelected && q.status !== "rejected" && (
                    <QuotationSelectButton quotationId={q.id} />
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </DevelopmentShell>
  );
}
