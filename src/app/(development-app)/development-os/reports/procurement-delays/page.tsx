import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import {
  computeSupplierDelays,
  rankSuppliers,
} from "@/lib/development/server/visual-reports/procurement-delays-helpers";
import { getProcurementDelaysData } from "@/lib/development/server/visual-reports/report-data";

export const metadata: Metadata = {
  title: "Procurement delays · Development OS",
};
export const dynamic = "force-dynamic";

export default async function ProcurementDelaysPage() {
  // Real expected (PO.expected_delivery_date) vs actual (delivery_date) per
  // vendor, org-scoped via material_purchase_orders.organization_id.
  const inputs = await getProcurementDelaysData();
  const metrics = computeSupplierDelays(inputs);
  const ranked = rankSuppliers(metrics);

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/reports">Reports</Link> /{" "}
            <span>Procurement delays</span>
          </div>
          <h1>Procurement delays</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            On-time performance and average lead-time delay per supplier.
          </p>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Suppliers (best first)</div>
        {ranked.length === 0 ? (
          <EmptyState
            title="No purchase orders yet"
            description="Create material purchase orders with expected delivery dates to track supplier performance."
          />
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Supplier</th>
                  <th scope="col" className="num">Total deliveries</th>
                  <th scope="col" className="num">Late</th>
                  <th scope="col" className="num">On-time %</th>
                  <th scope="col" className="num">Avg delay (days)</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((s) => (
                  <tr key={s.supplierId}>
                    <td className="row-title">{s.supplierName}</td>
                    <td className="num">{s.totalDeliveries}</td>
                    <td className="num">{s.lateDeliveries}</td>
                    <td className="num">{s.onTimePct.toFixed(1)}%</td>
                    <td className="num">
                      {Number.isNaN(s.avgDelayDays)
                        ? "—"
                        : s.avgDelayDays.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </DevelopmentShell>
  );
}
