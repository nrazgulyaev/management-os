import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listPurchaseRequests } from "@/lib/development/server/procurement/procurement-actions";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Purchase requests · Development OS" };
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

export default async function PurchaseRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Purchase requests" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const requests = await safeQuery(
    "listPurchaseRequests",
    listPurchaseRequests({ status: sp.status, limit: 200 }),
    [],
    4000,
  );

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Procurement" },
          { label: "Purchase requests" },
        ]}
        eyebrow={`${requests.length} request${requests.length === 1 ? "" : "s"}`}
        title="Purchase requests"
        description="Site staff request → procurement collects quotations → approval → PO. Mobile-friendly create form is at /procurement/purchase-requests/new."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild>
              <Link href="/development-os/procurement/purchase-requests/new">
                + New request
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

      <div className="flex items-center gap-2 text-xs">
        {[
          { v: "", label: "All" },
          { v: "draft", label: "Draft" },
          { v: "submitted", label: "Submitted" },
          { v: "approved", label: "Approved" },
          { v: "quotations_in_progress", label: "Quoting" },
          { v: "po_created", label: "PO created" },
          { v: "rejected", label: "Rejected" },
        ].map((p) => (
          <Link
            key={p.v}
            href={`/development-os/procurement/purchase-requests${p.v ? `?status=${p.v}` : ""}`}
            className={`rounded-md px-3 py-1.5 ${(sp.status ?? "") === p.v ? "bg-stone-900 text-white" : "border border-line-soft hover:bg-muted/40"}`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      <Section eyebrow="Requests" title="All purchase requests">
        {requests.length === 0 ? (
          <EmptyState
            title="No purchase requests"
            description="Site staff create requests at /procurement/purchase-requests/new (mobile-friendly form)."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Material</TH>
                <TH>Qty</TH>
                <TH>Urgency</TH>
                <TH>Required by</TH>
                <TH>Status</TH>
                <TH>Submitted</TH>
              </TR>
            </THead>
            <TBody>
              {requests.map((r) => (
                <TR key={r.id}>
                  <TD className="font-mono text-xs">
                    <Link
                      href={`/development-os/procurement/purchase-requests/${r.requestCode}`}
                      className="hover:underline"
                    >
                      {r.requestCode}
                    </Link>
                  </TD>
                  <TD className="text-sm">{r.materialName}</TD>
                  <TDNum>
                    {r.quantity} {r.unitOfMeasure}
                  </TDNum>
                  <TD>
                    <Badge tone={URGENCY_TONE[r.urgency] ?? "neutral"}>
                      {r.urgency}
                    </Badge>
                  </TD>
                  <TD className="text-xs">{r.requiredByDate}</TD>
                  <TD>
                    <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>
                      {r.status}
                    </Badge>
                  </TD>
                  <TD className="text-xs">
                    {r.submittedAt
                      ? new Date(r.submittedAt).toISOString().slice(0, 10)
                      : "—"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>
    </DevelopmentShell>
  );
}
