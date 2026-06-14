import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { desc, eq } from "drizzle-orm";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import {
  procurementQuotations,
  devOsPurchaseRequests,
} from "@/lib/db/schema/procurement";
import { vendors } from "@/lib/db/schema/site-operations";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = {
  title: "Quotations · Development OS",
};
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "ok" | "warn" | "danger" | "soft"> = {
  received: "info",
  under_review: "warn",
  selected: "ok",
  rejected: "danger",
  expired: "soft",
};

async function listAllQuotations() {
  const db = getDb();
  if (!db) return [];
  return db
    .select({
      id: procurementQuotations.id,
      quotationNumber: procurementQuotations.quotationNumber,
      vendorId: procurementQuotations.vendorId,
      vendorLegalName: vendors.legalName,
      purchaseRequestId: procurementQuotations.purchaseRequestId,
      requestCode: devOsPurchaseRequests.requestCode,
      totalAmountMinor: procurementQuotations.totalAmountMinor,
      currency: procurementQuotations.currency,
      validityUntil: procurementQuotations.validityUntil,
      deliveryEstimatedDate: procurementQuotations.deliveryEstimatedDate,
      status: procurementQuotations.status,
      quotedAt: procurementQuotations.quotedAt,
    })
    .from(procurementQuotations)
    .innerJoin(vendors, eq(vendors.id, procurementQuotations.vendorId))
    .innerJoin(
      devOsPurchaseRequests,
      eq(devOsPurchaseRequests.id, procurementQuotations.purchaseRequestId),
    )
    .orderBy(desc(procurementQuotations.quotedAt))
    .limit(200);
}

export default async function GlobalQuotationsListPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Quotations</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const rows = await safeQuery("listAllQuotations", listAllQuotations(), [], 4000);

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Procurement</span> / <span>Quotations</span>
          </div>
          <h1>Quotations</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Procurement manager&apos;s global view across all purchase requests.
            Side-by-side comparison happens at
            /procurement/quotation-comparison/[requestCode].
          </p>
        </div>
        <div className="actions">
          <div className="flex gap-2">
            <Link
              href="/development-os/procurement/purchase-requests"
              className="btn btn-secondary"
            >
              Purchase requests
            </Link>
            <Link href="/development-os" className="btn btn-secondary">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Command center
            </Link>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No quotations yet"
          description="Vendor quotations are created against purchase requests via the procurement workflow."
        
          action={
            <Link href="/development-os/procurement/purchase-requests" className="btn btn-secondary btn-sm">View purchase requests</Link>
          }
        />
      ) : (
        <div>
          <div className="label mb-2.5">Catalog</div>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Quotation #</th>
                <th scope="col">Vendor</th>
                <th scope="col">Linked PR</th>
                <th scope="col" className="num">Total</th>
                <th scope="col">Validity</th>
                <th scope="col">Est. delivery</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => (
                <tr key={q.id}>
                  <td className="mono text-xs">{q.quotationNumber ?? q.id.slice(0, 8)}</td>
                  <td className="row-title">{q.vendorLegalName}</td>
                  <td className="mono text-xs">
                    <Link
                      href={`/development-os/procurement/quotation-comparison/${encodeURIComponent(q.requestCode)}`}
                      className="hover:underline"
                    >
                      {q.requestCode}
                    </Link>
                  </td>
                  <td className="num">
                    {(Number(q.totalAmountMinor) / 100).toLocaleString()}{" "}
                    {q.currency}
                  </td>
                  <td className="text-xs">{q.validityUntil ?? "—"}</td>
                  <td className="text-xs">{q.deliveryEstimatedDate ?? "—"}</td>
                  <td>
                    <HandoffBadge tone={STATUS_TONE[q.status] ?? "soft"}>
                      {q.status}
                    </HandoffBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DevelopmentShell>
  );
}
