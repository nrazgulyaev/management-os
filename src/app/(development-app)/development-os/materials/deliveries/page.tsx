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
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Materials", href: "/development-os/materials" },
          { label: "Deliveries" },
        ]}
        eyebrow={
          db ? `${list.length} delivery events` : "Database not configured"
        }
        title="Material deliveries"
        description="Receipt events tied to vendor POs. Each delivery captures quality check status and line-by-line received quantities; the recordMaterialDelivery action atomically updates po_lines.quantity_delivered."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/materials">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              POs
            </Link>
          </Button>
        }
      />

      {!db ? (
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      ) : list.length === 0 ? (
        <EmptyState
          title="No deliveries recorded"
          description="Use the recordMaterialDelivery action to add the first."
        />
      ) : (
        <Section eyebrow="All deliveries" title="Chronological">
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
                    <Badge
                      tone={
                        d.qualityCheckStatus === "accepted"
                          ? "success"
                          : d.qualityCheckStatus === "partial_acceptance"
                            ? "warning"
                            : d.qualityCheckStatus === "rejected"
                              ? "danger"
                              : "neutral"
                      }
                    >
                      {MATERIAL_QUALITY_LABEL[d.qualityCheckStatus]}
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
