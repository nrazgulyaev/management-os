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
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { DevOsPurchaseRequestActions } from "@/components/development/procurement/request-actions";
import { getDb } from "@/lib/db/client";
import { devOsPurchaseRequests } from "@/lib/db/schema/procurement";
import { getPurchaseRequest } from "@/lib/development/server/procurement/procurement-actions";
import { getCurrentUserContext } from "@/features/auth/permissions";

export const metadata: Metadata = {
  title: "Purchase request · Development OS",
};
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "success" | "warning" | "danger" | "neutral"> = {
  draft: "neutral",
  submitted: "info",
  approved: "success",
  quotations_in_progress: "warning",
  quotation_selected: "info",
  po_created: "success",
  rejected: "danger",
  cancelled: "neutral",
};

const URGENCY_TONE: Record<string, "info" | "success" | "warning" | "danger" | "neutral"> = {
  low: "neutral",
  normal: "info",
  high: "warning",
  critical: "danger",
};

export default async function PurchaseRequestDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Purchase request" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  // Resolve request_code → id, then load.
  const [pr] = await db
    .select()
    .from(devOsPurchaseRequests)
    .where(eq(devOsPurchaseRequests.requestCode, decodeURIComponent(code)))
    .limit(1);
  if (!pr) notFound();
  const data = await getPurchaseRequest(pr.id);
  if (!data) notFound();
  const { request, quotations } = data;
  const ctx = await getCurrentUserContext();
  // Threshold-based check happens server-side; UI gates by role membership.
  const canApprove = ctx.roles.some((r) =>
    [
      "super_admin",
      "director",
      "finance_manager",
      "operations_manager",
      "procurement_manager",
    ].includes(r),
  );

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          {
            label: "Purchase requests",
            href: "/development-os/procurement/purchase-requests",
          },
          { label: request.requestCode },
        ]}
        eyebrow={`${request.materialName} · ${request.quantity} ${request.unitOfMeasure}`}
        title={request.requestCode}
        description={request.reason}
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/procurement/purchase-requests">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              All requests
            </Link>
          </Button>
        }
      />

      <Section eyebrow="State" title="Status + urgency">
        <div className="flex items-center gap-2 mb-4">
          <Badge tone={STATUS_TONE[request.status] ?? "neutral"}>
            {request.status}
          </Badge>
          <Badge tone={URGENCY_TONE[request.urgency] ?? "neutral"}>
            {request.urgency}
          </Badge>
          <span className="text-sm text-ink-secondary">
            Required by {request.requiredByDate}
          </span>
        </div>
        <DevOsPurchaseRequestActions
          requestId={request.id}
          status={request.status}
          canApprove={canApprove}
        />
      </Section>

      <Section eyebrow="What's needed" title="Material">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <Field label="Material" value={request.materialName} />
          <Field label="Category" value={request.materialCategory} />
          <Field label="Description" value={request.description ?? "—"} />
          <Field
            label="Quantity"
            value={`${request.quantity} ${request.unitOfMeasure}`}
          />
          <Field
            label="Estimated cost"
            value={
              request.estimatedCostMinor != null
                ? `${request.estimatedCurrency ?? "IDR"} ${(Number(request.estimatedCostMinor) / 100).toLocaleString()}`
                : "—"
            }
          />
          <Field
            label="Preferred supplier"
            value={request.preferredSupplierId ?? "—"}
            mono
          />
        </div>
      </Section>

      {request.status === "rejected" && request.rejectionReason && (
        <Section eyebrow="Rejected" title="Reason">
          <p className="text-sm text-danger whitespace-pre-wrap">
            {request.rejectionReason}
          </p>
        </Section>
      )}

      <Section
        eyebrow="Quotations"
        title={`${quotations.length} quote${quotations.length === 1 ? "" : "s"}`}
      >
        {quotations.length === 0 ? (
          <EmptyState
            title="No quotations yet"
            description="Once approved, procurement collects quotations from vendors. Use the addQuotation server action."
          />
        ) : (
          <>
            <div className="mb-3">
              <Button asChild variant="secondary">
                <Link
                  href={`/development-os/procurement/quotation-comparison/${encodeURIComponent(request.requestCode)}`}
                >
                  Compare side-by-side →
                </Link>
              </Button>
            </div>
            <Table>
              <THead>
                <TR>
                  <TH>Vendor</TH>
                  <TH>Quote #</TH>
                  <TH>Total</TH>
                  <TH>Currency</TH>
                  <TH>Validity</TH>
                  <TH>Delivery</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {quotations.map((q) => (
                  <TR key={q.id}>
                    <TD className="font-mono text-xs">
                      {q.vendorId.slice(0, 8)}
                    </TD>
                    <TD className="text-xs">{q.quotationNumber ?? "—"}</TD>
                    <TDNum>
                      {(Number(q.totalAmountMinor) / 100).toLocaleString()}
                    </TDNum>
                    <TD className="text-xs">{q.currency}</TD>
                    <TD className="text-xs">{q.validityUntil ?? "—"}</TD>
                    <TD className="text-xs">{q.deliveryEstimatedDate ?? "—"}</TD>
                    <TD>
                      <Badge tone={q.status === "selected" ? "success" : "neutral"}>
                        {q.status}
                      </Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </>
        )}
      </Section>

      {request.generatedPoId && (
        <Section eyebrow="Linked" title="Generated PO">
          <p className="text-sm">
            PO created:{" "}
            <span className="font-mono text-xs">{request.generatedPoId}</span>
          </p>
        </Section>
      )}
    </DevelopmentShell>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
        {label}
      </div>
      <div className={`mt-0.5 ${mono ? "font-mono text-xs break-all" : "text-sm"}`}>
        {value}
      </div>
    </div>
  );
}
