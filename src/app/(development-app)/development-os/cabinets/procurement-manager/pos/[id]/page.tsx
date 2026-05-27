import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DevelopmentShell } from "@/components/development/development-shell";
import { NumKpi } from "@/components/projects/num-kpi";
import { ProgressBar } from "@/components/projects/progress-bar";

/**
 * Phase 2.2 dev-04 — Purchase order detail (mock).
 */

export const dynamic = "force-dynamic";

const MOCK = {
  "po-001": {
    ref: "PO-EV02-0118",
    vendor: "Marble Co.",
    project: "Eternal 02",
    totalUsd: 192_000,
    deliveredUsd: 115_200,
    issuedAt: "2026-01-12",
    deliveries: [
      { date: "2026-01-22", qty: 120, unit: "m²", note: "First shipment · 60%" },
      { date: "2026-02-04", qty: 60, unit: "m²", note: "Premium swap (Hindari)" },
    ],
  },
} as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const po = (MOCK as Record<string, { ref: string }>)[id];
  return { title: po ? `${po.ref}` : "PO" };
}

export default async function PoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const po = (MOCK as Record<string, (typeof MOCK)["po-001"]>)[id] ?? MOCK["po-001"];
  const pct = (po.deliveredUsd / po.totalUsd) * 100;

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Procurement", href: "/development-os/cabinets/procurement-manager" },
          { label: "POs", href: "/development-os/cabinets/procurement-manager/pos" },
          { label: po.ref },
        ]}
        eyebrow={`${po.vendor} · ${po.project}`}
        title={po.ref}
        description={`Issued ${po.issuedAt}`}
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/cabinets/procurement-manager/pos">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              All POs
            </Link>
          </Button>
        }
      />

      <div className="cfo-detail-kpis" style={{ marginBottom: 18 }}>
        <NumKpi label="Total" value={`$${po.totalUsd.toLocaleString()}`} tone="accent" />
        <NumKpi label="Delivered" value={`$${po.deliveredUsd.toLocaleString()}`} tone="ok" />
        <NumKpi label="Outstanding" value={`$${(po.totalUsd - po.deliveredUsd).toLocaleString()}`} tone="warn" />
        <NumKpi label="Vendor" value={po.vendor} />
      </div>

      <div style={{ margin: "18px 0 28px" }}>
        <ProgressBar pct={pct} caption="Delivery progress" label={`${Math.round(pct)}%`} tone={pct >= 99 ? "ok" : "accent"} />
      </div>

      <h2 className="display text-[22px] mb-3" style={{ fontWeight: 500 }}>Deliveries</h2>
      <table className="data">
        <thead>
          <tr>
            <th>Date</th>
            <th className="num">Qty</th>
            <th>Unit</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {po.deliveries.map((d, i) => (
            <tr key={i}>
              <td className="mono">{d.date}</td>
              <td className="num mono">{d.qty}</td>
              <td className="mono">{d.unit}</td>
              <td className="text-ink-3">{d.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </DevelopmentShell>
  );
}
