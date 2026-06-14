import Link from "next/link";
import { notFound } from "next/navigation";
import { Kpi, Card, HandoffBadge } from "@/components/dashboard/primitives";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DbStatusNotice } from "@/components/admin/db-status";
import { CountActions } from "@/components/inventory-counts/count-actions";
import { CountLineQuantityInput } from "@/components/inventory-counts/count-line-editor";
import { getInventoryCountById } from "@/features/inventory/counts-services";
import { getCurrentUserContext, hasPermission } from "@/features/auth/permissions";

export const metadata = { title: "Inventory count" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<
  string,
  "soft" | "warn" | "info" | "ok" | "danger"
> = {
  draft: "soft",
  submitted: "warn",
  approved: "ok",
  adjusted: "ok",
  cancelled: "soft",
};

export default async function CountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const count = await getInventoryCountById(id);
  if (!count) notFound();
  const ctx = await getCurrentUserContext();
  const canApprove = hasPermission(ctx, "inventory.count.approve");
  const editable = count.status === "draft";

  const totalAbsVariance = count.lines.reduce(
    (acc, l) => acc + Math.abs(l.varianceQuantity ?? 0),
    0,
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/inventory">Inventory</Link> /{" "}
            <Link href="/dashboard/inventory/counts">Counts</Link> /{" "}
            <span>{count.countCode}</span>
          </div>
          <h1>{count.countCode}</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {count.locationName}
          </p>
        </div>
        <div className="actions">
          <CountActions id={count.id} status={count.status} canApprove={canApprove} />
        </div>
      </div>
      <DbStatusNotice />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Status" value={<HandoffBadge tone={STATUS_TONES[count.status]}>{count.status}</HandoffBadge>} />
        <Kpi label="Lines" value={String(count.lines.length)} />
        <Kpi
          label="Counted at"
          value={count.countedAt ? count.countedAt.slice(0, 16).replace("T", " ") : "—"}
        />
        <Kpi
          label="Approved at"
          value={count.approvedAt ? count.approvedAt.slice(0, 16).replace("T", " ") : "—"}
        />
        <Kpi label="|Variance|" value={totalAbsVariance.toLocaleString()} />
      </div>

      <div>
        <div className="label mb-2.5">Lines</div>
        {count.lines.length === 0 ? (
          <p className="text-sm text-ink-tertiary">
            No items at this location yet — add stock first.
          </p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Item</TH>
                <TH className="text-right">Expected</TH>
                <TH>Counted</TH>
                <TH className="text-right">Variance</TH>
              </TR>
            </THead>
            <TBody>
              {count.lines.map((l) => (
                <TR key={l.id}>
                  <TD>
                    <div className="text-ink">{l.itemName}</div>
                    <div className="text-[10px] text-ink-tertiary font-mono">
                      {l.itemSku ?? "—"}
                    </div>
                  </TD>
                  <TDNum>
                    {l.expectedQuantity ?? 0} <span className="text-ink-tertiary">{l.itemUnit}</span>
                  </TDNum>
                  <TD>
                    <CountLineQuantityInput
                      lineId={l.id}
                      initial={l.countedQuantity}
                      unit={l.itemUnit}
                      disabled={!editable}
                    />
                  </TD>
                  <TDNum>
                    <span
                      className={
                        l.varianceQuantity && l.varianceQuantity !== 0
                          ? l.varianceQuantity > 0
                            ? "text-success"
                            : "text-danger"
                          : "text-ink-tertiary"
                      }
                    >
                      {l.varianceQuantity ?? 0}
                    </span>
                  </TDNum>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>

      {count.notes && (
        <div>
          <div className="label mb-2.5">Notes</div>
          <Card padding="default">
            <p className="text-sm text-ink-secondary leading-relaxed whitespace-pre-line">
              {count.notes}
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
