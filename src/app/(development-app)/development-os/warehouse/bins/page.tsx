import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Kpi, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { ComingSoon } from "@/components/ui/state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { safeQuery } from "@/lib/development/safe-query";
import {
  listWarehouseLocations,
  type WarehouseLocationRow,
} from "@/lib/development/server/warehouse/warehouse-flow-queries";

/**
 * build-warehouse-flow — /warehouse/bins.
 *
 * HONEST-STATE bin map. The mock's variant-C bin grid wants per-cell
 * bins with zone + capacity + current occupancy. The real
 * dev_os_inventory_locations table has NO bin/zone/capacity columns —
 * only location_code, display_name, location_type, project_id. So the
 * true bin-grid (capacity gauges per cell) genuinely has no backing data.
 *
 * Rather than fabricate it, this route shows what DOES exist — the org's
 * locations grouped by location_type as "zones" — and an honest
 * coming-soon affordance for the capacity/occupancy bin grid, which
 * would require a schema migration (zone, capacity_units, current_qty)
 * that is intentionally NOT added here. No new tables.
 */

export const metadata: Metadata = {
  title: "Bin map · Warehouse · Development OS",
};
export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  warehouse: "Warehouse",
  site: "Site",
  in_transit: "In transit",
  consumed: "Consumed",
  damaged: "Damaged",
  returned: "Returned",
};

const TYPE_TONE: Record<
  string,
  "ok" | "warn" | "danger" | "gold" | "info" | "ink" | "soft" | "amber"
> = {
  warehouse: "amber",
  site: "info",
  in_transit: "gold",
  consumed: "soft",
  damaged: "danger",
  returned: "warn",
};

export default async function WarehouseBinsPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <header className="page-header">
          <div className="left">
            <div className="crumb">Warehouse · layout</div>
            <h1>Bin map</h1>
          </div>
        </header>
        <EmptyState
          variant="error"
          title="Database not configured"
          body="Set DATABASE_URL to load locations."
        />
      </DevelopmentShell>
    );
  }

  const organizationId = await requireOrgId();
  const locations = await safeQuery(
    "warehouseLocations",
    listWarehouseLocations(organizationId),
    [] as WarehouseLocationRow[],
    4000,
  );

  // Group by location_type — the nearest real concept to the mock's
  // "zones". Within a type, each location is the nearest real concept
  // to a "bin".
  const zones = new Map<string, WarehouseLocationRow[]>();
  for (const l of locations) {
    const arr = zones.get(l.locationType) ?? [];
    arr.push(l);
    zones.set(l.locationType, arr);
  }
  const zoneEntries = Array.from(zones.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  const warehouseCount = locations.filter(
    (l) => l.locationType === "warehouse",
  ).length;

  return (
    <DevelopmentShell>
      <header className="page-header">
        <div className="left">
          <div className="crumb">Warehouse · layout</div>
          <h1>
            Bin map <em>· {locations.length} locations</em>
          </h1>
          <div className="page-header-meta">
            <span>{zoneEntries.length} zones</span>
            <span>·</span>
            <span>{warehouseCount} warehouse</span>
          </div>
        </div>
        <div className="actions">
          <ComingSoon note="Per-cell bin grid with capacity gauges needs a schema migration (zone, capacity_units, current_qty). Not added in this build.">
            <button type="button" className="btn btn-amber btn-sm">
              + Bin
            </button>
          </ComingSoon>
          <Link href="/development-os/warehouse" className="btn btn-dark btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Warehouse
          </Link>
        </div>
      </header>

      <div className="card card-pad">
        <p className="text-sm text-ink-secondary leading-relaxed">
          <strong className="text-ink font-medium">
            Honest state — locations, not capacity bins.
          </strong>{" "}
          The current schema (
          <code className="font-mono text-xs">dev_os_inventory_locations</code>)
          stores location code, name, type, and project — but no zone,
          capacity, or per-cell occupancy. So this page maps the{" "}
          <em>real</em> locations grouped by type; the full capacity bin grid
          (occupancy gauges per cell, putaway planner) is deferred until a
          migration adds <code className="font-mono text-xs">zone</code>,{" "}
          <code className="font-mono text-xs">capacity_units</code>, and{" "}
          <code className="font-mono text-xs">current_qty</code>.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          label="Locations"
          value={locations.length || "—"}
          sub="active"
          tone={locations.length ? "accent" : undefined}
        />
        <Kpi label="Zones" value={zoneEntries.length || "—"} sub="by type" />
        <Kpi
          label="Warehouse"
          value={warehouseCount || "—"}
          sub="storage points"
          tone={warehouseCount > 0 ? "gold" : undefined}
        />
        <Kpi label="Capacity" value="—" sub="needs migration" />
      </div>

      {locations.length === 0 ? (
        <EmptyState
          variant="first-run"
          title="No locations yet"
          body="Create inventory locations to map the warehouse layout."
        />
      ) : (
        <div className="flex flex-col gap-6">
          {zoneEntries.map(([type, locs]) => (
            <section key={type}>
              <div className="flex items-center gap-3 mb-3">
                <span className="label">
                  {TYPE_LABEL[type] ?? type} · {locs.length}
                </span>
                <HandoffBadge tone={TYPE_TONE[type] ?? "soft"}>
                  {type.replaceAll("_", " ")}
                </HandoffBadge>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {locs.map((l) => (
                  <div
                    key={l.id}
                    className="card card-pad flex flex-col gap-1 min-w-0"
                  >
                    <span className="font-mono text-xs text-ink-secondary truncate">
                      {l.locationCode}
                    </span>
                    <span className="text-sm font-medium text-ink truncate">
                      {l.displayName}
                    </span>
                    {l.projectName ? (
                      <span className="text-xs text-ink-tertiary truncate">
                        {l.projectName}
                      </span>
                    ) : null}
                    <span className="text-xs text-ink-tertiary">
                      occupancy —
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </DevelopmentShell>
  );
}
