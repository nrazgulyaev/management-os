import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { DevelopmentShell } from "@/components/development/development-shell";
import { RfqStatusPill, type RfqStatus } from "@/components/procurement/rfq-status-pill";
import { EmptyState } from "@/components/ui/empty-state";
import { QuoteCompareClient } from "./_compare-client";
import type { QuoteCompareColumn } from "@/components/procurement/quote-compare";
import { getRfqCompareModel } from "@/lib/development/server/procurement/rfq-compare-queries";

/**
 * RFQ quote comparison — real reads.
 *
 * An "RFQ" is a `dev_os_purchase_requests` row; its quotes are
 * `procurement_quotations`. The page fetches the org-scoped comparison
 * model (notFound() on an unknown / foreign id) and lets the procurement
 * manager award the recommended quote, which creates the PO + advances
 * the request status.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `RFQ ${id} · Quote compare` };
}

/** Map a purchase-request status to the 5-state RFQ pill. */
function toRfqPillStatus(prStatus: string): RfqStatus {
  switch (prStatus) {
    case "draft":
      return "draft";
    case "submitted":
    case "approved":
      return "sent";
    case "quotations_in_progress":
      return "quoting";
    case "quotation_selected":
    case "po_created":
      return "awarded";
    default:
      return "closed";
  }
}

export default async function RfqComparePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const model = await getRfqCompareModel(id);
  if (!model) notFound();

  const alreadyAwarded =
    model.status === "quotation_selected" ||
    model.status === "po_created" ||
    model.columns.some((c) => c.status === "selected");

  const columns: QuoteCompareColumn[] = model.columns.map((c) => ({
    vendorId: c.vendorId,
    vendorName: c.vendorName,
    vendorScore: c.vendorScore,
    totalUsdMinor: c.totalMinor,
    leadTimeDays: c.leadTimeDays,
    warrantyMonths: c.warrantyMonths,
    lines: c.lines,
    isWinner: c.isWinner,
    savingsLabel: c.savingsLabel,
  }));

  const recommendation = model.recommendation
    ? {
        winnerQuotationId: model.recommendation.winnerQuotationId,
        winnerVendorId: model.recommendation.winnerVendorId,
        winnerName: model.recommendation.winnerVendorName,
        rationale: model.recommendation.rationale,
        confidence: model.recommendation.confidence,
        winnerTotalUsd: Number(model.recommendation.winnerTotalMinor) / 100,
      }
    : null;

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/cabinets/procurement-manager">
              Procurement
            </Link>{" "}
            / <span>{model.requestCode}</span>
          </div>
          <h1>{model.requestCode}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {model.materialName} · {model.columns.length} quote(s) received. The
            vendor-matcher recommendation weighs price against the latest vendor
            composite score — see below.
          </p>
        </div>
        <div className="actions">
          <RfqStatusPill status={toRfqPillStatus(model.status)} />
          <Link
            href="/development-os/cabinets/procurement-manager"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Procurement cabinet
          </Link>
        </div>
      </div>

      {model.columns.length === 0 ? (
        <EmptyState
          title="No quotations yet"
          description="This request has no vendor quotes. Add quotations from the procurement workflow to compare them here."
        />
      ) : (
        <QuoteCompareClient
          rfqId={model.requestId}
          alreadyAwarded={alreadyAwarded}
          columns={columns}
          recommendation={recommendation}
        />
      )}
    </DevelopmentShell>
  );
}
