import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Truck } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { requireInternalUser } from "@/features/auth/permissions";
import { safeQuery } from "@/lib/development/safe-query";
import {
  getReceivingQueue,
  type ReceivingQueueItem,
} from "@/lib/development/server/receiving-queries";
import { MATERIAL_PO_STATUS_LABEL } from "@/lib/development/constants/material-constants";
import type { MaterialPoStatus } from "@/lib/development/constants/material-constants";

export const metadata: Metadata = { title: "Receiving · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<MaterialPoStatus, "info" | "success" | "warning" | "danger" | "neutral"> = {
  draft: "neutral",
  ordered: "info",
  partially_delivered: "warning",
  fully_delivered: "success",
  cancelled: "neutral",
};

function etaBadge(item: ReceivingQueueItem) {
  if (item.daysToExpected === null) {
    return <Badge tone="neutral">No ETA</Badge>;
  }
  if (item.daysToExpected < 0) {
    return (
      <Badge tone="danger">
        {Math.abs(item.daysToExpected)}d late
      </Badge>
    );
  }
  if (item.daysToExpected === 0) {
    return <Badge tone="warning">Due today</Badge>;
  }
  return <Badge tone="info">{item.daysToExpected}d out</Badge>;
}

export default async function ReceivingQueuePage() {
  // Gate to internal / warehouse role (siblings gate at the action layer;
  // we mirror that with an explicit page guard on top of the product
  // access guard in the (development-app) layout).
  await requireInternalUser();

  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Receiving" />
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL to load the at-dock receiving queue."
        />
      </DevelopmentShell>
    );
  }

  const queue = await safeQuery(
    "getReceivingQueue",
    getReceivingQueue(),
    [] as ReceivingQueueItem[],
    6000,
  );

  const lateCount = queue.filter(
    (q) => q.daysToExpected !== null && q.daysToExpected < 0,
  ).length;
  const heldCount = queue.filter((q) => q.openHoldCount > 0).length;

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Inventory", href: "/development-os/inventory/items" },
          { label: "Receiving" },
        ]}
        eyebrow={`${queue.length} PO${queue.length === 1 ? "" : "s"} at the dock`}
        title="Receiving workbench"
        description="At-dock FIFO queue of open material POs awaiting receipt — oldest expected delivery first. Drill into a PO to run the QC chain and record an accept-partial / wait-for-back-order / return-whole / escalate decision."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/cabinets/warehouse-manager">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Warehouse
            </Link>
          </Button>
        }
      />

      {queue.length === 0 ? (
        <EmptyState
          icon={<Truck className="w-6 h-6" strokeWidth={1.5} />}
          title="Nothing in transit"
          description="No open purchase orders are awaiting receipt. New deliveries will appear here, oldest expected-delivery first."
          action={
            <Button asChild variant="secondary">
              <Link href="/development-os/procurement/purchase-requests">
                Procurement
              </Link>
            </Button>
          }
        />
      ) : (
        <Section
          eyebrow={
            lateCount > 0
              ? `${lateCount} late · ${heldCount} held`
              : `${heldCount} held`
          }
          title="At-dock queue (FIFO)"
          description="Oldest expected delivery first. Outstanding = ordered − delivered across all PO lines."
        >
          <Table>
            <THead>
              <TR>
                <TH>PO</TH>
                <TH>Vendor</TH>
                <TH>Project</TH>
                <TH>Status</TH>
                <TH>ETA</TH>
                <TH>Outstanding</TH>
                <TH>Holds</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {queue.map((q) => (
                <TR key={q.poId}>
                  <TD className="font-mono text-xs">
                    <Link
                      href={`/development-os/inventory/receiving/${encodeURIComponent(q.poCode)}`}
                      className="text-ink hover:underline"
                    >
                      {q.poCode}
                    </Link>
                  </TD>
                  <TD className="text-sm">{q.vendorLegalName}</TD>
                  <TD className="text-sm text-ink-secondary">
                    {q.projectName ?? "—"}
                  </TD>
                  <TD>
                    <Badge tone={STATUS_TONE[q.status as MaterialPoStatus] ?? "neutral"}>
                      {MATERIAL_PO_STATUS_LABEL[q.status as MaterialPoStatus] ?? q.status}
                    </Badge>
                  </TD>
                  <TD>{etaBadge(q)}</TD>
                  <TDNum>
                    {q.outstandingQty.toFixed(2)}
                    <span className="text-ink-tertiary">
                      {" "}
                      / {q.totalQtyOrdered.toFixed(2)}
                    </span>
                  </TDNum>
                  <TD>
                    {q.openHoldCount > 0 ? (
                      <Badge tone="warning">{q.openHoldCount} open</Badge>
                    ) : (
                      <span className="text-ink-tertiary text-xs">—</span>
                    )}
                  </TD>
                  <TD>
                    <Button asChild variant="ghost" size="sm">
                      <Link
                        href={`/development-os/inventory/receiving/${encodeURIComponent(q.poCode)}`}
                      >
                        Inspect
                        <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
                      </Link>
                    </Button>
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
