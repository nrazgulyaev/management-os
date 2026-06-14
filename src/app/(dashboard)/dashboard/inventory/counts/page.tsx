import Link from "next/link";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listInventoryCounts } from "@/features/inventory/counts-services";
import { listInventoryLocations } from "@/features/inventory/services";
import { CountAddButton } from "@/components/inventory-counts/count-add-button";

export const metadata = { title: "Inventory counts" };
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

export default async function CountsPage() {
  const [rows, locations] = await Promise.all([
    listInventoryCounts(),
    listInventoryLocations(),
  ]);
  const locationOpts = locations.map((l) => ({ id: l.id, label: l.name }));
  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/inventory">Inventory</Link> /{" "}
            <span>Counts</span>
          </div>
          <h1>Stock counts</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            draft → submitted → approved (auto-emits count_correction movements) → adjusted.
          </p>
        </div>
        <div className="actions">
          <CountAddButton locations={locationOpts} />
        </div>
      </div>
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
                  <HandoffBadge tone={STATUS_TONES[c.status] ?? "soft"}>{c.status}</HandoffBadge>
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
