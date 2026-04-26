import { PageHeader } from "@/components/ui/page-header";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/ui/source-badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listBookingChannels } from "@/features/channels/services";

export const metadata = { title: "Booking channels" };
export const dynamic = "force-dynamic";

const typeTone: Record<string, "accent" | "gold" | "info" | "neutral"> = {
  ota: "accent",
  direct: "info",
  agent: "gold",
  social: "neutral",
  corporate: "neutral",
};

export default async function ChannelsPage() {
  const channels = await listBookingChannels();
  const source = channels[0]?.source ?? "mock";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Bookings", href: "/dashboard/bookings" },
          { label: "Channels" },
        ]}
        title="Booking channels"
        description="OTAs, direct, agent, and social channels — each with a default commission applied to incoming bookings."
        actions={<SourceBadge source={source} />}
      />

      <DbStatusNotice />

      <Table>
        <THead>
          <TR>
            <TH>Channel</TH>
            <TH>Key</TH>
            <TH>Type</TH>
            <TH>Commission model</TH>
            <TH className="text-right">Default %</TH>
            <TH>Status</TH>
          </TR>
        </THead>
        <TBody>
          {channels.length === 0 ? (
            <TR>
              <TD colSpan={6} className="text-ink-tertiary text-center py-8">
                No channels yet.
              </TD>
            </TR>
          ) : (
            channels.map((c) => (
              <TR key={c.id}>
                <TD className="text-ink font-medium">{c.name}</TD>
                <TD className="font-mono text-xs text-ink-tertiary">{c.key}</TD>
                <TD>
                  <Badge tone={typeTone[c.type] ?? "neutral"}>{c.type}</Badge>
                </TD>
                <TD className="text-ink-secondary">{c.commissionModel ?? "—"}</TD>
                <TDNum>
                  {c.defaultCommissionPct !== null
                    ? `${c.defaultCommissionPct.toFixed(2)}%`
                    : "—"}
                </TDNum>
                <TD>
                  <Badge tone={c.status === "active" ? "success" : "neutral"}>
                    {c.status}
                  </Badge>
                </TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>
    </div>
  );
}
