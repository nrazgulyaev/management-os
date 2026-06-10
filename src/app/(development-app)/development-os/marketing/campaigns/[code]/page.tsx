import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SectionHeading, HandoffBadge } from "@/components/dashboard/primitives";
import { formatMoneyMinor } from "@/lib/money";
import {
  getCampaignByCode,
  listCampaignCosts,
} from "@/lib/development/server/campaigns/campaign-queries";

export const metadata: Metadata = { title: "Campaign · Marketing" };
export const dynamic = "force-dynamic";

/**
 * Dev OS campaign detail — pixel redesign to cabinets/new/dev-marketing.html
 * §03 (campaign detail · daily chart + budget). Replaces the legacy
 * PageHeader/Section/Badge shell with the handoff design system (SectionHeading
 * + .det-h meta row + .chart-box daily-impressions bars + .kv metrics + amber
 * action buttons), scoped to the engineering palette under
 * data-product="development". Data wiring preserved verbatim:
 *   - getCampaignByCode(code)        → header, budget, metrics K/V
 *   - listCampaignCosts(campaign.id) → daily-impressions chart + spend roll-up
 * No new fetch; the chart + metrics are derived from the existing cost rows.
 */

const STATUS_TONE: Record<string, "ok" | "warn" | "info" | "soft"> = {
  active: "ok",
  live: "ok",
  in_preparation: "warn",
  planned: "warn",
  paused: "warn",
  completed: "info",
  archived: "soft",
};

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const campaign = await getCampaignByCode(code);
  if (!campaign) notFound();
  const costs = await listCampaignCosts(campaign.id);

  const totalCost = costs.reduce((a, c) => a + Number(c.costMinor), 0);
  const budget = Number(campaign.totalBudgetMinor);
  const burnPct = budget > 0 ? (totalCost / budget) * 100 : 0;

  // Daily-impressions chart — one bar per cost period (oldest → newest),
  // normalised to the busiest period. Falls back to an empty rail when no
  // cost rows carry impression data.
  const chronological = [...costs].reverse();
  const maxImpr = chronological.reduce(
    (m, c) => Math.max(m, Number(c.impressions ?? 0)),
    0,
  );
  const bars = chronological.map((c) => ({
    id: c.id,
    impressions: Number(c.impressions ?? 0),
    heightPct:
      maxImpr > 0
        ? Math.max((Number(c.impressions ?? 0) / maxImpr) * 100, 4)
        : 4,
  }));

  // Roll-up metrics across all cost rows for the right-hand K/V panel.
  const totals = costs.reduce(
    (acc, c) => ({
      impressions: acc.impressions + Number(c.impressions ?? 0),
      clicks: acc.clicks + Number(c.clicks ?? 0),
      conversions: acc.conversions + Number(c.conversions ?? 0),
    }),
    { impressions: 0, clicks: 0, conversions: 0 },
  );
  const ctr =
    totals.impressions > 0
      ? ((totals.clicks / totals.impressions) * 100).toFixed(1)
      : null;
  const costPerLead =
    totals.conversions > 0
      ? formatMoneyMinor(
          BigInt(Math.round(totalCost / totals.conversions)),
          campaign.currency,
          { compact: true },
        )
      : null;

  const tone = STATUS_TONE[campaign.status] ?? "soft";

  return (
    <>
      <SectionHeading
        eyebrow={`marketing / campaign / ${campaign.campaignCode}`}
        title={
          <>
            {campaign.name}{" "}
            <span className="text-amber italic">
              · {campaign.status.replace(/_/g, " ")}
            </span>
          </>
        }
        subtitle={campaign.campaignObjective}
        actions={
          <Link
            href="/development-os/marketing/campaigns"
            prefetch={false}
            className="btn btn-dark btn-sm"
          >
            ← Back
          </Link>
        }
      />

      {/* meta strip — campaign code · period · budget · spend · burn */}
      <div className="flex flex-wrap gap-x-[18px] gap-y-2 font-mono text-[11px] text-ink-tertiary mb-[22px] items-center">
        <HandoffBadge tone={tone}>
          {campaign.status.replace(/_/g, " ")}
        </HandoffBadge>
        <span>
          code <strong className="text-ink-secondary">{campaign.campaignCode}</strong>
        </span>
        <span>
          started <strong className="text-ink-secondary">{campaign.campaignStart}</strong>
        </span>
        <span>
          ends <strong className="text-ink-secondary">{campaign.campaignEnd}</strong>
        </span>
        <span>
          budget{" "}
          <strong className="text-ink-secondary">
            {formatMoneyMinor(budget, campaign.currency, { compact: true })}
          </strong>
        </span>
        <span>
          spent{" "}
          <strong className="text-ink-secondary">
            {formatMoneyMinor(totalCost, campaign.currency, { compact: true })}
          </strong>
        </span>
        <span>
          burn <strong className="text-ink-secondary">{burnPct.toFixed(1)}%</strong>
        </span>
      </div>

      <div className="grid grid-cols-1 gap-x-7 gap-y-6 lg:grid-cols-[1.3fr_1fr]">
        {/* ---- LEFT: daily chart + budget ---- */}
        <div className="min-w-0">
          <h3 className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-tertiary font-medium mb-3.5">
            Daily impressions
          </h3>
          <div className="bg-surface border border-line-soft rounded-[10px] px-4 py-3.5">
            <div className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-tertiary mb-2">
              impressions · {chronological.length} period(s)
            </div>
            {bars.length === 0 ? (
              <p className="text-[13px] italic text-ink-tertiary py-6 text-center m-0">
                No cost data with impressions yet.
              </p>
            ) : (
              <>
                <div className="flex items-end gap-0.5 h-20">
                  {bars.map((b) => (
                    <span
                      key={b.id}
                      className="flex-1 bg-amber rounded-[1px] min-h-[4px]"
                      style={{ height: `${b.heightPct}%` }}
                      title={`${b.impressions.toLocaleString()} impressions`}
                    />
                  ))}
                </div>
                <div className="flex justify-between mt-1.5 font-mono text-[9.5px] text-ink-tertiary">
                  <span>earliest</span>
                  <span>{Math.round(chronological.length / 2)} period</span>
                  <span>latest</span>
                </div>
              </>
            )}
          </div>

          <h3 className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-tertiary font-medium mt-[22px] mb-3.5">
            Spend vs budget
          </h3>
          <div className="bg-surface border border-line-soft rounded-[10px] px-4 py-3.5">
            <div className="flex items-baseline justify-between mb-2">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-tertiary">
                {burnPct.toFixed(0)}% spent
              </span>
              <span className="font-mono text-[11px] text-ink tabular-nums">
                {formatMoneyMinor(totalCost, campaign.currency, {
                  compact: true,
                })}{" "}
                /{" "}
                {formatMoneyMinor(budget, campaign.currency, { compact: true })}
              </span>
            </div>
            <div className="h-[13px] rounded bg-inset overflow-hidden">
              <div
                className="h-full rounded bg-amber"
                style={{ width: `${Math.min(burnPct, 100)}%` }}
              />
            </div>
          </div>

          <h3 className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-tertiary font-medium mt-[22px] mb-3.5">
            Cost entries{" "}
            <span className="text-amber">· {costs.length}</span>
          </h3>
          <Link
            href={`/development-os/marketing/campaigns/${code}/costs`}
            prefetch={false}
            className="inline-block bg-surface border border-line-soft rounded-[10px] px-3.5 py-3 text-[12.5px] text-ink hover:border-line w-full"
          >
            View all cost entries{" "}
            <span className="font-mono text-[10.5px] text-ink-tertiary">
              ({costs.length})
            </span>{" "}
            <span className="text-amber">→</span>
          </Link>
        </div>

        {/* ---- RIGHT: metrics + actions ---- */}
        <div className="min-w-0 lg:border-l lg:border-line-soft lg:pl-7">
          <h3 className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-tertiary font-medium mb-3.5">
            Metrics
          </h3>
          <div className="bg-surface border border-line-soft rounded-[10px] px-4 py-3">
            {(
              [
                ["objective", campaign.campaignObjective],
                [
                  "channels",
                  campaign.primaryChannels.length > 0
                    ? campaign.primaryChannels.join(" · ")
                    : "—",
                ],
                [
                  "audience",
                  campaign.targetAudienceDescription ?? "—",
                ],
                ["impressions", totals.impressions.toLocaleString()],
                [
                  "clicks",
                  ctr
                    ? `${totals.clicks.toLocaleString()} · CTR ${ctr}%`
                    : totals.clicks.toLocaleString(),
                ],
                ["conversions", totals.conversions.toLocaleString()],
                ["cost / lead", costPerLead ?? "—"],
              ] as const
            ).map(([k, v]) => (
              <div
                key={k}
                className="grid grid-cols-[110px_1fr] gap-3 border-b border-line-soft py-[7px] last:border-b-0 text-[12.5px]"
              >
                <span className="font-mono text-[10.5px] uppercase tracking-[0.10em] text-ink-tertiary">
                  {k}
                </span>
                <span className="text-ink">{v}</span>
              </div>
            ))}
          </div>

          <h3 className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-tertiary font-medium mt-[22px] mb-3.5">
            Actions
          </h3>
          <div className="flex flex-col gap-2">
            <Link
              href={`/development-os/marketing/campaigns/${code}/costs`}
              prefetch={false}
              className="btn btn-amber w-full justify-center"
            >
              Log cost entry
            </Link>
            <Link
              href={`/development-os/marketing/content/new?campaign=${campaign.campaignCode}`}
              prefetch={false}
              className="btn btn-dark w-full justify-center"
            >
              Draft content for this campaign
            </Link>
            <Link
              href="/development-os/marketing/attribution"
              prefetch={false}
              className="btn btn-dark w-full justify-center"
            >
              View attribution
            </Link>
            <Link
              href="/development-os/marketing/campaigns"
              prefetch={false}
              className="btn btn-ghost w-full justify-center"
            >
              All campaigns
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
