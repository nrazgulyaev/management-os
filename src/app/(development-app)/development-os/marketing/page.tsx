import Link from "next/link";
import {
  Kpi,
  SectionHeading,
  Card,
  HandoffBadge,
} from "@/components/dashboard/primitives";
import { safeQuery } from "@/lib/development/safe-query";
import { loadMarketingCabinet } from "@/lib/development/server/cabinets/marketing-cabinet-queries";
import {
  loadActiveCampaigns,
  loadSourceAttribution,
} from "@/lib/development/server/marketing/marketing-summary-queries";
import { formatMoneyMinor } from "@/lib/money";
import { NewCampaignButton } from "./_campaign-modal";

/**
 * Dev OS /marketing summary cabinet. KPI strip + lead funnel are live
 * (loadMarketingCabinet). design-live gap plan · P1 wires the two
 * remaining mock blocks to real data:
 *   - Active campaigns table  → loadActiveCampaigns (campaigns + lead joins)
 *   - Per-source attribution  → loadSourceAttribution (leads + lead-source
 *     registry + campaign_costs)
 * and replaces the two disabled header buttons with a working CSV export
 * (./leads/export) + a create-campaign modal (createCampaign action).
 */

export const metadata = { title: "Development OS · Marketing" };
export const dynamic = "force-dynamic";

const CAMPAIGN_STATUS_TONE: Record<string, "ok" | "warn"> = {
  active: "ok",
  in_preparation: "warn",
  paused: "warn",
};

