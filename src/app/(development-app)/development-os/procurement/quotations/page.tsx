import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { desc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
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

const STATUS_TONE: Record<string, "info" | "success" | "warning" | "danger" | "neutral"> = {
  received: "info",
  under_review: "warning",
  selected: "success",
  rejected: "danger",
  expired: "neutral",
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
        <PageHeader title="Quotations" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const rows = await safeQuery("listAllQuotations", listAllQuotations(), [], 4000);

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Procurement" },
          { label: "Quotations" },
        ]}
        eyebrow={`${rows.length} quotation${rows.length === 1 ? "" : "s"} across all PRs`}
        title="Quotations"
        description="Procurement manager's global view across all purchase requests. Side-by-side comparison happens at /procurement/quotation-comparison/[requestCode]."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="secondary">
              <Link href="/development-os/procurement/purchase-requests">
                Purchase requests
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/development-os">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Command center
              </Link>
            </Button>
          </div>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No quotations yet"
          description="Vendor quotations are created against purchase requests via the procurement workflow."
        
          action={
            <Link href="/development-os/procurement/purchase-requests" className="inline-flex items-center justify-center rounded-full border border-line-soft bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-muted/40">View purchase requests</Link>
          }
        />
      ) : (
        <Section eyebrow="Catalog" title="All quotations (most recent first)">
          <Table>
            <THead>
              <TR>
                <TH>Quotation #</TH>
                <TH>Vendor</TH>
                <TH>Linked PR</TH>
                <TH>Total</TH>
                <TH>Validity</TH>
                <TH>Est. delivery</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((q) => (
                <TR key={q.id}>
                  <TD className="font-mono text-xs">{q.quotationNumber ?? q.id.slice(0, 8)}</TD>
                  <TD className="text-sm">{q.vendorLegalName}</TD>
                  <TD className="font-mono text-xs">
                    <Link
                      href={`/development-os/procurement/quotation-comparison/${encodeURIComponent(q.requestCode)}`}
                      className="hover:underline"
                    >
                      {q.requestCode}
                    </Link>
                  </TD>
                  <TDNum>
                    {(Number(q.totalAmountMinor) / 100).toLocaleString()}{" "}
                    {q.currency}
                  </TDNum>
                  <TD className="text-xs">{q.validityUntil ?? "—"}</TD>
                  <TD className="text-xs">{q.deliveryEstimatedDate ?? "—"}</TD>
                  <TD>
                    <Badge tone={STATUS_TONE[q.status] ?? "neutral"}>
                      {q.status}
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
