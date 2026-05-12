import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listInventoryCounts } from "@/features/inventory/counts-services";
import { listInventoryLocations } from "@/features/inventory/services";
import { CountAddButton } from "@/components/inventory-counts/count-add-button";

export const metadata = { title: "Inventory counts" };
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

export default async function CountsPage() {
  const [rows, locations] = await Promise.all([
    listInventoryCounts(),
    listInventoryLocations(),
  ]);
  const locationOpts = locations.map((l) => ({ id: l.id, label: l.name }));
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Inventory", href: "/dashboard/inventory" },
          { label: "Counts" },
        ]}
        title="Stock counts"
        description="draft → submitted → approved (auto-emits count_correction movements) → adjusted."
        actions={<CountAddButton locations={locationOpts} />}
      />
      <DbStatusNotice />
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
          No counts on record yet.
        </p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Code</TH>
              <TH>Location</TH>
              <TH>Status</TH>
              <TH className="text-right">Lines</TH>
              <TH className="text-right">|Variance|</TH>
              <TH>Counted by</TH>
              <TH>Created</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((c) => (
              <TR key={c.id}>
                <TD className="font-mono text-xs">
                  <Link href={`/dashboard/inventory/counts/${c.id}`} className="hover:underline">
                    {c.countCode}
                  </Link>
                </TD>
                <TD>{c.locationName}</TD>
                <TD>
                  <Badge tone={STATUS_TONES[c.status] ?? "neutral"}>{c.status}</Badge>
                </TD>
                <TDNum>{c.lineCount}</TDNum>
                <TDNum>{c.varianceAbs.toLocaleString()}</TDNum>
                <TD className="text-xs">{c.countedByName ?? "—"}</TD>
                <TD className="text-xs text-ink-tertiary">{c.createdAt.slice(0, 10)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
