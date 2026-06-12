import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
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

const PO_STATUS_TONE: Record<MaterialPoStatus, "info" | "success" | "warning" | "danger" | "neutral"> = {
  draft: "neutral",
  ordered: "info",
  partially_delivered: "warning",
  fully_delivered: "success",
  cancelled: "neutral",
};

const QC_TONE: Record<MaterialQualityStatus, "info" | "success" | "warning" | "danger" | "neutral"> = {
  pending: "warning",
  accepted: "success",
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
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Receiving", href: "/development-os/inventory/receiving" },
          { label: po.poCode },
        ]}
        eyebrow={`${po.vendorLegalName}${po.projectName ? ` · ${po.projectName}` : ""}`}
        title={`Receive ${po.poCode}`}
        description="Run the QC chain line by line, then record the at-dock decision. Receiving is audit-logged; no stock or money writes happen here (delivery posting + payment stay in their own flows)."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/inventory/receiving">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Queue
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={PO_STATUS_TONE[po.status] ?? "neutral"}>
          {MATERIAL_PO_STATUS_LABEL[po.status] ?? po.status}
        </Badge>
        <Badge tone="outline">Ordered {po.orderDate}</Badge>
        {po.expectedDeliveryDate && (
          <Badge tone="outline">ETA {po.expectedDeliveryDate}</Badge>
        )}
        <Badge tone={outstandingQty > 0 ? "warning" : "success"}>
          {outstandingQty.toFixed(2)} outstanding
        </Badge>
        {openHolds > 0 && <Badge tone="warning">{openHolds} open hold</Badge>}
      </div>

      <Section
        eyebrow="QC chain"
        title="PO line items"
        description="Ordered vs delivered vs consumed per line. The shortfall (ordered − delivered) is what the receiving decision resolves."
      >
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
      </Section>

      {po.deliveries.length > 0 && (
        <Section
          eyebrow="Deliveries"
          title="Logged drops against this PO"
          description="Quality-check status per recorded delivery."
        >
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
                    <Badge tone={QC_TONE[d.qualityCheckStatus] ?? "neutral"}>
                      {MATERIAL_QUALITY_LABEL[d.qualityCheckStatus] ??
                        d.qualityCheckStatus}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Section>
      )}

      <Section
        eyebrow="Decision"
        title="Record receiving decision"
        description="Accept-partial · Wait-for-back-order · Return-whole · Escalate-to-procurement. Each decision is logged as an auditable QC hold."
      >
        <ReceivingDecisionPanel
          poId={po.id}
          poCode={po.poCode}
          outstandingQty={outstandingQty}
          deliveries={po.deliveries.map((d) => ({
            id: d.id,
            deliveryCode: d.deliveryCode,
          }))}
        />
      </Section>

      <Section
        eyebrow="History"
        title="Receiving decisions"
        description="Most recent first."
      >
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
                    <Badge tone={RECEIVING_DECISION_TONE[h.decision]}>
                      {RECEIVING_DECISION_LABEL[h.decision]}
                    </Badge>
                  </TD>
                  <TD>
                    <Badge tone={RECEIVING_HOLD_STATUS_TONE[h.status]}>
                      {h.status}
                    </Badge>
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
      </Section>
    </DevelopmentShell>
  );
}
