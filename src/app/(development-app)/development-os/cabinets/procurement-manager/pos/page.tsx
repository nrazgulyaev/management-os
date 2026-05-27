import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DevelopmentShell } from "@/components/development/development-shell";

/**
 * Phase 2.2 dev-04 — Purchase orders list.
 *
 * Mock data today; real reads against `purchase_orders` land in
 * 2.2 data.
 */

export const metadata: Metadata = { title: "Purchase orders · Development OS" };
export const dynamic = "force-dynamic";

const MOCK_POS = [
  { id: "po-001", ref: "PO-EV02-0118", vendor: "Marble Co.", project: "Eternal 02", totalUsd: 192_000, delivered: 60, status: "in-progress" },
  { id: "po-002", ref: "PO-EV02-0123", vendor: "Marble Co.", project: "Eternal 02", totalUsd: 78_000, delivered: 100, status: "delivered" },
  { id: "po-003", ref: "PO-AH01-0044", vendor: "Buana Steel", project: "Ahau 01", totalUsd: 56_000, delivered: 0, status: "issued" },
  { id: "po-004", ref: "PO-EN05-0012", vendor: "Mitra Wood", project: "Enso 05", totalUsd: 24_000, delivered: 100, status: "delivered" },
];

const STATUS_BADGE: Record<string, string> = {
  issued: "badge",
  "in-progress": "badge badge-warn",
  delivered: "badge badge-ok",
  cancelled: "badge badge-danger",
};

export default async function PoListPage() {
  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Procurement", href: "/development-os/cabinets/procurement-manager" },
          { label: "Purchase orders" },
        ]}
        eyebrow={`${MOCK_POS.length} purchase orders`}
        title="Purchase orders"
        description="Active + recent POs across every project. Click a row for delivery tracking + invoice reconciliation."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/cabinets/procurement-manager">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Procurement cabinet
            </Link>
          </Button>
        }
      />
      <table className="data">
        <thead>
          <tr>
            <th>Ref</th>
            <th>Vendor</th>
            <th>Project</th>
            <th className="num">Total</th>
            <th className="num">% delivered</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {MOCK_POS.map((p) => (
            <tr key={p.id}>
              <td className="mono">{p.ref}</td>
              <td>{p.vendor}</td>
              <td className="text-ink-3">{p.project}</td>
              <td className="num mono">${p.totalUsd.toLocaleString()}</td>
              <td className="num mono">{p.delivered}%</td>
              <td>
                <span className={STATUS_BADGE[p.status] ?? "badge"}>{p.status}</span>
              </td>
              <td>
                <Link
                  href={`/development-os/cabinets/procurement-manager/pos/${p.id}`}
                  className="btn btn-ghost btn-sm"
                >
                  Open →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </DevelopmentShell>
  );
}
