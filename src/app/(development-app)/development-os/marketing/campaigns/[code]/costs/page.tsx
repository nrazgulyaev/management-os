import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  SectionHeading,
  Kpi,
  HandoffBadge,
} from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { formatMoneyMinor } from "@/lib/money";
import {
  getCampaignByCode,
  listCampaignCosts,
} from "@/lib/development/server/campaigns/campaign-queries";
import { listLeadSources } from "@/lib/development/server/lead-sources/lead-source-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { LogCostButton } from "./_cost-form";

/**
 * Campaign cost ledger — DS restyle of the legacy PageHeader/Section
 * table (dev-marketing.html brick: SectionHeading + Kpi strip + DS
 * table). Data wiring preserved: getCampaignByCode + listCampaignCosts.
 * Gap-close addition: <LogCostButton> mounts the previously UI-less
 * `recordCampaignCost` server action, so the detail page's "Log cost
 * entry" CTA now lands on a working write surface. Source keys for the
 * form come from the active lead-source registry.
 */

export const metadata: Metadata = { title: "Campaign costs · Marketing" };
export const dynamic = "force-dynamic";

const DATA_SOURCE_TONE: Record<string, "ok" | "info" | "soft"> = {
  manual_entry: "soft",
  imported_csv: "info",
  meta_api: "ok",
  google_ads_api: "ok",
  tiktok_ads_api: "ok",
};

export default async function CampaignCostsPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const campaign = await getCampaignByCode(code);
  if (!campaign) notFound();
  const [costs, sources] = await Promise.all([
    listCampaignCosts(campaign.id),
    safeQuery("costFormSources", listLeadSources({ activeOnly: true }), []),
  ]);

  const totalCost = costs.reduce((a, c) => a + Number(c.costMinor), 0);
  const totalImpressions = costs.reduce(
    (a, c) => a + Number(c.impressions ?? 0),
    0,
  );
  const totalClicks = costs.reduce((a, c) => a + Number(c.clicks ?? 0), 0);
  const totalConversions = costs.reduce(
    (a, c) => a + Number(c.conversions ?? 0),
    0,
  );
  const budget = Number(campaign.totalBudgetMinor);
  const burnPct = budget > 0 ? (totalCost / budget) * 100 : 0;
  const sourceKeys = sources.map((s) => s.sourceKey);

  return (
    <>
      <SectionHeading
        eyebrow={`marketing / campaign / ${campaign.campaignCode} / costs`}
        title={
          <>
            {campaign.name}{" "}
            <span className="text-amber italic">· cost ledger</span>
          </>
        }
        subtitle={`${costs.length} cost entr${costs.length === 1 ? "y" : "ies"} booked against this campaign.`}
        actions={
          <>
            {sourceKeys.length > 0 && (
              <LogCostButton
                campaignId={campaign.id}
                defaultCurrency={campaign.currency}
                sourceKeys={sourceKeys}
              />
            )}
            <Link
              href={`/development-os/marketing/campaigns/${code}`}
              prefetch={false}
              className="btn btn-dark btn-sm"
            >
              ← Campaign
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 mb-[18px] sm:grid-cols-4">
        <Kpi
          label="Total spend"
          value={formatMoneyMinor(totalCost, campaign.currency, {
            compact: true,
          })}
          sub={
            budget > 0
              ? `${burnPct.toFixed(0)}% of ${formatMoneyMinor(budget, campaign.currency, { compact: true })}`
              : "no budget set"
          }
          tone={burnPct > 100 ? "danger" : undefined}
        />
        <Kpi label="Impressions" value={totalImpressions.toLocaleString()} />
        <Kpi
          label="Clicks"
          value={totalClicks.toLocaleString()}
          sub={
            totalImpressions > 0
              ? `CTR ${((totalClicks / totalImpressions) * 100).toFixed(1)}%`
              : undefined
          }
        />
        <Kpi
          label="Conversions"
          value={totalConversions.toLocaleString()}
          tone={totalConversions > 0 ? "success" : undefined}
        />
      </div>

      {costs.length === 0 ? (
        <EmptyState
          variant="first-run"
          title="No costs recorded"
          body="Log manual spend entries here, or import them from the ad platforms once a connection is live."
          actions={
            sourceKeys.length > 0 ? (
              <LogCostButton
                campaignId={campaign.id}
                defaultCurrency={campaign.currency}
                sourceKeys={sourceKeys}
              />
            ) : (
              <Link
                href="/development-os/marketing/lead-sources"
                prefetch={false}
                className="btn btn-dark btn-sm"
              >
                Add a lead source first
              </Link>
            )
          }
        />
      ) : (
        <div className="bg-surface border border-line-soft rounded-[12px] overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-inset border-b border-line-soft font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-tertiary">
                <th className="text-left px-4 py-2.5 font-medium">period</th>
                <th className="text-left px-3 py-2.5 font-medium">source</th>
                <th className="text-right px-3 py-2.5 font-medium">cost</th>
                <th className="text-right px-3 py-2.5 font-medium">impr.</th>
                <th className="text-right px-3 py-2.5 font-medium">clicks</th>
                <th className="text-right px-3 py-2.5 font-medium">conv.</th>
                <th className="text-left px-4 py-2.5 font-medium">
                  data source
                </th>
              </tr>
            </thead>
            <tbody>
              {costs.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-line-soft last:border-b-0 hover:bg-cream-warm"
                >
                  <td className="px-4 py-2.5 font-mono text-[10.5px] text-ink whitespace-nowrap">
                    {c.periodStart} → {c.periodEnd}
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-ink-secondary">
                    {c.sourceKey}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[11.5px] text-ink tabular-nums">
                    {formatMoneyMinor(Number(c.costMinor), c.currency, {
                      compact: true,
                    })}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[11.5px] text-ink-secondary tabular-nums">
                    {c.impressions?.toLocaleString() ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[11.5px] text-ink-secondary tabular-nums">
                    {c.clicks?.toLocaleString() ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[11.5px] text-ink-secondary tabular-nums">
                    {c.conversions?.toLocaleString() ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <HandoffBadge tone={DATA_SOURCE_TONE[c.dataSource] ?? "soft"}>
                      {c.dataSource.replace(/_/g, " ")}
                    </HandoffBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
