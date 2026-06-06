import Link from "next/link";
import { Kpi } from "@/components/dashboard/primitives";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/ui/source-badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listBookingChannels } from "@/features/channels/services";
import { listVillas } from "@/features/villas/services";
import { getChannelVillaCoverage } from "@/features/channels/queries";
import { ChannelRowActions } from "./_channel-row-actions";
import { ChannelModalButton } from "./_channel-modal";
import { ConnectVillaWizardButton } from "./_connect-wizard";

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
  const [channels, coverage, villas] = await Promise.all([
    listBookingChannels(),
    getChannelVillaCoverage().catch(() => ({ villaCount: 0, channels: [] })),
    listVillas().catch(() => []),
  ]);
  const source = channels[0]?.source ?? "mock";

  const connected = channels.filter((c) => c.status === "active").length;
  const otaChannels = channels.filter((c) => c.type === "ota");
  const otaWithPct = otaChannels.filter((c) => c.defaultCommissionPct !== null);
  const avgCommission = otaWithPct.length
    ? otaWithPct.reduce((s, c) => s + (c.defaultCommissionPct ?? 0), 0) / otaWithPct.length
    : null;

  const { villaCount, channels: cov } = coverage;

  const wizardChannels = channels
    .filter((c) => c.status !== "archived")
    .map((c) => ({
      id: c.id,
      key: c.key,
      name: c.name,
      type: c.type,
      connectedCount: cov.find((x) => x.id === c.id)?.connectedCount ?? 0,
    }));
  const wizardVillas = villas
    .filter((v) => v.status !== "archived")
    .map((v) => ({
      id: v.id,
      unitCode: v.unitCode,
      projectName: v.projectName,
      projectId: v.projectId,
    }));

  const buckets = [
    {
      cls: "matched",
      label: "Connected · all villas",
      rows: cov.filter((c) => villaCount > 0 && c.connectedCount >= villaCount),
    },
    {
      cls: "ambiguous",
      label: "Partial coverage",
      rows: cov.filter((c) => c.connectedCount > 0 && c.connectedCount < villaCount),
    },
    {
      cls: "unmatched",
      label: "Not connected",
      rows: cov.filter((c) => c.connectedCount === 0),
    },
  ];

  return (
    <>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/bookings">Bookings</Link> / <span>Channels</span>
          </div>
          <h1>Booking channels</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[700px]">
            Channels are workspace-wide commission defaults; each villa connects to a
            channel via a calendar feed.
          </p>
        </div>
        <div className="actions">
          <SourceBadge source={source} />
          <Link href="/dashboard/integrations/calendar-feeds" className="btn btn-secondary btn-sm">
            Calendar feeds →
          </Link>
          <ConnectVillaWizardButton
            villas={wizardVillas}
            channels={wizardChannels}
            triggerClassName="btn btn-secondary btn-sm"
            triggerLabel="Connect villa"
          />
          <ChannelModalButton
            mode="create"
            triggerClassName="btn btn-accent btn-sm"
            triggerLabel="+ New channel"
          />
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
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {channels.length === 0 ? (
              <TR>
                <TD colSpan={7} className="text-ink-tertiary text-center py-8">
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
                  <TD className="text-right">
                    <ChannelRowActions
                      channel={{
                        id: c.id,
                        key: c.key,
                        name: c.name,
                        type: c.type,
                        commissionModel: c.commissionModel,
                        defaultCommissionPct: c.defaultCommissionPct,
                        status: c.status,
                      }}
                    />
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </div>

      {/* Per-villa connection coverage (listing matcher) */}
      {channels.length > 0 && (
        <>
          <h2 className="display text-[22px] font-normal mt-8 mb-1">Per-villa connections</h2>
          <p className="text-[13px] text-ink-3 mb-3.5 max-w-[760px]">
            Coverage across {villaCount} active villa{villaCount === 1 ? "" : "s"} — which
            channels have a calendar feed wired per villa.{" "}
            <Link
              href="/dashboard/integrations/calendar-feeds"
              className="underline hover:text-ink"
            >
              Manage feeds →
            </Link>
          </p>
          <div className="listing-matcher mb-[18px]">
            {buckets.map((b) => (
              <div key={b.cls} className={`lm-bucket lm-${b.cls}`}>
                <div className="lm-bucket-head">
                  <span className="lm-bucket-label">{b.label}</span>
                  <span className="lm-bucket-count">{b.rows.length}</span>
                </div>
                {b.rows.length === 0 ? (
                  <div className="lm-row">
                    <span className="lm-listing-name text-ink-3 italic">None</span>
                    <span />
                  </div>
                ) : (
                  b.rows.map((r) => (
                    <div key={r.id} className="lm-row">
                      <span className="lm-listing-name">
                        {r.name}{" "}
                        <span className="font-mono text-[11px] text-ink-4">· {r.key}</span>
                      </span>
                      <span className="lm-listing-id">
                        {r.connectedCount}/{villaCount} villas connected
                      </span>
                    </div>
                  ))
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
