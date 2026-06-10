import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Kpi, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { safeQuery } from "@/lib/development/safe-query";
import {
  listWarehouseMovements,
  countWarehouseMovementsByType,
  listWarehouseItems,
} from "@/lib/development/server/warehouse/warehouse-flow-queries";

/**
 * build-warehouse-flow — /warehouse/movements.
 *
 * Filterable movements LOG: every dev_os_inventory_movements row
 * (receipt/issue/adjust/transfer) for the current org, filterable by
 * type / item / date range. Org-scoped reads via requireOrgId; the
 * movement row IS the immutable audit record (written by
 * recordInventoryMovement). GET-form filters keep this a server
 * component — no client island needed.
 */

export const metadata: Metadata = {
  title: "Movements log · Warehouse · Development OS",
};
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
const OUTBOUND = new Set([
  "issued_to_site",
  "used",
  "damaged",
  "lost",
  "written_off",
]);

const ALL_TYPES = [
  "received",
  "reserved",
  "unreserved",
  "issued_to_site",
  "used",
  "returned",
  "damaged",
  "lost",
  "transferred",
  "written_off",
  "adjusted",
] as const;

function isoOrUndefined(v: string | undefined): string | undefined {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
}

export default async function WarehouseMovementsLogPage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string;
    item?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const params = await searchParams;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <header className="page-header">
          <div className="left">
            <div className="crumb">Warehouse · log</div>
            <h1>Movements log</h1>
          </div>
        </header>
        <EmptyState
          variant="error"
          title="Database not configured"
          body="Set DATABASE_URL to load the movements log."
        />
      </DevelopmentShell>
    );
  }

  const organizationId = await requireOrgId();
  const typeFilter = ALL_TYPES.includes(params.type as (typeof ALL_TYPES)[number])
    ? params.type
    : undefined;
  const dateFrom = isoOrUndefined(params.from);
  const dateTo = isoOrUndefined(params.to);
  const itemFilter = params.item || undefined;

  const [movements, typeCounts, items] = await Promise.all([
    safeQuery(
      "warehouseMovements",
      listWarehouseMovements({
        organizationId,
        movementType: typeFilter,
        itemId: itemFilter,
        dateFrom,
        dateTo,
        limit: 300,
      }),
      [],
      4000,
    ),
    safeQuery(
      "warehouseMovementTypeCounts",
      countWarehouseMovementsByType(organizationId),
      [],
      4000,
    ),
    safeQuery(
      "warehouseItems",
      listWarehouseItems(organizationId),
      [],
      4000,
    ),
  ]);

  const inCount = movements.filter((m) => INBOUND.has(m.movementType)).length;
  const outCount = movements.filter((m) => OUTBOUND.has(m.movementType)).length;
  const adjCount = movements.filter(
    (m) => m.movementType === "adjusted" || m.movementType === "transferred",
  ).length;
  const totalAll = typeCounts.reduce((acc, t) => acc + t.count, 0);
  const hasFilter = Boolean(typeFilter || itemFilter || dateFrom || dateTo);

  return (
    <DevelopmentShell>
      <header className="page-header">
        <div className="left">
          <div className="crumb">Warehouse · log</div>
          <h1>
            Movements log <em>· {movements.length} shown</em>
          </h1>
          <div className="page-header-meta">
            <span>{inCount} in</span>
            <span>·</span>
            <span>{outCount} out</span>
            <span>·</span>
            <span>{adjCount} adj / transfer</span>
            <span>·</span>
            <span>{totalAll} total all-time</span>
          </div>
        </div>
        <div className="actions">
          <Link
            href="/development-os/warehouse/picks"
            className="btn btn-amber btn-sm"
          >
            Picks today
          </Link>
          <Link
            href="/development-os/warehouse"
            className="btn btn-dark btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Warehouse
          </Link>
        </div>
      </header>

      <p className="text-ink-secondary text-sm max-w-3xl leading-relaxed">
        Append-only stock movement log, org-scoped. Every receipt, issue,
        adjustment, and transfer is recorded here as an immutable audit row.
        Filter by type, item, or date range.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          label="Shown"
          value={movements.length || "—"}
          sub={hasFilter ? "filtered" : "last 300"}
          tone={movements.length ? "accent" : undefined}
        />
        <Kpi
          label="In"
          value={inCount || "—"}
          sub="received + returned"
          tone={inCount > 0 ? "success" : undefined}
        />
        <Kpi label="Out" value={outCount || "—"} sub="issued + used" />
        <Kpi
          label="Adjust / transfer"
          value={adjCount || "—"}
          sub="reconciliation"
          tone={adjCount > 0 ? "warn" : undefined}
        />
      </div>

      <section className="card card-pad">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="field">
            <span className="field-label">Type</span>
            <select name="type" defaultValue={typeFilter ?? ""} className="select">
              <option value="">All types</option>
              {ALL_TYPES.map((t) => {
                const c = typeCounts.find((tc) => tc.movementType === t);
                return (
                  <option key={t} value={t}>
                    {t.replaceAll("_", " ")}
                    {c ? ` (${c.count})` : ""}
                  </option>
                );
              })}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Item</span>
            <select name="item" defaultValue={itemFilter ?? ""} className="select">
              <option value="">All items</option>
              {items.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.sku} · {it.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">From</span>
            <input
              type="date"
              name="from"
              defaultValue={dateFrom ?? ""}
              className="input"
            />
          </label>
          <label className="field">
            <span className="field-label">To</span>
            <input
              type="date"
              name="to"
              defaultValue={dateTo ?? ""}
              className="input"
            />
          </label>
          <div className="flex items-center gap-2">
            <button type="submit" className="btn btn-primary btn-sm">
              Apply filters
            </button>
            {hasFilter && (
              <Link
                href="/development-os/warehouse/movements"
                className="btn btn-sm"
              >
                Clear
              </Link>
            )}
          </div>
        </form>
      </section>

      {movements.length === 0 ? (
        <EmptyState
          variant={hasFilter ? "no-results" : "first-run"}
          title={hasFilter ? "No movements match" : "No movements yet"}
          body={
            hasFilter
              ? "Adjust or clear the filters to see more of the log."
              : "Receipts, issues, and transfers appear here as they happen."
          }
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
                    <th>Destination</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <td className="font-mono text-xs">{m.movementCode}</td>
                      <td className="text-xs">{m.movementDate}</td>
                      <td>
                        <HandoffBadge tone={MOVEMENT_TONE[m.movementType]}>
                          {m.movementType.replaceAll("_", " ")}
                        </HandoffBadge>
                      </td>
                      <td className="text-xs">
                        {m.itemSku ? (
                          <span>
                            <span className="font-mono">{m.itemSku}</span>
                            {m.itemName ? ` · ${m.itemName}` : ""}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="num">
                        {Number(m.quantity).toFixed(2)}
                        {m.unitOfMeasure ? (
                          <span className="text-ink-tertiary">
                            {" "}
                            {m.unitOfMeasure}
                          </span>
                        ) : null}
                      </td>
                      <td className="font-mono text-xs">
                        {m.fromLocationCode ?? "·"} → {m.toLocationCode ?? "·"}
                      </td>
                      <td className="text-xs">
                        {m.projectName ?? m.villaName ?? "—"}
                      </td>
                      <td className="text-xs">
                        {m.responsibleUserName ?? "—"}
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
