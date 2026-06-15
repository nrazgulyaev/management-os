import Link from "next/link";
import { notFound } from "next/navigation";
import { Kpi, Card, HandoffBadge } from "@/components/dashboard/primitives";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { PurchaseRequestStatusPill } from "@/components/procurement/purchase-status-pill";
import { RequestActions } from "@/components/procurement/request-actions";
import { PurchaseRequestLineAddButton } from "@/components/procurement/request-line-add-button";
import { getPurchaseRequestById } from "@/features/procurement/services";
import { listInventoryItems } from "@/features/inventory/services";
import { getCurrentUserContext, hasPermission } from "@/features/auth/permissions";
import { formatMoneyMinor } from "@/lib/money";

export const metadata = { title: "Purchase request" };
export const dynamic = "force-dynamic";

export default async function PurchaseRequestDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const pr = await getPurchaseRequestById(id);
  if (!pr) notFound();
  const ctx = await getCurrentUserContext();
  const canApprove = hasPermission(ctx, "procurement.approve");
  const canWrite = hasPermission(ctx, "procurement.write");
  const lineEditable = !["ordered", "cancelled", "rejected"].includes(pr.status);
  const items = canWrite && lineEditable ? await listInventoryItems() : [];
  const itemOptions = items.map((i) => ({
    id: i.id,
    label: i.sku ? `${i.sku} · ${i.name}` : i.name,
  }));

  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/procurement">Procurement</Link> /{" "}
            <Link href="/dashboard/procurement/requests">Requests</Link> /{" "}
            <span>{pr.requestCode}</span>
          </div>
          <h1>{pr.title}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {pr.requestCode}
          </p>
        </div>
        <div className="actions">
          <RequestActions id={pr.id} status={pr.status} canApprove={canApprove} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Status" value={<PurchaseRequestStatusPill status={pr.status} />} />
        <Kpi label="Priority" value={<HandoffBadge tone="soft">{pr.priority}</HandoffBadge>} />
        <Kpi label="Supplier" value={pr.supplierName ?? "—"} />
        <Kpi label="Project" value={pr.projectName ?? "—"} />
        <Kpi
          label="Estimated"
          value={
            pr.totalEstimatedMinor !== null && pr.currency
              ? formatMoneyMinor(pr.totalEstimatedMinor, pr.currency)
              : "—"
          }
        />
        <Kpi label="Required by" value={pr.requiredBy ?? "—"} />
        <Kpi label="Requested by" value={pr.requestedByName ?? "—"} />
        <Kpi label="Created" value={pr.createdAt.slice(0, 10)} />
      </div>

      {pr.description && (
        <div>
          <div className="label mb-2.5">Description</div>
          <Card padding="default">
            <p className="text-sm text-ink-secondary leading-relaxed whitespace-pre-line">
              {pr.description}
            </p>
          </Card>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2.5">
          <div className="label">Lines</div>
          {canWrite && lineEditable && (
            <PurchaseRequestLineAddButton
              requestId={pr.id}
              items={itemOptions}
              currency={pr.currency ?? "USD"}
            />
          )}
        </div>
        {pr.lines.length === 0 ? (
          <p className="text-sm text-ink-tertiary">No lines on this request yet.</p>
        ) : (
          <Table>
            <THead>
              <TR><TH>Description</TH><TH>Qty</TH><TH>Unit</TH><TH className="text-right">Est. unit cost</TH></TR>
            </THead>
            <TBody>
              {pr.lines.map((l) => (
                <TR key={l.id}>
                  <TD>{l.description}</TD>
                  <TDNum>{l.quantity.toLocaleString()}</TDNum>
                  <TD>{l.unit}</TD>
                  <TDNum>
                    {l.estimatedUnitCostMinor !== null && l.currency
                      ? formatMoneyMinor(l.estimatedUnitCostMinor, l.currency)
                      : "—"}
                  </TDNum>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}
