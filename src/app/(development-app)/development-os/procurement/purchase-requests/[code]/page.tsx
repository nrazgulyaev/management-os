import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { Timeline, type TimelineStage } from "@/components/ui/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { DevOsPurchaseRequestActions } from "@/components/development/procurement/request-actions";
import { getDb } from "@/lib/db/client";
import { devOsPurchaseRequests } from "@/lib/db/schema/procurement";
import { getPurchaseRequest } from "@/lib/development/server/procurement/procurement-actions";
import { getVendors } from "@/lib/development/server/vendors";
import { getCurrentUserContext } from "@/features/auth/permissions";
import { AddQuotationModal } from "@/components/development/procurement/add-quotation-modal";

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

/**
 * Mockup "request path" — map the PR status onto an ordered lifecycle so
 * the detail page reads like the drawer timeline in the design. Rejected
 * / cancelled collapse to a single blocked stage.
 */
const REQUEST_PATH: Array<{ key: string; label: string }> = [
  { key: "submitted", label: "Submitted" },
  { key: "approved", label: "Approved" },
  { key: "quotations_in_progress", label: "Quoting" },
  { key: "quotation_selected", label: "Vendor picked" },
  { key: "po_created", label: "PO created" },
];

function requestPathStages(status: string): TimelineStage[] {
  if (status === "rejected" || status === "cancelled") {
    return [
      { id: "submitted", label: "Submitted", status: "complete" },
      {
        id: status,
        label: status === "rejected" ? "Rejected" : "Cancelled",
        status: "blocked",
      },
    ];
  }
  const order = ["draft", ...REQUEST_PATH.map((s) => s.key)];
  const currentIdx = order.indexOf(status);
  return REQUEST_PATH.map((stage) => {
    const idx = order.indexOf(stage.key);
    const stageStatus: TimelineStage["status"] =
      currentIdx > idx ? "complete" : currentIdx === idx ? "active" : "pending";
    return { id: stage.key, label: stage.label, status: stageStatus };
  });
}

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
        <header className="page-header">
          <div className="left">
            <div className="crumb">Procurement · supply</div>
            <h1>Purchase request</h1>
          </div>
        </header>
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
  // Quotations can be collected while the PR is open (approved or in-progress).
  // Terminal / committed states (po_created, rejected, cancelled) and the
  // pre-approval states lock the surface.
  const canAddQuotation = ["approved", "quotations_in_progress"].includes(
    request.status,
  );
  const vendorOptions = canAddQuotation
    ? (await getVendors()).map((v) => ({
        id: v.id,
        vendorCode: v.vendorCode,
        legalName: v.legalName,
      }))
    : [];
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
      <header className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os/procurement/purchase-requests">
              Purchase requests
            </Link>
            <span>/</span>
            <span>{request.requestCode}</span>
          </div>
          <h1>{request.requestCode}</h1>
          <div className="text-[13px] text-ink-3 mt-1.5">
            {request.materialName} · {request.quantity} {request.unitOfMeasure}
          </div>
        </div>
        <div className="actions">
          <Link
            href="/development-os/procurement/purchase-requests"
            className="btn btn-dark btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            All requests
          </Link>
        </div>
      </header>

      {request.reason && (
        <p className="text-ink-3 text-sm max-w-3xl -mt-4 leading-relaxed">
          {request.reason}
        </p>
      )}

      <div>
        <div className="text-[10.5px] font-mono uppercase tracking-[0.16em] text-ink-4 leading-[1.5] mb-1">
          State
        </div>
        <h2 className="text-display text-[18px] font-semibold leading-tight tracking-[-0.01em] text-ink mb-3">
          Status + urgency
        </h2>
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <Badge tone={STATUS_TONE[request.status] ?? "neutral"}>
            {request.status}
          </Badge>
          <Badge tone={URGENCY_TONE[request.urgency] ?? "neutral"}>
            {request.urgency}
          </Badge>
          <span className="text-sm text-ink-3">
            Required by {request.requiredByDate}
          </span>
        </div>
        <div className="rounded-[14px] border border-line-2 bg-panel p-5 mb-5">
          <div className="text-[10.5px] font-mono uppercase tracking-[0.16em] text-ink-4 mb-4">
            Request path
          </div>
          <Timeline
            orientation="vertical"
            stages={requestPathStages(request.status)}
          />
        </div>
        <DevOsPurchaseRequestActions
          requestId={request.id}
          status={request.status}
          canApprove={canApprove}
        />
      </div>

      <div>
        <div className="text-[10.5px] font-mono uppercase tracking-[0.16em] text-ink-4 leading-[1.5] mb-1">
          What&rsquo;s needed
        </div>
        <h2 className="text-display text-[18px] font-semibold leading-tight tracking-[-0.01em] text-ink mb-3">
          Material
        </h2>
        <div className="rounded-[14px] border border-line-2 bg-panel p-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
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
        </div>
      </div>

      {request.status === "rejected" && request.rejectionReason && (
        <div>
          <div className="text-[10.5px] font-mono uppercase tracking-[0.16em] text-ink-4 leading-[1.5] mb-1">
            Rejected
          </div>
          <h2 className="text-display text-[18px] font-semibold leading-tight tracking-[-0.01em] text-ink mb-3">
            Reason
          </h2>
          <p className="text-sm text-danger whitespace-pre-wrap">
            {request.rejectionReason}
          </p>
        </div>
      )}

      <div>
        <div className="text-[10.5px] font-mono uppercase tracking-[0.16em] text-ink-4 leading-[1.5] mb-1">
          Quotations
        </div>
        <h2 className="text-display text-[18px] font-semibold leading-tight tracking-[-0.01em] text-ink mb-3">
          {quotations.length} quote{quotations.length === 1 ? "" : "s"}
        </h2>
        {canAddQuotation && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <AddQuotationModal
              purchaseRequestId={request.id}
              vendors={vendorOptions}
            />
            <Link
              href={`/development-os/procurement/quotations/import?pr=${encodeURIComponent(request.requestCode)}`}
              className="btn btn-secondary btn-sm"
            >
              Bulk import from spreadsheet
            </Link>
          </div>
        )}
        {quotations.length === 0 ? (
          <EmptyState
            title="No quotations yet"
            description={
              canAddQuotation
                ? "Collect vendor quotes with “Add quotation”, or bulk-import them from a spreadsheet."
                : "Quotations are collected once the request is approved and opened for quoting."
            }
          />
        ) : (
          <>
            <div className="mb-3">
              <Link
                href={`/development-os/procurement/quotation-comparison/${encodeURIComponent(request.requestCode)}`}
                className="btn btn-dark btn-sm"
              >
                Compare side-by-side →
              </Link>
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
      </div>

      {request.generatedPoId && (
        <div>
          <div className="text-[10.5px] font-mono uppercase tracking-[0.16em] text-ink-4 leading-[1.5] mb-1">
            Linked
          </div>
          <h2 className="text-display text-[18px] font-semibold leading-tight tracking-[-0.01em] text-ink mb-3">
            Generated PO
          </h2>
          <p className="text-sm text-ink-2">
            PO created:{" "}
            <span className="font-mono text-xs">{request.generatedPoId}</span>
          </p>
        </div>
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
      <div className="text-[10.5px] font-mono uppercase tracking-[0.12em] text-ink-4">
        {label}
      </div>
      <div
        className={`mt-0.5 text-ink ${mono ? "font-mono text-xs break-all" : "text-sm font-medium"}`}
      >
        {value}
      </div>
    </div>
  );
}
