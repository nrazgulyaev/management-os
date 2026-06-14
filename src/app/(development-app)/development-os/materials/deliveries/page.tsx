import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getMaterialDeliveries } from "@/lib/development/server/materials";
import { MATERIAL_QUALITY_LABEL } from "@/lib/development/constants/material-constants";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Deliveries · Development OS" };
export const dynamic = "force-dynamic";

export default async function MaterialDeliveriesPage() {
  const db = getDb();
  const list = db
    ? await safeQuery(
        "getMaterialDeliveries",
        getMaterialDeliveries(),
        [],
        4000,
      )
    : [];

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/materials">Materials</Link> /{" "}
            <span>Deliveries</span>
          </div>
          <h1>Material deliveries</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Receipt events tied to vendor POs. Each delivery captures quality
            check status and line-by-line received quantities; the
            recordMaterialDelivery action atomically updates
            po_lines.quantity_delivered.
          </p>
        </div>
        <div className="actions">
          <Button asChild variant="secondary">
            <Link href="/development-os/materials">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              POs
            </Link>
          </Button>
        </div>
      </div>

      {!db ? (
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      ) : list.length === 0 ? (
        <EmptyState
          title="No deliveries recorded"
          description="Use the recordMaterialDelivery action to add the first."
        />
      ) : (
        <div>
          <div className="label mb-2.5">{`All deliveries · ${list.length} events`}</div>
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>PO</TH>
                <TH>Vendor</TH>
                <TH>Project</TH>
                <TH>Date</TH>
                <TH>Lines</TH>
                <TH>Quality</TH>
              </TR>
            </THead>
            <TBody>
              {list.map((d) => (
                <TR key={d.id}>
                  <TD className="font-mono text-xs">{d.deliveryCode}</TD>
                  <TD className="font-mono text-xs">
                    <Link
                      href={`/development-os/materials/${d.poCode}`}
                      className="hover:underline"
                    >
                      {d.poCode}
                    </Link>
                  </TD>
                  <TD className="text-sm">{d.vendorLegalName}</TD>
                  <TD className="text-xs">{d.projectName ?? "—"}</TD>
                  <TD className="text-xs">{d.deliveryDate}</TD>
                  <TDNum>{d.lineCount}</TDNum>
                  <TD>
                    <HandoffBadge
                      tone={
                        d.qualityCheckStatus === "accepted"
                          ? "ok"
                          : d.qualityCheckStatus === "partial_acceptance"
                            ? "warn"
                            : d.qualityCheckStatus === "rejected"
                              ? "danger"
                              : "soft"
                      }
                    >
                      {MATERIAL_QUALITY_LABEL[d.qualityCheckStatus]}
                    </HandoffBadge>
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
