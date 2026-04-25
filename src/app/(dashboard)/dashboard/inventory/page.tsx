import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { Section } from "@/components/ui/section";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export const metadata = { title: "Inventory & procurement" };

const lowStock = [
  { sku: "LIN-TOWEL-WH-L", name: "Bath towel · white · large", location: "Eternal warehouse", qty: 12, par: 48, tone: "warning" as const },
  { sku: "TOI-SOAP-REF", name: "Refill · organic hand soap", location: "Enso S2", qty: 2, par: 6, tone: "warning" as const },
  { sku: "POOL-CHLO-20", name: "Pool chlorine granules (20kg)", location: "Ahau warehouse", qty: 1, par: 4, tone: "danger" as const },
  { sku: "LIN-BED-K", name: "Bed sheet · king", location: "Enso S5", qty: 5, par: 12, tone: "warning" as const },
];

const pendingPRs = [
  { id: "PR-00412", villa: "Enso S6", items: "AC compressor (1)", amount: "Rp 14.5M", status: "Awaiting Director" },
  { id: "PR-00411", villa: "Ahau 01", items: "Irrigation fittings (set)", amount: "Rp 2.8M", status: "Awaiting Ops Manager" },
  { id: "PR-00410", villa: "Eternal 07", items: "Bathrobes (6)", amount: "Rp 3.6M", status: "Awaiting Ops Manager" },
];

export default function InventoryPage() {
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[{ label: "Operations", href: "/dashboard/operations" }, { label: "Inventory & procurement" }]}
        title="Inventory & procurement"
        description="Stock levels across warehouses and villas, plus pending purchase requests awaiting approval."
        actions={
          <Button>
            <Plus className="w-4 h-4" strokeWidth={1.75} />
            New purchase request
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Low-stock alerts" value="4" hint="2 warehouse · 2 villa" />
        <MetricCard label="Pending PRs" value="3" hint="IDR 20.9M total" />
        <MetricCard label="Open POs" value="7" hint="IDR 148.2M outstanding" />
        <MetricCard label="Active suppliers" value="28" hint="Across 9 categories" />
      </div>

      <Section
        eyebrow="Low stock"
        title="Items below reorder threshold"
        description="Alerts ranked by urgency and location."
      >
        <Table>
          <THead>
            <TR>
              <TH>SKU</TH>
              <TH>Item</TH>
              <TH>Location</TH>
              <TH className="text-right">Qty</TH>
              <TH className="text-right">Par</TH>
              <TH>Severity</TH>
            </TR>
          </THead>
          <TBody>
            {lowStock.map((l) => (
              <TR key={l.sku}>
                <TD className="font-mono text-xs text-ink-tertiary">{l.sku}</TD>
                <TD className="text-ink">{l.name}</TD>
                <TD className="text-ink-secondary">{l.location}</TD>
                <TDNum className={l.tone === "danger" ? "text-danger" : "text-warning"}>
                  {l.qty}
                </TDNum>
                <TDNum className="text-ink-tertiary">{l.par}</TDNum>
                <TD>
                  <Badge tone={l.tone}>{l.tone === "danger" ? "Critical" : "Below par"}</Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Section>

      <Section eyebrow="Procurement" title="Purchase requests awaiting approval">
        <div className="rounded-md border border-line-soft bg-surface overflow-hidden divide-y divide-line-soft">
          {pendingPRs.map((pr) => (
            <div
              key={pr.id}
              className="flex items-center justify-between gap-4 p-5"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-ink-tertiary">
                    {pr.id}
                  </span>
                  <Badge tone="outline">{pr.villa}</Badge>
                </div>
                <div className="text-sm text-ink mt-2">{pr.items}</div>
              </div>
              <div className="flex items-center gap-6">
                <span className="font-mono tabular-nums text-sm text-ink">
                  {pr.amount}
                </span>
                <Badge tone="warning">{pr.status}</Badge>
                <Button size="sm" variant="secondary">
                  Review
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
