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
import { getMaterialPurchaseOrders } from "@/lib/development/server/materials";
import { getDevelopmentProjects } from "@/lib/development/server/projects";
import { getVendors } from "@/lib/development/server/vendors";
import { MATERIAL_PO_STATUS_LABEL } from "@/lib/development/constants/material-constants";
import { formatUsdMinor } from "@/lib/development/constants/investor-constants";
import { safeQuery } from "@/lib/development/safe-query";
import { MaterialPOModalForm } from "@/components/development/operations/material-po-modal-form";

export const metadata: Metadata = { title: "Materials · Development OS" };
export const dynamic = "force-dynamic";

export default async function MaterialsPage() {
  const db = getDb();
  const [list, projects, vendors] = await Promise.all([
    db
      ? safeQuery("getMaterialPurchaseOrders", getMaterialPurchaseOrders(), [], 4000)
      : Promise.resolve([]),
    db
      ? safeQuery("getDevelopmentProjects", getDevelopmentProjects(), [], 4000)
      : Promise.resolve([]),
    db
      ? safeQuery("getVendors", getVendors(), [], 4000)
      : Promise.resolve([]),
  ]);
  const projectOptions = projects.map((p) => ({ id: p.id, name: p.name }));
  const vendorOptions = vendors.map((v) => ({
    id: v.id,
    vendorCode: v.vendorCode,
    legalName: v.legalName,
  }));

  const totalUsd = list.reduce(
    (acc, p) => acc + BigInt(p.totalAmountUsdMinor),
    0n,
  );

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Materials" },
        ]}
        eyebrow={
          db
            ? `${list.length} POs · ${formatUsdMinor(totalUsd)} total ordered`
            : "Database not configured"
        }
        title="Material purchase orders"
        description="Vendor POs, deliveries, and on-site consumption. The reconciliation gate ensures po_lines.quantity_delivered always equals the sum of delivery_lines.quantity_received."
        actions={
          <div className="flex items-center gap-2">
            <MaterialPOModalForm projects={projectOptions} vendors={vendorOptions} />
            <Button asChild variant="secondary">
              <Link href="/development-os/materials/new">Full form</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/development-os/materials/deliveries">
                Deliveries
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

      {!db ? (
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      ) : list.length === 0 ? (
        <EmptyState
          title="No POs yet"
          description="Run npm run db:seed:dev-os to populate or use the createMaterialPO action."
        />
      ) : (
        <Section eyebrow="All POs" title="Chronological">
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Project</TH>
                <TH>Vendor</TH>
                <TH>Order date</TH>
                <TH>Expected delivery</TH>
                <TH>Lines</TH>
                <TH>Total (USD)</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {list.map((p) => (
                <TR key={p.id}>
                  <TD className="font-mono text-xs">
                    <Link
                      href={`/development-os/materials/${p.poCode}`}
                      className="hover:underline"
                    >
                      {p.poCode}
                    </Link>
                  </TD>
                  <TD className="text-sm">{p.projectName ?? "—"}</TD>
                  <TD className="text-sm">{p.vendorLegalName}</TD>
                  <TD className="text-xs">{p.orderDate}</TD>
                  <TD className="text-xs">{p.expectedDeliveryDate ?? "—"}</TD>
                  <TDNum>{p.lineCount}</TDNum>
                  <TDNum>{formatUsdMinor(BigInt(p.totalAmountUsdMinor))}</TDNum>
                  <TD>
                    <Badge
                      tone={
                        p.status === "fully_delivered"
                          ? "success"
                          : p.status === "partially_delivered"
                            ? "info"
                            : p.status === "ordered"
                              ? "warning"
                              : "neutral"
                      }
                    >
                      {MATERIAL_PO_STATUS_LABEL[p.status]}
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
