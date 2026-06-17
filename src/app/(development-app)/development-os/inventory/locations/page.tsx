import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Kpi, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listInventoryLocations } from "@/lib/development/server/inventory/inventory-queries";
import { getDevelopmentProjects } from "@/lib/development/server/projects";
import { safeQuery } from "@/lib/development/safe-query";
import { NewLocationForm } from "./_new-location-form";

export const metadata: Metadata = { title: "Inventory locations · Development OS" };
export const dynamic = "force-dynamic";

export default async function InventoryLocationsPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <header className="page-header">
          <div className="left">
            <div className="crumb">Warehouse · stock</div>
            <h1>Inventory locations</h1>
          </div>
        </header>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const [locations, projects] = await Promise.all([
    safeQuery("listInventoryLocations", listInventoryLocations(), [], 4000),
    safeQuery("getDevelopmentProjects", getDevelopmentProjects(), [], 4000),
  ]);
  const projectOptions = projects
    .filter((p) => p.source === "db")
    .map((p) => ({ id: p.realProjectId, label: p.name }));

  const types = Array.from(new Set(locations.map((l) => l.locationType)));
  const warehouseCount = locations.filter((l) =>
    l.locationType.includes("warehouse"),
  ).length;
  const virtualCount = locations.filter((l) =>
    ["in_transit", "consumed", "damaged", "returned"].includes(l.locationType),
  ).length;

  return (
    <DevelopmentShell>
      <header className="page-header">
        <div className="left">
          <div className="crumb">Warehouse · stock</div>
          <h1>
            Locations <em>· {locations.length} bins</em>
          </h1>
          <div className="page-header-meta">
            <span>{warehouseCount} physical</span>
            <span>·</span>
            <span>{virtualCount} virtual</span>
            <span>·</span>
            <span>{types.length} types</span>
          </div>
        </div>
        <div className="actions">
          <NewLocationForm projects={projectOptions} />
          <Link
            href="/development-os/inventory/items"
            className="btn btn-dark btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Items
          </Link>
        </div>
      </header>

      <p className="text-ink-secondary text-sm max-w-3xl leading-relaxed">
        Warehouses + sites + virtual buckets (in_transit, consumed, damaged,
        returned). Stock balances are tracked per (item × location).
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          label="Locations"
          value={locations.length || "—"}
          sub="bins + buckets"
          tone={locations.length ? "accent" : undefined}
        />
        <Kpi label="Physical" value={warehouseCount || "—"} sub="warehouse / site" />
        <Kpi label="Virtual" value={virtualCount || "—"} sub="in-transit / damaged" />
        <Kpi
          label="Types"
          value={types.length || "—"}
          sub={types.slice(0, 3).join(" · ") || "none yet"}
        />
      </div>

      {locations.length === 0 ? (
        <EmptyState
          title="No locations yet"
          description="Add a warehouse, site bin, or virtual bucket to start tracking stock."
          action={<NewLocationForm projects={projectOptions} />}
        />
      ) : (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <span className="label">Bin map · all locations</span>
          </div>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Project</th>
                  </tr>
                </thead>
                <tbody>
                  {locations.map((l) => (
                    <tr key={l.id}>
                      <td className="font-mono text-xs">{l.locationCode}</td>
                      <td className="row-title">{l.displayName}</td>
                      <td>
                        <HandoffBadge>{l.locationType}</HandoffBadge>
                      </td>
                      <td className="font-mono text-xs">
                        {l.projectId?.slice(0, 8) ?? "—"}
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
