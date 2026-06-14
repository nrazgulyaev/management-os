import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import {
  getInventoryItemBySku,
  listInventoryMovements,
} from "@/lib/development/server/inventory/inventory-queries";

export const metadata: Metadata = { title: "Item · Development OS" };
export const dynamic = "force-dynamic";

const MOVEMENT_TONE: Record<string, "info" | "ok" | "warn" | "danger" | "soft"> = {
  received: "ok",
  reserved: "info",
  unreserved: "soft",
  issued_to_site: "info",
  used: "soft",
  returned: "info",
  damaged: "danger",
  lost: "danger",
  transferred: "info",
  written_off: "danger",
  adjusted: "warn",
};

export default async function InventoryItemDetailPage({
  params,
}: {
  params: Promise<{ sku: string }>;
}) {
  const { sku } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Item</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const data = await getInventoryItemBySku(decodeURIComponent(sku));
  if (!data) notFound();
  const { item, balances } = data;

  const movements = await listInventoryMovements({
    itemId: item.id,
    limit: 50,
  });

  const totalOnHand = balances.reduce(
    (acc, b) => acc + Number(b.quantityOnHand ?? 0),
    0,
  );

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/inventory/items">Inventory</Link> /{" "}
            <span>{item.sku}</span>
          </div>
          <div className="label">{`${item.category} · ${item.unitOfMeasure}`}</div>
          <h1>{item.displayName}</h1>
          {item.description && (
            <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
              {item.description}
            </p>
          )}
        </div>
        <div className="actions">
          <Link
            href="/development-os/inventory/items"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            All items
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">
          Stock · Total on hand: {totalOnHand.toLocaleString()}{" "}
          {item.unitOfMeasure}
        </div>
        {balances.length === 0 ? (
          <p className="text-sm text-ink-tertiary">
            No stock recorded yet for this SKU.
          </p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Location</TH>
                <TH>On hand</TH>
                <TH>Reserved</TH>
                <TH>Available</TH>
                <TH>Last movement</TH>
              </TR>
            </THead>
            <TBody>
              {balances.map((b) => (
                <TR key={b.id}>
                  <TD className="text-sm">
                    <span className="font-mono text-xs">{b.locationCode}</span>
                    <span className="ml-2 text-ink-secondary">
                      {b.locationName}
                    </span>
                  </TD>
                  <TDNum>{Number(b.quantityOnHand).toFixed(2)}</TDNum>
                  <TDNum>{Number(b.quantityReserved).toFixed(2)}</TDNum>
                  <TDNum>{Number(b.quantityAvailable).toFixed(2)}</TDNum>
                  <TD className="text-xs">
                    {b.lastMovementAt
                      ? new Date(b.lastMovementAt).toLocaleString()
                      : "—"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>

      <div>
        <div className="label mb-2.5">
          Activity · {movements.length} recent movements
        </div>
        {movements.length === 0 ? (
          <p className="text-sm text-ink-tertiary">No movements yet.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Date</TH>
                <TH>Type</TH>
                <TH>Quantity</TH>
                <TH>From</TH>
                <TH>To</TH>
                <TH>Reason</TH>
              </TR>
            </THead>
            <TBody>
              {movements.map((m) => (
                <TR key={m.id}>
                  <TD className="font-mono text-xs">{m.movementCode}</TD>
                  <TD className="text-xs">{m.movementDate}</TD>
                  <TD>
                    <HandoffBadge tone={MOVEMENT_TONE[m.movementType] ?? "soft"}>
                      {m.movementType}
                    </HandoffBadge>
                  </TD>
                  <TDNum>{Number(m.quantity).toFixed(2)}</TDNum>
                  <TD className="font-mono text-xs">
                    {m.fromLocationId?.slice(0, 8) ?? "—"}
                  </TD>
                  <TD className="font-mono text-xs">
                    {m.toLocationId?.slice(0, 8) ?? "—"}
                  </TD>
                  <TD className="text-xs">{m.reason ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </DevelopmentShell>
  );
}
