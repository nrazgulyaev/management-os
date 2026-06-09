import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Kpi, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import {
  listInventoryItems,
  listInventoryLocations,
  listInventoryMovements,
} from "@/lib/development/server/inventory/inventory-queries";
import { projects } from "@/lib/db/schema/projects";
import { safeQuery } from "@/lib/development/safe-query";
import { MovementDevAddButton } from "@/components/development/inventory/movement-dev-add-button";

export const metadata: Metadata = { title: "Movements · Development OS" };
export const dynamic = "force-dynamic";

const MOVEMENT_TONE: Record<
  string,
  "ok" | "warn" | "danger" | "gold" | "info" | "ink" | undefined
> = {
  received: "ok",
  reserved: "info",
  unreserved: undefined,
  issued_to_site: "info",
  used: undefined,
  returned: "info",
  damaged: "danger",
  lost: "danger",
  transferred: "info",
  written_off: "danger",
  adjusted: "warn",
};

const INBOUND = new Set(["received", "returned", "unreserved"]);
const OUTBOUND = new Set(["issued_to_site", "used", "damaged", "lost", "written_off"]);

export default async function InventoryMovementsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const params = await searchParams;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <header className="page-header">
          <div className="left">
            <div className="crumb">Warehouse · stock</div>
            <h1>Movements</h1>
          </div>
        </header>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const [movements, items, locations, projectRows] = await Promise.all([
    safeQuery(
      "listInventoryMovements",
      listInventoryMovements({ movementType: params.type, limit: 200 }),
      [],
      4000,
    ),
    safeQuery(
      "movements.items",
      listInventoryItems({ activeOnly: true }),
      [] as Awaited<ReturnType<typeof listInventoryItems>>,
      4000,
    ),
    safeQuery(
      "movements.locations",
      listInventoryLocations(),
      [] as Awaited<ReturnType<typeof listInventoryLocations>>,
      4000,
    ),
    safeQuery(
      "movements.projects",
      db.select({ id: projects.id, name: projects.name }).from(projects),
      [] as Array<{ id: string; name: string }>,
      4000,
    ),
  ]);

  const inCount = movements.filter((m) => INBOUND.has(m.movementType)).length;
  const outCount = movements.filter((m) => OUTBOUND.has(m.movementType)).length;
  const adjCount = movements.filter(
    (m) => m.movementType === "adjusted" || m.movementType === "transferred",
  ).length;

  return (
    <DevelopmentShell>
      <header className="page-header">
        <div className="left">
          <div className="crumb">Warehouse · stock</div>
          <h1>
            Movements <em>· {movements.length} logged</em>
          </h1>
          <div className="page-header-meta">
            <span>{inCount} in</span>
            <span>·</span>
            <span>{outCount} out</span>
            <span>·</span>
            <span>{adjCount} adj / transfer</span>
          </div>
        </div>
        <div className="actions">
          <MovementDevAddButton
            items={items}
            locations={locations}
            projects={projectRows}
          />
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
        Append-only stock movement log. Every received, reserved, issued,
        transferred, used, damaged, etc. event is recorded here. Stock balances
        are derived (atomic writes via inventory-actions.ts).
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          label="Movements"
          value={movements.length || "—"}
          sub="last 200"
          tone={movements.length ? "accent" : undefined}
        />
        <Kpi
          label="In"
          value={inCount || "—"}
          sub="received + returned"
          tone={inCount > 0 ? "success" : undefined}
        />
        <Kpi
          label="Out"
          value={outCount || "—"}
          sub="issued + used"
        />
        <Kpi
          label="Adjust / transfer"
          value={adjCount || "—"}
          sub="reconciliation"
          tone={adjCount > 0 ? "warn" : undefined}
        />
      </div>

      {movements.length === 0 ? (
        <EmptyState
          title="No movements yet"
          description="Use 'Record movement' above to log the first stock event."
        />
      ) : (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <span className="label">Log · most recent first</span>
          </div>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Item</th>
                    <th className="num">Quantity</th>
                    <th>From → To</th>
                    <th>Project</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <td className="font-mono text-xs">{m.movementCode}</td>
                      <td className="text-xs">{m.movementDate}</td>
                      <td>
                        <HandoffBadge tone={MOVEMENT_TONE[m.movementType]}>
                          {m.movementType}
                        </HandoffBadge>
                      </td>
                      <td className="font-mono text-xs">
                        {m.itemId.slice(0, 8)}
                      </td>
                      <td className="num">{Number(m.quantity).toFixed(2)}</td>
                      <td className="font-mono text-xs">
                        {m.fromLocationId?.slice(0, 8) ?? "·"} →{" "}
                        {m.toLocationId?.slice(0, 8) ?? "·"}
                      </td>
                      <td className="font-mono text-xs">
                        {m.projectId?.slice(0, 8) ?? "—"}
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
