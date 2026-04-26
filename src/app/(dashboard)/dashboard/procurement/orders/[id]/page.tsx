import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { PurchaseOrderStatusPill } from "@/components/procurement/purchase-status-pill";
import { ReceiveLineForm } from "@/components/procurement/receive-line-form";
import { DbStatusNotice } from "@/components/admin/db-status";
import { getPurchaseOrderById } from "@/features/procurement/services";
import { listInventoryLocations } from "@/features/inventory/services";
import { formatMoneyMinor } from "@/lib/money";

export const metadata = { title: "Purchase order" };
export const dynamic = "force-dynamic";

export default async function PurchaseOrderDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const po = await getPurchaseOrderById(id);
  if (!po) notFound();
  const locations = await listInventoryLocations();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Procurement", href: "/dashboard/procurement" },
          { label: "Orders", href: "/dashboard/procurement/orders" },
          { label: po.poCode },
        ]}
        title={po.poCode}
        description={po.supplierName ?? "—"}
        actions={<PurchaseOrderStatusPill status={po.status} />}
      />
      <DbStatusNotice />

      <div className="rounded-lg border border-line-soft bg-surface p-6 grid grid-cols-2 md:grid-cols-4 gap-6">
        <Stat label="Status" value={<PurchaseOrderStatusPill status={po.status} />} />
        <Stat label="Supplier" value={po.supplierName ?? "—"} />
        <Stat label="Project" value={po.projectName ?? "—"} />
        <Stat label="Expected" value={po.expectedDelivery ?? "—"} />
        <Stat label="Received at" value={po.receivedAt ? po.receivedAt.slice(0, 10) : "—"} />
        <Stat
          label="Total"
          value={po.totalMinor !== null && po.currency ? formatMoneyMinor(po.totalMinor, po.currency) : "—"}
        />
        <Stat label="Lines" value={String(po.lines.length)} />
        <Stat label="Created" value={po.createdAt.slice(0, 10)} />
      </div>

      <Section eyebrow="Lines" title="Order lines">
        {po.lines.length === 0 ? (
          <p className="text-sm text-ink-tertiary">No lines on this order.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Description</TH>
                <TH className="text-right">Ordered</TH>
                <TH className="text-right">Received</TH>
                <TH>Unit</TH>
                <TH className="text-right">Unit cost</TH>
                <TH>Receive</TH>
              </TR>
            </THead>
            <TBody>
              {po.lines.map((l) => {
                const outstanding = l.quantityOrdered - l.quantityReceived;
                return (
                  <TR key={l.id}>
                    <TD>{l.description}</TD>
                    <TDNum>{l.quantityOrdered.toLocaleString()}</TDNum>
                    <TDNum>{l.quantityReceived.toLocaleString()}</TDNum>
                    <TD>{l.unit}</TD>
                    <TDNum>
                      {l.unitCostMinor !== null && l.currency
                        ? formatMoneyMinor(l.unitCostMinor, l.currency)
                        : "—"}
                    </TDNum>
                    <TD>
                      <ReceiveLineForm
                        poId={po.id}
                        lineId={l.id}
                        outstanding={outstanding}
                        unit={l.unit}
                        locations={locations.map((loc) => ({ id: loc.id, label: loc.name }))}
                      />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Section>

      {po.notes && (
        <Section eyebrow="Notes" title="Order notes">
          <p className="text-sm text-ink-secondary leading-relaxed whitespace-pre-line">
            {po.notes}
          </p>
        </Section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">{label}</div>
      <div className="text-sm text-ink mt-1">{value}</div>
    </div>
  );
}
