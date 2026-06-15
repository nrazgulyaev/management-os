import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listResidualUnits } from "@/lib/development/server/residual-inventory/residual-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Residual inventory · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "ok" | "warn" | "soft"> = {
  unsold: "warn",
  held: "info",
  transferred_to_management: "ok",
  sold_later: "ok",
  reallocated: "soft",
};

function fmtUsd(b: bigint | string | number | null): string {
  if (b == null) return "—";
  const n = typeof b === "bigint" ? Number(b) : Number(b);
  return `$${(n / 100).toLocaleString("en-US")}`;
}

export default async function ResidualInventoryPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Residual inventory</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const units = await safeQuery("listResidualUnits", listResidualUnits(), [], 4000);

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Residual inventory</span>
          </div>
          <h1>Residual inventory</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Villas that became residual after project completion. Ownership
            shares between Arconique and investors are computed via one of four
            settlement methods (sum-to-100% per unit enforced by DB trigger).
          </p>
        </div>
        <div className="actions">
          <Link href="/development-os" className="btn btn-secondary btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Command center
          </Link>
        </div>
      </div>

      {units.length === 0 ? (
        <EmptyState
          title="No residual units yet"
          description="When a project completes without a full sellout, mark unsold villas as residual via the markUnitAsResidual server action."
        />
      ) : (
        <div>
          <div className="label mb-2.5">Catalog</div>
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Unit</th>
                  <th scope="col">Project</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="num">Active valuation</th>
                  <th scope="col">Method</th>
                  <th scope="col">Became residual</th>
                </tr>
              </thead>
              <tbody>
                {units.map((u) => (
                  <tr key={u.id}>
                    <td className="mono text-xs">
                      <Link
                        href={`/development-os/residual-inventory/${u.id}`}
                        className="hover:underline"
                      >
                        {u.unitId.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="mono text-xs">
                      {u.projectId.slice(0, 8)}
                    </td>
                    <td>
                      <HandoffBadge tone={STATUS_TONE[u.status] ?? "soft"}>
                        {u.status}
                      </HandoffBadge>
                    </td>
                    <td className="num">{fmtUsd(u.activeValuationMinor)}</td>
                    <td className="text-xs">{u.activeValuationMethod}</td>
                    <td className="text-xs">{u.becameResidualAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </DevelopmentShell>
  );
}
