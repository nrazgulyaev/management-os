import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
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
  "neutral" | "warning" | "info" | "success" | "danger"
> = {
  draft: "neutral",
  submitted: "warning",
  approved: "success",
  adjusted: "success",
  cancelled: "neutral",
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
      <PageHeader
        breadcrumbs={[
          { label: "Inventory", href: "/dashboard/inventory" },
          { label: "Counts", href: "/dashboard/inventory/counts" },
          { label: count.countCode },
        ]}
        title={count.countCode}
        description={count.locationName}
        actions={
          <CountActions id={count.id} status={count.status} canApprove={canApprove} />
        }
      />
      <DbStatusNotice />

      <div className="rounded-lg border border-line-soft bg-surface p-6 grid grid-cols-2 md:grid-cols-4 gap-6">
        <Stat label="Status" value={<Badge tone={STATUS_TONES[count.status]}>{count.status}</Badge>} />
        <Stat label="Lines" value={String(count.lines.length)} />
        <Stat
          label="Counted at"
          value={count.countedAt ? count.countedAt.slice(0, 16).replace("T", " ") : "—"}
        />
        <Stat
          label="Approved at"
          value={count.approvedAt ? count.approvedAt.slice(0, 16).replace("T", " ") : "—"}
        />
        <Stat label="|Variance|" value={totalAbsVariance.toLocaleString()} />
      </div>

      <Section eyebrow="Lines" title="Item × counted quantity">
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
      </Section>

      {count.notes && (
        <Section eyebrow="Notes" title="Operator notes">
          <p className="text-sm text-ink-secondary leading-relaxed whitespace-pre-line">
            {count.notes}
          </p>
        </Section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">{label}</div>
      <div className="text-sm text-ink mt-1">{value}</div>
    </div>
  );
}
