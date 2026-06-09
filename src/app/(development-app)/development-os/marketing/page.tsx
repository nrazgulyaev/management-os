import Link from "next/link";
import {
  Kpi,
  SectionHeading,
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
 * Dev OS /marketing summary cabinet — pixel redesign to
 * cabinets/new/dev-marketing.html (hero · funnel + campaigns + lead
 * sources + content pipeline). KPI strip + lead funnel are live
 * (loadMarketingCabinet). design-live gap plan · P1 keeps the two
 * remaining mock blocks wired to real data:
 *   - Active campaigns cards  → loadActiveCampaigns (campaigns + lead joins)
 *   - Per-source attribution  → loadSourceAttribution (leads + lead-source
 *     registry + campaign_costs)
 * and the two working header actions — a CSV export (./leads/export) + a
 * create-campaign modal (createCampaign action). Data wiring preserved;
 * only layout/markup restyled to the engineering palette under
 * data-surface="development-os".
 */

export const metadata = { title: "Development OS · Marketing" };
export const dynamic = "force-dynamic";

const CAMPAIGN_STATUS_TONE: Record<string, "ok" | "warn"> = {
  active: "ok",
  in_preparation: "warn",
  paused: "warn",
};

/** Token-scoped dot palette for the lead-source rollup (indexed per row
 *  so the colours track the engineering palette, not raw hex). */
const SOURCE_DOT_VARS = [
  "var(--amber)",
  "var(--steel)",
  "var(--ok)",
  "var(--warn)",
  "var(--danger)",
  "var(--ink-4)",
];

/** Content-pipeline lanes mapped onto the real content_status buckets
 *  returned by loadMarketingCabinet().contentByStatus. */
const CONTENT_LANES: Array<{ label: string; statuses: string[] }> = [
  { label: "Draft", statuses: ["idea", "draft"] },
  { label: "Review", statuses: ["in_review", "review", "scheduled"] },
  { label: "Published", statuses: ["published"] },
];

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

  // Funnel rows decorated with bar-width (% of the largest stage) and the
  // step-to-step conversion (count[i] / count[i-1]) for the mock's chart.
  const funnelMax = data.funnelByLifecycle.reduce(
    (m, r) => Math.max(m, Number(r.count)),
    0,
  );
  const funnelRows = data.funnelByLifecycle.map((r, i) => {
    const count = Number(r.count);
    const prev = i > 0 ? Number(data.funnelByLifecycle[i - 1].count) : null;
    return {
      key: r.lifecycleStatus,
      label: r.lifecycleStatus.replace(/_/g, " "),
      count,
      widthPct: funnelMax > 0 ? Math.max((count / funnelMax) * 100, 2) : 0,
      convPct: prev && prev > 0 ? Math.round((count / prev) * 100) : null,
    };
  });

  // Lead-source rollup — share of total attributed leads, for the dot rows.
  const sourceLeadTotal = sourceAttribution.reduce((s, r) => s + r.leads, 0);

  // Content pipeline lane counts + total, from the real status buckets.
  const lanes = CONTENT_LANES.map((lane) => ({
    label: lane.label,
    count: lane.statuses.reduce(
      (n, st) => n + (data.contentByStatus[st] ?? 0),
      0,
    ),
  }));
  const contentTotal = Object.values(data.contentByStatus).reduce(
    (s, n) => s + n,
    0,
  );

  return (
    <>
      <SectionHeading
        eyebrow="workspace / marketing"
        title={
          <>
            Leads, campaigns, content.{" "}
            <span className="text-amber">One pipeline.</span>
          </>
        }
        subtitle={`${data.leadsThisWeek} leads this week · ${data.activeCampaignsCount} live campaigns · ${data.contentApprovalQueueCount} awaiting review`}
        actions={
          <>
            <Link
              href="/development-os/marketing/content/new"
              prefetch={false}
              className="btn btn-dark btn-sm"
            >
              + Content
            </Link>
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

      <div className="grid grid-cols-2 gap-3 mb-[18px] sm:grid-cols-3 lg:grid-cols-5">
        <Kpi
          label="Leads · this week"
          value={String(data.leadsThisWeek)}
          sub={`${data.hotLeadsCount} hot`}
          tone={data.leadsThisWeek > 0 ? "success" : undefined}
        />
        <Kpi
          label="Active campaigns"
          value={String(data.activeCampaignsCount)}
          sub={
            data.scheduledThisWeekCount > 0
              ? `${data.scheduledThisWeekCount} scheduled this week`
              : undefined
          }
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

      <div className="grid grid-cols-1 gap-x-7 gap-y-6 lg:grid-cols-[1.3fr_1fr]">
        {/* ---- LEFT: funnel + live campaigns ---- */}
        <div className="min-w-0">
          <h2
            id="leads"
            className="font-display text-[22px] font-medium leading-none mb-3"
          >
            Funnel <span className="text-amber italic">· by stage</span>
          </h2>
          <div className="bg-surface border border-line-soft rounded-[14px] px-[18px] py-3.5">
            {funnelRows.length === 0 ? (
              <p className="text-[13px] italic text-ink-tertiary py-7 text-center m-0">
                No leads in the funnel yet.
              </p>
            ) : (
              funnelRows.map((r) => (
                <div
                  key={r.key}
                  className="grid grid-cols-[120px_1fr_72px] items-center gap-3 border-b border-line-soft py-[9px] last:border-b-0"
                >
                  <div className="text-[12.5px] font-medium text-ink capitalize">
                    {r.label}
                  </div>
                  <div className="h-[13px] rounded bg-inset overflow-hidden">
                    <div
                      className="h-full rounded bg-amber flex items-center px-2 font-mono text-[9.5px] text-[var(--carbon)] whitespace-nowrap"
                      style={{ width: `${r.widthPct}%` }}
                    >
                      {r.count}
                    </div>
                  </div>
                  <div className="font-mono text-[12px] text-ink text-right">
                    {r.count}
                    {r.convPct != null && (
                      <span className="block text-[9.5px] text-ink-tertiary mt-px">
                        {r.convPct}%
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <h2
            id="campaigns"
            className="font-display text-[22px] font-medium leading-none mt-[22px] mb-3"
          >
            Live campaigns{" "}
            <span className="text-amber italic">· {activeCampaigns.length}</span>
          </h2>
          {activeCampaigns.length === 0 ? (
            <div className="bg-surface border border-line-soft rounded-[10px] px-3.5 py-3 text-[13px] text-ink-tertiary italic">
              No active campaigns.{" "}
              <Link
                href="/development-os/marketing/campaigns"
                className="text-amber not-italic"
              >
                Manage campaigns →
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {activeCampaigns.map((c) => {
                const isDraft = c.status === "in_preparation";
                return (
                  <Link
                    key={c.id}
                    href={`/development-os/marketing/campaigns/${c.campaignCode}`}
                    className={`block bg-surface border border-line-soft rounded-[10px] px-3.5 py-3 border-l-[3px] ${
                      isDraft
                        ? "border-l-[var(--ink-4)] opacity-85"
                        : "border-l-[var(--ok)]"
                    }`}
                  >
                    <div className="flex items-baseline gap-2 mb-1.5">
                      <span className="text-[13px] font-medium text-ink">
                        {c.name}
                      </span>
                      <HandoffBadge tone={CAMPAIGN_STATUS_TONE[c.status] ?? "ok"}>
                        {c.status.replace(/_/g, " ")}
                      </HandoffBadge>
                      <span className="ml-auto font-mono text-[10px] text-ink-tertiary tabular-nums">
                        {formatMoneyMinor(c.spentMinor, c.currency, {
                          compact: true,
                        })}
                        {c.budgetMinor > 0 && (
                          <>
                            {" / "}
                            {formatMoneyMinor(c.budgetMinor, c.currency, {
                              compact: true,
                            })}
                          </>
                        )}
                      </span>
                    </div>
                    <div className="font-mono text-[10.5px] text-ink-tertiary flex gap-2.5 flex-wrap">
                      <span>{c.channels}</span>
                      <span>
                        <strong className="text-ink">{c.leadCount}</strong> leads
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* ---- RIGHT: lead sources + content pipeline ---- */}
        <div className="min-w-0 lg:border-l lg:border-line-soft lg:pl-7">
          <h2
            id="attribution"
            className="font-display text-[22px] font-medium leading-none mb-3"
          >
            Lead sources
          </h2>
          <div className="bg-surface border border-line-soft rounded-[14px] px-4 py-3">
            {sourceAttribution.length === 0 ? (
              <p className="text-[13px] italic text-ink-tertiary py-7 text-center m-0">
                No attributed leads or booked spend yet.
              </p>
            ) : (
              sourceAttribution.map((s, i) => {
                const pct =
                  sourceLeadTotal > 0
                    ? Math.round((s.leads / sourceLeadTotal) * 100)
                    : 0;
                return (
                  <div
                    key={s.sourceKey}
                    className="grid grid-cols-[14px_1fr_64px_56px] items-center gap-2.5 border-b border-line-soft py-2 last:border-b-0 text-[12.5px]"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-[2px]"
                      style={{
                        background:
                          SOURCE_DOT_VARS[i % SOURCE_DOT_VARS.length],
                      }}
                    />
                    <span className="font-medium text-ink truncate">
                      {s.sourceLabel}
                      {s.isPaid && (
                        <span className="ml-1.5 align-middle">
                          <HandoffBadge tone="warn">Paid</HandoffBadge>
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-[11px] text-ink text-right tabular-nums">
                      {pct}%
                    </span>
                    <span className="font-mono text-[10.5px] text-ink-tertiary text-right tabular-nums">
                      {s.leads}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          <h2
            id="content"
            className="font-display text-[22px] font-medium leading-none mt-[22px] mb-3"
          >
            Content pipeline{" "}
            <span className="text-amber italic">· {contentTotal}</span>
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {lanes.map((lane) => (
              <div
                key={lane.label}
                className="bg-surface border border-line-soft rounded-lg px-3 py-2.5 min-h-[120px]"
              >
                <div className="flex justify-between items-center font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-tertiary mb-2">
                  <span>{lane.label}</span>
                  <span className="text-ink font-medium tabular-nums">
                    {lane.count}
                  </span>
                </div>
                {lane.count === 0 ? (
                  <div className="text-[11px] text-ink-tertiary italic">
                    Empty
                  </div>
                ) : (
                  <div className="bg-muted rounded-md px-2.5 py-2 text-[11.5px] text-ink-secondary leading-snug">
                    <strong className="block text-ink mb-px tabular-nums">
                      {lane.count}
                    </strong>
                    {lane.label === "Published" ? "items live" : "in this lane"}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-2 text-right">
            <Link
              href="/development-os/marketing/content"
              className="font-mono text-[10.5px] text-amber uppercase tracking-[0.12em]"
            >
              Open pipeline →
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
