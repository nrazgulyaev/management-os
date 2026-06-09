import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Kpi, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listAssetTypes } from "@/lib/development/server/assets/asset-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { AssetTypeModalForm } from "@/components/development/assets/asset-type-modal-form";
import { DevOsRowActions } from "@/components/development/dev-os-row-actions";
import { NoItemsYet } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Asset types · Development OS" };
export const dynamic = "force-dynamic";

export default async function AssetTypesPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <header className="page-header">
          <div className="left">
            <div className="crumb">Portfolio · registry</div>
            <h1>Asset types</h1>
          </div>
        </header>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const types = await safeQuery(
    "listAssetTypes",
    listAssetTypes({ activeOnly: false }),
    [],
    4000,
  );
  const activeCount = types.filter((t) => t.isActive).length;
  const saleableCount = types.filter((t) => t.isSaleable).length;
  const rentableCount = types.filter((t) => t.isRentable).length;

  return (
    <DevelopmentShell>
      <header className="page-header">
        <div className="left">
          <div className="crumb">Portfolio · registry</div>
          <h1>
            Asset types <em>· {activeCount} active</em>
          </h1>
          <div className="page-header-meta">
            <span>{types.length} total</span>
            <span>·</span>
            <span>{saleableCount} saleable</span>
            <span>·</span>
            <span>{rentableCount} rentable</span>
          </div>
        </div>
        <div className="actions">
          <AssetTypeModalForm />
          <Link href="/development-os" className="btn btn-dark btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Command center
          </Link>
        </div>
      </header>

      <p className="text-ink-secondary text-sm max-w-3xl leading-relaxed">
        Strategy B for the multi-asset refactor: every entry in `villas` (now
        semantically the assets table) carries an asset_type_id pointing here.
        Seeded with 12 defaults — operators may add more, never delete in-use
        rows.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          label="Types"
          value={types.length || "—"}
          sub="in registry"
          tone={types.length ? "accent" : undefined}
        />
        <Kpi
          label="Active"
          value={activeCount || "—"}
          sub={`${types.length - activeCount} inactive`}
          tone={activeCount > 0 ? "success" : undefined}
        />
        <Kpi label="Saleable" value={saleableCount || "—"} sub="for-sale units" />
        <Kpi label="Rentable" value={rentableCount || "—"} sub="rental units" />
      </div>

      {types.length === 0 ? (
        <NoItemsYet
          entityLabel="asset types"
          description="Asset types are seeded with 12 defaults — contact support if your workspace has none."
          addAction={<AssetTypeModalForm />}
        />
      ) : (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <span className="label">Registry · asset types</span>
          </div>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Display name</th>
                    <th>Category</th>
                    <th>Saleable</th>
                    <th>Rentable</th>
                    <th>Revenue</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {types.map((t) => (
                    <tr key={t.id}>
                      <td className="font-mono text-xs">{t.typeKey}</td>
                      <td className="row-title">{t.displayName}</td>
                      <td>
                        <HandoffBadge tone="info">{t.assetCategory}</HandoffBadge>
                      </td>
                      <td className="text-xs">{t.isSaleable ? "yes" : "—"}</td>
                      <td className="text-xs">{t.isRentable ? "yes" : "—"}</td>
                      <td className="text-xs">
                        {t.isRevenueGenerating ? "yes" : "—"}
                      </td>
                      <td>
                        <HandoffBadge tone={t.isActive ? "ok" : undefined}>
                          {t.isActive ? "active" : "inactive"}
                        </HandoffBadge>
                      </td>
                      <td className="text-right">
                        <DevOsRowActions
                          kind="asset_type"
                          row={{
                            id: t.id,
                            displayName: t.displayName,
                            values: {
                              key: t.typeKey,
                              name: t.displayName,
                              description: t.description ?? "",
                            },
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </DevelopmentShell>
  );
}