export default async function DevMarketingPage() {
  const [data, activeCampaigns, sourceAttribution] = await Promise.all([
    safeQuery("devMarketingCabinet", loadMarketingCabinet(), {
      contentByStatus: {},
      contentApprovalQueueCount: 0,
      scheduledThisWeekCount: 0,
      recentlyPublishedCount: 0,
      activeCampaignsCount: 0,
      leadsThisWeek: 0,
      hotLeadsCount: 0,
      latestMarketingAssistantOutputCode: null,
      publishesLast7Days: [],
      funnelByLifecycle: [],
      recentMarketingAssistantOutputs: [],
    }),
    safeQuery("devMarketingActiveCampaigns", loadActiveCampaigns(), []),
    safeQuery("devMarketingSourceAttribution", loadSourceAttribution(), []),
  ]);

  const totalFunnel = data.funnelByLifecycle.reduce(
    (s, r) => s + Number(r.count),
    0,
  );
  const reservation = data.funnelByLifecycle.find(
    (r) => r.lifecycleStatus === "reservation",
  );
  const conversionPct =
    totalFunnel > 0 && reservation
      ? ((Number(reservation.count) / totalFunnel) * 100).toFixed(1)
      : null;
  const contentBacklog =
    (data.contentByStatus.draft ?? 0) + (data.contentByStatus.idea ?? 0);

  return (
    <>
      <SectionHeading
        eyebrow="Marketing · 6 channels"
        title={
          <>
            Leads, campaigns, content.{" "}
            <span style={{ color: "var(--amber)" }}>One pipeline.</span>
          </>
        }
        subtitle="Per-source attribution, content calendar, manager performance, conversation logs across WhatsApp + email."
        actions={
          <>
            <Link
              href="/development-os/marketing/leads/export"
              prefetch={false}
              className="btn btn-dark btn-sm"
            >
              Export leads ↓
            </Link>
            <NewCampaignButton />
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 18 }}>
        <Kpi
          label="Leads · this week"
          value={String(data.leadsThisWeek)}
          sub={`${data.hotLeadsCount} hot`}
          tone={data.leadsThisWeek > 0 ? "success" : undefined}
        />
        <Kpi
          label="Active campaigns"
          value={String(data.activeCampaignsCount)}
          sub={data.scheduledThisWeekCount > 0 ? `${data.scheduledThisWeekCount} scheduled this week` : undefined}
        />
        <Kpi
          label="Approval queue"
          value={String(data.contentApprovalQueueCount)}
          sub="awaiting review"
          tone="accent"
        />
        <Kpi
          label="Conversion · lead → reservation"
          value={conversionPct ? `${conversionPct}%` : "—"}
          sub={totalFunnel > 0 ? `${totalFunnel} in funnel` : "no funnel data"}
          tone="accent"
        />
        <Kpi
          label="Content backlog"
          value={String(contentBacklog)}
          sub={`${data.contentByStatus.draft ?? 0} drafts · ${data.contentByStatus.idea ?? 0} ideas`}
        />
      </div>

      <h2
        id="leads"
        className="display"
        style={{ fontSize: 22, marginBottom: 14, fontWeight: 500 }}
      >
        Lead funnel · by stage
      </h2>
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Lifecycle stage</th>
              <th className="num">Leads</th>
              <th className="num">% of funnel</th>
            </tr>
          </thead>
          <tbody>
            {data.funnelByLifecycle.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ textAlign: "center", color: "var(--ink-3)", padding: "28px 0", fontStyle: "italic" }}>
                  No leads in the funnel yet.
                </td>
              </tr>
            ) : (
              data.funnelByLifecycle.map((r) => (
                <tr key={r.lifecycleStatus}>
                  <td style={{ textTransform: "capitalize" }}>
                    {r.lifecycleStatus.replace(/_/g, " ")}
                  </td>
                  <td className="num">{r.count}</td>
                  <td className="num">
                    {totalFunnel > 0 ? `${((Number(r.count) / totalFunnel) * 100).toFixed(1)}%` : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      <h2
        id="attribution"
        className="display"
        style={{ fontSize: 22, marginBottom: 14, fontWeight: 500, marginTop: 24 }}
      >
        Attribution · by source
      </h2>
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Source</th>
              <th>Channel</th>
              <th className="num">Leads</th>
              <th className="num">Qualified</th>
              <th className="num">Reservations</th>
              <th className="num">Spend</th>
              <th className="num">CPL</th>
            </tr>
          </thead>
          <tbody>
            {sourceAttribution.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "var(--ink-3)", padding: "28px 0", fontStyle: "italic" }}>
                  No attributed leads or booked spend yet.
                </td>
              </tr>
            ) : (
              sourceAttribution.map((s) => (
                <tr key={s.sourceKey}>
                  <td>
                    {s.sourceLabel}
                    {s.isPaid && (
                      <span style={{ marginLeft: 6 }}>
                        <HandoffBadge tone="warn">Paid</HandoffBadge>
                      </span>
                    )}
                  </td>
                  <td style={{ color: "var(--ink-3)", textTransform: "capitalize" }}>
                    {s.channelType.replace(/_/g, " ")}
                  </td>
                  <td className="num">{s.leads}</td>
                  <td className="num">{s.qualified}</td>
                  <td className="num">{s.reservations}</td>
                  <td className="num">
                    {s.spendMinor > 0 ? formatMoneyMinor(s.spendMinor, s.currency, { compact: true }) : "—"}
                  </td>
                  <td className="num">
                    {s.cplMinor != null ? formatMoneyMinor(s.cplMinor, s.currency) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      <h2
        id="campaigns"
        className="display"
        style={{ fontSize: 22, marginBottom: 14, fontWeight: 500, marginTop: 24 }}
      >
        Active campaigns
      </h2>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <table className="data">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Channel</th>
              <th className="num">Spend / Budget</th>
              <th className="num">Leads</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {activeCampaigns.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", color: "var(--ink-3)", padding: "28px 0", fontStyle: "italic" }}>
                  No active campaigns. <Link href="/development-os/marketing/campaigns" style={{ color: "var(--amber)" }}>Manage campaigns →</Link>
                </td>
              </tr>
            ) : (
              activeCampaigns.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link
                      href={`/development-os/marketing/campaigns/${c.campaignCode}`}
                      style={{ color: "inherit" }}
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td style={{ color: "var(--ink-3)" }}>{c.channels}</td>
                  <td className="num">
                    {formatMoneyMinor(c.spentMinor, c.currency, { compact: true })}
                    {c.budgetMinor > 0 && (
                      <span style={{ color: "var(--ink-3)" }}>
                        {" / "}
                        {formatMoneyMinor(c.budgetMinor, c.currency, { compact: true })}
                      </span>
                    )}
                  </td>
                  <td className="num">{c.leadCount}</td>
                  <td>
                    <HandoffBadge tone={CAMPAIGN_STATUS_TONE[c.status] ?? "ok"}>
                      {c.status.replace(/_/g, " ")}
                    </HandoffBadge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}
