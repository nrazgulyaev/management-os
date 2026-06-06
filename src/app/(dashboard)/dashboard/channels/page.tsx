import Link from "next/link";
import { Kpi } from "@/components/dashboard/primitives";
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

  const connected = channels.filter((c) => c.status === "active").length;
  const otaChannels = channels.filter((c) => c.type === "ota");
  const otaWithPct = otaChannels.filter((c) => c.defaultCommissionPct !== null);
  const avgCommission = otaWithPct.length
    ? otaWithPct.reduce((s, c) => s + (c.defaultCommissionPct ?? 0), 0) / otaWithPct.length
    : null;

  return (
    <>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/bookings">Bookings</Link> / <span>Channels</span>
          </div>
          <h1>Booking channels</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[700px]">
            OTAs, direct, agent, and social channels — each with a default commission
            applied to incoming bookings.
          </p>
        </div>
        <div className="actions">
          <SourceBadge source={source} />
        </div>
      </div>

      {channels.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-[18px] mb-[18px]">
          <Kpi label="Channels · total" value={String(channels.length)} sub="configured" />
          <Kpi
            label="Connected"
            value={String(connected)}
            sub="active"
            tone={connected > 0 ? "success" : undefined}
          />
          <Kpi
            label="OTA channels"
            value={String(otaChannels.length)}
            sub="commission-bearing"
            tone={otaChannels.length > 0 ? "accent" : undefined}
          />
          <Kpi
            label="Avg OTA commission"
            value={avgCommission !== null ? `${avgCommission.toFixed(1)}%` : "—"}
            sub="default rate"
          />
        </div>
      )}

      <DbStatusNotice />

      <div className="mt-[18px]">
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
    </>
  );
}
