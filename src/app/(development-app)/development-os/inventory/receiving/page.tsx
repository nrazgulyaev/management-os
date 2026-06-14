import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Truck } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { requireInternalUser, AuthorizationError } from "@/features/auth/permissions";
import { AccessForbidden } from "@/components/auth/access-forbidden";
import { safeQuery } from "@/lib/development/safe-query";
import {
  getReceivingQueue,
  type ReceivingQueueItem,
} from "@/lib/development/server/receiving-queries";
import { MATERIAL_PO_STATUS_LABEL } from "@/lib/development/constants/material-constants";
import type { MaterialPoStatus } from "@/lib/development/constants/material-constants";

export const metadata: Metadata = { title: "Receiving · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<MaterialPoStatus, "info" | "ok" | "warn" | "danger" | "soft"> = {
  draft: "soft",
  ordered: "info",
  partially_delivered: "warn",
  fully_delivered: "ok",
  cancelled: "soft",
};

function etaBadge(item: ReceivingQueueItem) {
  if (item.daysToExpected === null) {
    return <HandoffBadge tone="soft">No ETA</HandoffBadge>;
  }
  if (item.daysToExpected < 0) {
    return (
      <HandoffBadge tone="danger">
        {Math.abs(item.daysToExpected)}d late
      </HandoffBadge>
    );
  }
  if (item.daysToExpected === 0) {
    return <HandoffBadge tone="warn">Due today</HandoffBadge>;
  }
  return <HandoffBadge tone="info">{item.daysToExpected}d out</HandoffBadge>;
}

export default async function ReceivingQueuePage() {
  // Gate to internal / warehouse role (siblings gate at the action layer;
  // we mirror that with an explicit page guard on top of the product
  // access guard in the (development-app) layout). Degrade to Forbidden
  // instead of a 500 for a logged-in non-internal user.
  try {
    await requireInternalUser();
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return (
        <DevelopmentShell>
          <AccessForbidden backHref="/development-os" backLabel="Development OS" />
        </DevelopmentShell>
      );
    }
    throw err;
  }

  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Receiving</h1>
          </div>
        </div>
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/inventory/items">Inventory</Link> /{" "}
            <span>Receiving</span>
          </div>
          <div className="label">
            {`${queue.length} PO${queue.length === 1 ? "" : "s"} at the dock`}
          </div>
          <h1>Receiving workbench</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            At-dock FIFO queue of open material POs awaiting receipt — oldest
            expected delivery first. Drill into a PO to run the QC chain and
            record an accept-partial / wait-for-back-order / return-whole /
            escalate decision.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/cabinets/warehouse-manager"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Warehouse
          </Link>
        </div>
      </div>

      {queue.length === 0 ? (
        <EmptyState
          icon={<Truck className="w-6 h-6" strokeWidth={1.5} />}
          title="Nothing in transit"
          description="No open purchase orders are awaiting receipt. New deliveries will appear here, oldest expected-delivery first."
          action={
            <Link
              href="/development-os/procurement/purchase-requests"
              className="btn btn-secondary btn-sm"
            >
              Procurement
            </Link>
          }
        />
      ) : (
        <div>
          <div className="label mb-2.5">
            {lateCount > 0
              ? `${lateCount} late · ${heldCount} held`
              : `${heldCount} held`}
          </div>
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
                    <HandoffBadge tone={STATUS_TONE[q.status as MaterialPoStatus] ?? "soft"}>
                      {MATERIAL_PO_STATUS_LABEL[q.status as MaterialPoStatus] ?? q.status}
                    </HandoffBadge>
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
                      <HandoffBadge tone="warn">{q.openHoldCount} open</HandoffBadge>
                    ) : (
                      <span className="text-ink-tertiary text-xs">—</span>
                    )}
                  </TD>
                  <TD>
                    <Link
                      href={`/development-os/inventory/receiving/${encodeURIComponent(q.poCode)}`}
                      className="btn btn-secondary btn-sm"
                    >
                      Inspect
                      <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
                    </Link>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </DevelopmentShell>
  );
}
