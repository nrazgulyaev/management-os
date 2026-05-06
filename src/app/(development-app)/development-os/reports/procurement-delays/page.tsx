import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { DevelopmentShell } from "@/components/development/development-shell";
import {
  computeSupplierDelays,
  rankSuppliers,
} from "@/lib/development/server/visual-reports/procurement-delays-helpers";

export const metadata: Metadata = {
  title: "Procurement delays · Development OS",
};
export const dynamic = "force-dynamic";

export default async function ProcurementDelaysPage() {
  // Stage 5.E will wire to dev_material_pos / deliveries; demo data here.
  const inputs = [
    {
      supplierId: "S1",
      supplierName: "BaliBuild Materials",
      deliveries: [
        { expectedAt: new Date("2026-01-10"), actualAt: new Date("2026-01-09") },
        { expectedAt: new Date("2026-02-10"), actualAt: new Date("2026-02-12") },
        { expectedAt: new Date("2026-03-10"), actualAt: new Date("2026-03-10") },
      ],
    },
    {
      supplierId: "S2",
      supplierName: "Sumber Sentosa",
      deliveries: [
        { expectedAt: new Date("2026-01-15"), actualAt: new Date("2026-01-18") },
        { expectedAt: new Date("2026-02-15"), actualAt: new Date("2026-02-22") },
      ],
    },
    {
      supplierId: "S3",
      supplierName: "Karya Putra",
      deliveries: [
        { expectedAt: new Date("2026-01-20"), actualAt: null },
      ],
    },
  ];
  const metrics = computeSupplierDelays(inputs);
  const ranked = rankSuppliers(metrics);

  return (
    <DevelopmentShell>
      <PageHeader
        title="Procurement delays"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Reports", href: "/development-os/reports" },
          { label: "Procurement delays" },
        ]}
        description="On-time performance and average lead-time delay per supplier."
      />
      <Section title="Suppliers (best first)">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-ink-tertiary border-b border-line-soft">
              <th className="py-2">Supplier</th>
              <th>Total deliveries</th>
              <th>Late</th>
              <th>On-time %</th>
              <th>Avg delay (days)</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((s) => (
              <tr key={s.supplierId} className="border-b border-line-soft">
                <td className="py-2">{s.supplierName}</td>
                <td className="font-mono tabular-nums">{s.totalDeliveries}</td>
                <td className="font-mono tabular-nums">{s.lateDeliveries}</td>
                <td className="font-mono tabular-nums">{s.onTimePct.toFixed(1)}%</td>
                <td className="font-mono tabular-nums">
                  {Number.isNaN(s.avgDelayDays)
                    ? "—"
                    : s.avgDelayDays.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </DevelopmentShell>
  );
}
