import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { requireInternalUser, AuthorizationError } from "@/features/auth/permissions";
import { AccessForbidden } from "@/components/auth/access-forbidden";
import { getReceivingPoDetail } from "@/lib/development/server/receiving-queries";
import {
  MATERIAL_PO_STATUS_LABEL,
  MATERIAL_QUALITY_LABEL,
  type MaterialPoStatus,
  type MaterialQualityStatus,
} from "@/lib/development/constants/material-constants";
import {
  RECEIVING_DECISION_LABEL,
  RECEIVING_DECISION_TONE,
  RECEIVING_HOLD_STATUS_TONE,
} from "@/lib/development/constants/receiving-constants";
import { ReceivingDecisionPanel } from "@/components/development/inventory/receiving-decision-panel";

export const metadata: Metadata = { title: "PO receiving · Development OS" };
export const dynamic = "force-dynamic";

type HandoffTone = "ok" | "warn" | "danger" | "gold" | "info" | "ink" | "soft" | "amber";

/** Bridge the shared legacy-Badge tone vocabulary used by the imported
 *  RECEIVING_* constant maps onto the handoff badge palette. */
const LEGACY_TO_HANDOFF: Record<string, HandoffTone | undefined> = {
  success: "ok",
  warning: "warn",
  danger: "danger",
  info: "info",
  neutral: "soft",
};

const PO_STATUS_TONE: Record<MaterialPoStatus, HandoffTone> = {
  draft: "soft",
  ordered: "info",
  partially_delivered: "warn",
  fully_delivered: "ok",
  cancelled: "soft",
};

const QC_TONE: Record<MaterialQualityStatus, HandoffTone> = {
  pending: "warn",
  accepted: "ok",
  partial_acceptance: "info",
  rejected: "danger",
};

export default async function ReceivingPoDetailPage({
  params,
}: {
  params: Promise<{ poId: string }>;
}) {
  try {
    await requireInternalUser();
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return (
        <DevelopmentShell>
          <AccessForbidden backHref="/development-os/inventory/receiving" backLabel="Receiving" />
        </DevelopmentShell>
      );
    }
    throw err;
  }
  const { poId } = await params;

  const detail = await getReceivingPoDetail(decodeURIComponent(poId));
  if (!detail) notFound();

  const { po, outstandingQty, holds } = detail;
  const openHolds = holds.filter((h) => h.status === "open").length;

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/inventory/receiving">Receiving</Link> /{" "}
            <span>{po.poCode}</span>
          </div>
          <div className="label">
            {`${po.vendorLegalName}${po.projectName ? ` · ${po.projectName}` : ""}`}
          </div>
          <h1>{`Receive ${po.poCode}`}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Run the QC chain line by line, then record the at-dock decision.
            Receiving is audit-logged; no stock or money writes happen here
            (delivery posting + payment stay in their own flows).
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/inventory/receiving"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Queue
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <HandoffBadge tone={PO_STATUS_TONE[po.status] ?? "soft"}>
          {MATERIAL_PO_STATUS_LABEL[po.status] ?? po.status}
        </HandoffBadge>
        <HandoffBadge tone="soft">Ordered {po.orderDate}</HandoffBadge>
        {po.expectedDeliveryDate && (
          <HandoffBadge tone="soft">ETA {po.expectedDeliveryDate}</HandoffBadge>
        )}
        <HandoffBadge tone={outstandingQty > 0 ? "warn" : "ok"}>
          {outstandingQty.toFixed(2)} outstanding
        </HandoffBadge>
        {openHolds > 0 && (
          <HandoffBadge tone="warn">{openHolds} open hold</HandoffBadge>
        )}
      </div>

      <div>
        <div className="label mb-2.5">QC chain</div>
        {po.lines.length === 0 ? (
          <EmptyState title="No lines on this PO" description="Nothing to receive." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>#</TH>
                <TH>Material</TH>
                <TH>Category</TH>
                <TH>Unit</TH>
                <TH>Ordered</TH>
                <TH>Delivered</TH>
                <TH>Outstanding</TH>
              </TR>
            </THead>
            <TBody>
              {po.lines.map((l) => {
                const ordered = Number(l.quantityOrdered);
                const delivered = Number(l.quantityDelivered);
                const outstanding = ordered - delivered;
                return (
                  <TR key={l.id}>
                    <TD className="text-xs text-ink-tertiary">{l.lineNumber}</TD>
                    <TD className="text-sm">{l.materialName}</TD>
                    <TD className="text-xs text-ink-secondary">
                      {l.materialCategory ?? "—"}
                    </TD>
                    <TD className="text-xs">{l.unitOfMeasure}</TD>
                    <TDNum>{ordered.toFixed(2)}</TDNum>
                    <TDNum>{delivered.toFixed(2)}</TDNum>
                    <TDNum
                      className={outstanding > 0 ? "text-warning" : "text-success"}
                    >
                      {outstanding.toFixed(2)}
                    </TDNum>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </div>

      {po.deliveries.length > 0 && (
        <div>
          <div className="label mb-2.5">Deliveries</div>
          <Table>
            <THead>
              <TR>
                <TH>Delivery</TH>
                <TH>Date</TH>
                <TH>QC status</TH>
              </TR>
            </THead>
            <TBody>
              {po.deliveries.map((d) => (
                <TR key={d.id}>
                  <TD className="font-mono text-xs">{d.deliveryCode}</TD>
                  <TD className="text-xs">{d.deliveryDate}</TD>
                  <TD>
                    <HandoffBadge tone={QC_TONE[d.qualityCheckStatus] ?? "soft"}>
                      {MATERIAL_QUALITY_LABEL[d.qualityCheckStatus] ??
                        d.qualityCheckStatus}
                    </HandoffBadge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}

      <div>
        <div className="label mb-2.5">Decision</div>
        <ReceivingDecisionPanel
          poId={po.id}
          poCode={po.poCode}
          outstandingQty={outstandingQty}
          deliveries={po.deliveries.map((d) => ({
            id: d.id,
            deliveryCode: d.deliveryCode,
          }))}
        />
      </div>

      <div>
        <div className="label mb-2.5">History</div>
        {holds.length === 0 ? (
          <EmptyState
            title="No decisions yet"
            description="Record the first receiving decision above."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Decision</TH>
                <TH>Status</TH>
                <TH>Accepted</TH>
                <TH>Held</TH>
                <TH>Reason</TH>
                <TH>When</TH>
              </TR>
            </THead>
            <TBody>
              {holds.map((h) => (
                <TR key={h.id}>
                  <TD>
                    <HandoffBadge
                      tone={LEGACY_TO_HANDOFF[RECEIVING_DECISION_TONE[h.decision]]}
                    >
                      {RECEIVING_DECISION_LABEL[h.decision]}
                    </HandoffBadge>
                  </TD>
                  <TD>
                    <HandoffBadge
                      tone={LEGACY_TO_HANDOFF[RECEIVING_HOLD_STATUS_TONE[h.status]]}
                    >
                      {h.status}
                    </HandoffBadge>
                  </TD>
                  <TDNum>{Number(h.quantityAccepted).toFixed(2)}</TDNum>
                  <TDNum>{Number(h.quantityHeld).toFixed(2)}</TDNum>
                  <TD className="text-xs text-ink-secondary max-w-[24rem]">
                    {h.reason}
                  </TD>
                  <TD className="text-xs text-ink-tertiary">
                    {new Date(h.createdAt).toLocaleString()}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </DevelopmentShell>
  );
}
