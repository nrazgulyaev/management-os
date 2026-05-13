import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
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

const MOVEMENT_TONE: Record<string, "info" | "success" | "warning" | "danger" | "neutral"> = {
  received: "success",
  reserved: "info",
  unreserved: "neutral",
  issued_to_site: "info",
  used: "neutral",
  returned: "info",
  damaged: "danger",
  lost: "danger",
  transferred: "info",
  written_off: "danger",
  adjusted: "warning",
};

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
        <PageHeader title="Movements" />
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

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Inventory", href: "/development-os/inventory/items" },
          { label: "Movements" },
        ]}
        eyebrow={`${movements.length} movement${movements.length === 1 ? "" : "s"}`}
        title="Inventory movements"
        description="Append-only stock movement log. Every received, reserved, issued, transferred, used, damaged, etc. event is recorded here. Stock balances are derived (atomic writes via inventory-actions.ts)."
        actions={
          <div className="flex gap-2">
            <MovementDevAddButton
              items={items}
              locations={locations}
              projects={projectRows}
            />
            <Button asChild variant="secondary">
              <Link href="/development-os/inventory/items">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Items
              </Link>
            </Button>
          </div>
        }
      />

      {movements.length === 0 ? (
        <EmptyState
          title="No movements yet"
          description="Use 'Record movement' above to log the first stock event."
        />
      ) : (
        <Section eyebrow="Log" title="Most recent first">
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Date</TH>
                <TH>Type</TH>
                <TH>Item</TH>
                <TH>Quantity</TH>
                <TH>From → To</TH>
                <TH>Project</TH>
              </TR>
            </THead>
            <TBody>
              {movements.map((m) => (
                <TR key={m.id}>
                  <TD className="font-mono text-xs">{m.movementCode}</TD>
                  <TD className="text-xs">{m.movementDate}</TD>
                  <TD>
                    <Badge tone={MOVEMENT_TONE[m.movementType] ?? "neutral"}>
                      {m.movementType}
                    </Badge>
                  </TD>
                  <TD className="font-mono text-xs">{m.itemId.slice(0, 8)}</TD>
                  <TDNum>{Number(m.quantity).toFixed(2)}</TDNum>
                  <TD className="font-mono text-xs">
                    {m.fromLocationId?.slice(0, 8) ?? "·"} →{" "}
                    {m.toLocationId?.slice(0, 8) ?? "·"}
                  </TD>
                  <TD className="font-mono text-xs">
                    {m.projectId?.slice(0, 8) ?? "—"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Section>
      )}
    </DevelopmentShell>
  );
}
