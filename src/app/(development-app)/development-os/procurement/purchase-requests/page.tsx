import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import {
  QueueCard,
  QueueRow,
  QueueEmpty,
  WaitChip,
} from "@/components/development/procurement/procurement-ui";
import { getDb } from "@/lib/db/client";
import { listPurchaseRequests } from "@/lib/development/server/procurement/procurement-actions";
import { getDevelopmentProjects } from "@/lib/development/server/projects";
import { safeQuery } from "@/lib/development/safe-query";
import { PurchaseRequestDevAddButton } from "@/components/development/procurement/purchase-request-add-button";

export const metadata: Metadata = { title: "Purchase requests · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "ok" | "warn" | "danger" | "soft" | "amber"> = {
  draft: "soft",
  submitted: "info",
  approved: "ok",
  quotations_in_progress: "warn",
  quotation_selected: "info",
  po_created: "amber",
  rejected: "danger",
  cancelled: "soft",
};

const STATUS_WAIT: Record<string, string> = {
  draft: "Awaiting submit",
  submitted: "Awaiting approval",
  approved: "Awaiting quotes",
  quotations_in_progress: "Collecting quotes",
  quotation_selected: "Awaiting PO",
  po_created: "PO issued",
  rejected: "Rejected",
  cancelled: "Closed",
};

const URGENCY_TONE: Record<string, "info" | "ok" | "warn" | "danger" | "soft"> = {
  low: "soft",
  normal: "info",
  high: "warn",
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
        <div className="page-header">
          <div className="left">
            <h1>Purchase requests</h1>
          </div>
        </div>
        <QueueEmpty>Database not configured — set DATABASE_URL.</QueueEmpty>
      </DevelopmentShell>
    );
  }
  const [requests, projects] = await Promise.all([
    safeQuery(
      "listPurchaseRequests",
      listPurchaseRequests({ status: sp.status, limit: 200 }),
      [],
      4000,
    ),
    safeQuery(
      "purchaseRequests.projects",
      getDevelopmentProjects(),
      [] as Array<{ id: string; name: string; slug: string }>,
      4000,
    ),
  ]);

  const active = sp.status ?? "";

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Procurement</span> / <span>Purchase requests</span>
          </div>
          <h1>Requests &amp; procurement</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Site staff request → procurement collects quotations → approval → PO.
            The mobile-friendly create form lives at
            /procurement/purchase-requests/new.
          </p>
        </div>
        <div className="actions">
          <div className="flex items-center gap-2">
            <PurchaseRequestDevAddButton projects={projects} />
            <Link href="/development-os" className="btn btn-secondary">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Command center
            </Link>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {[
          { v: "", label: "All" },
          { v: "draft", label: "Draft" },
          { v: "submitted", label: "Submitted" },
          { v: "approved", label: "Approved" },
          { v: "quotations_in_progress", label: "Quoting" },
          { v: "po_created", label: "PO created" },
          { v: "rejected", label: "Rejected" },
        ].map((p) => {
          const on = active === p.v;
          return (
            <Link
              key={p.v}
              href={`/development-os/procurement/purchase-requests${p.v ? `?status=${p.v}` : ""}`}
              className={
                on
                  ? "inline-flex items-center rounded-full bg-amber border border-amber px-[13px] py-[7px] text-[12.5px] text-carbon"
                  : "inline-flex items-center rounded-full bg-bg-2 border border-line-2 px-[13px] py-[7px] text-[12.5px] text-ink-2 hover:border-line-3 transition-colors"
              }
            >
              {p.label}
            </Link>
          );
        })}
      </div>

      <div className="flex items-end justify-between gap-3 flex-wrap mt-1">
        <div className="min-w-0">
          <div className="text-[10.5px] font-mono uppercase tracking-[0.16em] text-ink-4 leading-[1.5] mb-1">
            Requests
          </div>
          <h2 className="text-display text-[18px] font-semibold leading-tight tracking-[-0.01em] text-ink">
            All purchase requests
          </h2>
        </div>
      </div>

      {requests.length === 0 ? (
        <QueueEmpty>
          No purchase requests yet — site staff create the first at
          /procurement/purchase-requests/new.
        </QueueEmpty>
      ) : (
        <QueueCard className="mt-3">
          {requests.map((r) => (
            <QueueRow
              key={r.id}
              href={`/development-os/procurement/purchase-requests/${r.requestCode}`}
              code={r.requestCode}
              title={r.materialName}
              sub={
                <>
                  {r.quantity} {r.unitOfMeasure} ·{" "}
                  <HandoffBadge tone={URGENCY_TONE[r.urgency] ?? "soft"}>
                    {r.urgency}
                  </HandoffBadge>
                </>
              }
              wait={STATUS_WAIT[r.status] ?? r.status}
              status={
                <HandoffBadge tone={STATUS_TONE[r.status] ?? "soft"}>
                  {r.status}
                </HandoffBadge>
              }
              amount={
                r.submittedAt
                  ? new Date(r.submittedAt).toISOString().slice(0, 10)
                  : "—"
              }
              meta={<WaitChip>by {r.requiredByDate}</WaitChip>}
            />
          ))}
        </QueueCard>
      )}
    </DevelopmentShell>
  );
}
