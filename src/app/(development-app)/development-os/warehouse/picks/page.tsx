import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, MapPin, Building2, Boxes } from "lucide-react";
import { Kpi, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { safeQuery } from "@/lib/development/safe-query";
import {
  listTodayPicksByDestination,
  listWarehouseItems,
  listPickDestinations,
  listSourceWarehouseLocations,
} from "@/lib/development/server/warehouse/warehouse-flow-queries";
import { DispatchPickPanel } from "@/components/development/warehouse/dispatch-pick-panel";

/**
 * build-warehouse-flow — /warehouse/picks.
 *
 * Today's picks grouped by destination (project / villa / site location).
 * Each group shows how many issue-style movements have already been
 * dispatched there today + the distinct SKUs. The dispatch panel writes
 * a real issued_to_site inventory_movement via the org-scoped dispatchPick
 * action (atomic balance decrement + immutable audit row reused from
 * recordInventoryMovement). Org-scoped reads via requireOrgId.
 */

export const metadata: Metadata = {
  title: "Picks today · Warehouse · Development OS",
};
export const dynamic = "force-dynamic";

function groupIcon(kind: "project" | "villa" | "location") {
  if (kind === "project") return Building2;
  if (kind === "villa") return Boxes;
  return MapPin;
}

export default async function WarehousePicksPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <header className="page-header">
          <div className="left">
            <div className="crumb">Warehouse · outbound</div>
            <h1>Picks today</h1>
          </div>
        </header>
        <EmptyState
          variant="error"
          title="Database not configured"
          body="Set DATABASE_URL to load today's picks."
        />
      </DevelopmentShell>
    );
  }

  const organizationId = await requireOrgId();
  const [groups, items, destinations, sources] = await Promise.all([
    safeQuery(
      "todayPicksByDestination",
      listTodayPicksByDestination(organizationId),
      [],
      4000,
    ),
    safeQuery("picksItems", listWarehouseItems(organizationId), [], 4000),
    safeQuery(
      "pickDestinations",
      listPickDestinations(organizationId),
      [],
      4000,
    ),
    safeQuery(
      "pickSources",
      listSourceWarehouseLocations(organizationId),
      [],
      4000,
    ),
  ]);

  const totalDispatched = groups.reduce((a, g) => a + g.dispatchedToday, 0);
  const totalSkus = groups.reduce((a, g) => a + g.distinctSkus, 0);

  return (
    <DevelopmentShell>
      <header className="page-header">
        <div className="left">
          <div className="crumb">Warehouse · outbound</div>
          <h1>
            Picks today <em>· {groups.length} destinations</em>
          </h1>
          <div className="page-header-meta">
            <span>{totalDispatched} dispatched</span>
            <span>·</span>
            <span>{totalSkus} SKUs out</span>
          </div>
        </div>
        <div className="actions">
          <Link
            href="/development-os/warehouse/movements"
            className="btn btn-amber btn-sm"
          >
            Movements log
          </Link>
          <Link href="/development-os/warehouse" className="btn btn-dark btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Warehouse
          </Link>
        </div>
      </header>

      <p className="text-ink-secondary text-sm max-w-3xl leading-relaxed">
        Stock leaving the warehouse for site teams today, grouped by
        destination. Dispatch a pick below — it writes an issue movement and
        decrements the source location balance atomically.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Kpi
          label="Destinations"
          value={groups.length || "—"}
          sub="with picks today"
          tone={groups.length ? "accent" : undefined}
        />
        <Kpi
          label="Dispatched"
          value={totalDispatched || "—"}
          sub="issue movements today"
        />
        <Kpi
          label="SKUs out"
          value={totalSkus || "—"}
          sub="distinct items"
          tone={totalSkus > 0 ? "gold" : undefined}
        />
      </div>

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <span className="label">New pick · dispatch to site</span>
        </div>
        <DispatchPickPanel
          items={items.map((i) => ({
            id: i.id,
            sku: i.sku,
            displayName: i.displayName,
            unitOfMeasure: i.unitOfMeasure,
          }))}
          sources={sources.map((s) => ({
            id: s.id,
            locationCode: s.locationCode,
            displayName: s.displayName,
          }))}
          destinations={destinations.map((d) => ({
            value: d.value,
            label: d.label,
          }))}
        />
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <span className="label">Today · grouped by destination</span>
        </div>
        {groups.length === 0 ? (
          <EmptyState
            variant="caught-up"
            title="No picks dispatched yet today"
            body="When stock is issued to a villa, project, or site location it appears here grouped by destination."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {groups.map((g) => {
              const Icon = groupIcon(g.kind);
              return (
                <div key={g.key} className="card card-pad flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="shrink-0 w-9 h-9 rounded-full border border-line-soft bg-canvas inline-flex items-center justify-center">
                        <Icon
                          className="w-4 h-4 text-ink-secondary"
                          strokeWidth={1.75}
                        />
                      </span>
                      <span className="font-medium text-ink truncate">
                        {g.label}
                      </span>
                    </div>
                    <HandoffBadge tone="soft">{g.kind}</HandoffBadge>
                  </div>
                  <div className="flex items-baseline gap-4">
                    <div>
                      <div className="text-2xl font-medium text-ink tabular-nums">
                        {g.dispatchedToday}
                      </div>
                      <div className="text-xs text-ink-tertiary">
                        picks today
                      </div>
                    </div>
                    <div>
                      <div className="text-2xl font-medium text-ink tabular-nums">
                        {g.distinctSkus}
                      </div>
                      <div className="text-xs text-ink-tertiary">SKUs</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </DevelopmentShell>
  );
}
