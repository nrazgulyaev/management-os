import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Kpi, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import {
  listAssets,
  listAssetTypes,
} from "@/lib/development/server/assets/asset-queries";
import { getDevelopmentProjects } from "@/lib/development/server/projects";
import { safeQuery } from "@/lib/development/safe-query";
import {
  NewAssetForm,
  AssetRowActions,
  AssetFilterBar,
} from "./_asset-controls";

export const metadata: Metadata = { title: "Assets · Development OS" };
export const dynamic = "force-dynamic";

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; type?: string }>;
}) {
  const params = await searchParams;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <header className="page-header">
          <div className="left">
            <div className="crumb">Portfolio · units</div>
            <h1>Assets</h1>
          </div>
        </header>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const [assets, allAssets, assetTypes, projects] = await Promise.all([
    safeQuery(
      "listAssets",
      listAssets({ category: params.category, typeKey: params.type }),
      [],
      4000,
    ),
    // Unfiltered list so the filter bar shows every category, not just the
    // categories present in the current (already filtered) result set.
    safeQuery("listAssetsAll", listAssets(), [], 4000),
    safeQuery("listAssetTypes", listAssetTypes({ activeOnly: true }), [], 4000),
    safeQuery("getDevelopmentProjects", getDevelopmentProjects(), [], 4000),
  ]);

  const categories = Array.from(new Set(assets.map((a) => a.assetCategory)));
  const allCategories = Array.from(
    new Set(allAssets.map((a) => a.assetCategory)),
  ).sort();
  const typeCount = new Set(assets.map((a) => a.assetTypeDisplayName)).size;
  const statusCount = new Set(assets.map((a) => a.status)).size;

  const projectOptions = projects
    .filter((p) => p.source === "db")
    .map((p) => ({ id: p.realProjectId, label: p.name }));
  const assetTypeOptions = assetTypes.map((t) => ({
    typeKey: t.typeKey,
    label: t.displayName,
  }));

  return (
    <DevelopmentShell>
      <header className="page-header">
        <div className="left">
          <div className="crumb">Portfolio · units</div>
          <h1>
            Assets <em>· {assets.length} units</em>
          </h1>
          <div className="page-header-meta">
            <span>{categories.length} categories</span>
            <span>·</span>
            <span>{typeCount} types</span>
            <span>·</span>
            <span>{statusCount} statuses</span>
          </div>
        </div>
        <div className="actions">
          <NewAssetForm
            projects={projectOptions}
            assetTypes={assetTypeOptions}
          />
          <Link
            href="/development-os/asset-types"
            className="btn btn-dark btn-sm"
          >
            Manage types
          </Link>
          <Link href="/development-os" className="btn btn-dark btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Command center
          </Link>
        </div>
      </header>

      <p className="text-ink-secondary text-sm max-w-3xl leading-relaxed">
        Every saleable / rentable / revenue-generating unit in the portfolio.
        Backed by the `villas` table — the name is preserved for FK
        compatibility (60+ FKs) but the table is now multi-asset.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          label="Units"
          value={assets.length || "—"}
          sub="in portfolio"
          tone={assets.length ? "accent" : undefined}
        />
        <Kpi
          label="Categories"
          value={categories.length || "—"}
          sub={categories.slice(0, 3).join(" · ") || "none yet"}
        />
        <Kpi label="Types" value={typeCount || "—"} sub="distinct asset types" />
        <Kpi label="Statuses" value={statusCount || "—"} sub="lifecycle states" />
      </div>

      {allCategories.length > 0 && (
        <AssetFilterBar
          categories={allCategories}
          types={assetTypeOptions}
          activeCategory={params.category}
          activeType={params.type}
        />
      )}

      {assets.length === 0 ? (
        params.category || params.type ? (
          <EmptyState
            title="No assets match this filter"
            description="Try a different category or type."
            action={
              <Link href="/development-os/assets" className="btn btn-secondary btn-sm">
                Clear filters
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="No assets yet"
            description="Add the first saleable, rentable, or revenue-generating unit."
            action={
              <NewAssetForm
                projects={projectOptions}
                assetTypes={assetTypeOptions}
              />
            }
          />
        )
      ) : (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <span className="label">Inventory · sorted by unit code</span>
          </div>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>Unit code</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th>Project</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {assets.map((a) => (
                    <tr key={a.id}>
                      <td className="font-mono text-xs">{a.unitCode}</td>
                      <td className="row-title">{a.name}</td>
                      <td className="text-xs">{a.assetTypeDisplayName}</td>
                      <td>
                        <HandoffBadge tone="info">{a.assetCategory}</HandoffBadge>
                      </td>
                      <td>
                        <HandoffBadge>{a.status}</HandoffBadge>
                      </td>
                      <td className="font-mono text-xs">
                        {a.projectId.slice(0, 8)}
                      </td>
                      <td className="text-right">
                        <AssetRowActions
                          assetId={a.id}
                          unitCode={a.unitCode}
                          currentTypeKey={a.assetTypeKey}
                          attributes={
                            (a.assetAttributes as Record<string, unknown>) ?? null
                          }
                          assetTypes={assetTypeOptions}
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
