import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { PurchaseRequestStatusPill } from "@/components/procurement/purchase-status-pill";
import { RequestActions } from "@/components/procurement/request-actions";
import { getPurchaseRequestById } from "@/features/procurement/services";
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

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Procurement", href: "/dashboard/procurement" },
          { label: "Requests", href: "/dashboard/procurement/requests" },
          { label: pr.requestCode },
        ]}
        title={pr.title}
        description={pr.requestCode}
        actions={<RequestActions id={pr.id} status={pr.status} canApprove={canApprove} />}
      />

      <div className="rounded-lg border border-line-soft bg-surface p-6 grid grid-cols-2 md:grid-cols-4 gap-6">
        <Stat label="Status" value={<PurchaseRequestStatusPill status={pr.status} />} />
        <Stat label="Priority" value={<Badge tone="outline">{pr.priority}</Badge>} />
        <Stat label="Supplier" value={pr.supplierName ?? "—"} />
        <Stat label="Project" value={pr.projectName ?? "—"} />
        <Stat
          label="Estimated"
          value={
            pr.totalEstimatedMinor !== null && pr.currency
              ? formatMoneyMinor(pr.totalEstimatedMinor, pr.currency)
              : "—"
          }
        />
        <Stat label="Required by" value={pr.requiredBy ?? "—"} />
        <Stat label="Requested by" value={pr.requestedByName ?? "—"} />
        <Stat label="Created" value={pr.createdAt.slice(0, 10)} />
      </div>

      {pr.description && (
        <Section eyebrow="Description" title="Brief">
          <p className="text-sm text-ink-secondary leading-relaxed whitespace-pre-line">
            {pr.description}
          </p>
        </Section>
      )}

      <Section eyebrow="Lines" title={`${pr.lines.length} requested item${pr.lines.length === 1 ? "" : "s"}`}>
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
      </Section>
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
