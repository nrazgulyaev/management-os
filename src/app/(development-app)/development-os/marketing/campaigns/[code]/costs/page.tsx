import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import {
  getCampaignByCode,
  listCampaignCosts,
} from "@/lib/development/server/campaigns/campaign-queries";

export const metadata: Metadata = { title: "Campaign costs · Marketing" };
export const dynamic = "force-dynamic";

export default async function CampaignCostsPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const campaign = await getCampaignByCode(code);
  if (!campaign) notFound();
  const costs = await listCampaignCosts(campaign.id);
  return (
    <DevelopmentShell>
      <PageHeader
        title={`${campaign.name} — Costs`}
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Marketing" },
          { label: "Campaigns", href: "/development-os/marketing/campaigns" },
          {
            label: campaign.campaignCode,
            href: `/development-os/marketing/campaigns/${code}`,
          },
          { label: "Costs" },
        ]}
        actions={
          <Button asChild variant="secondary">
            <Link href={`/development-os/marketing/campaigns/${code}`}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Campaign
            </Link>
          </Button>
        }
      />
      <Section title={`${costs.length} cost row(s)`}>
        {costs.length === 0 ? (
          <EmptyState
            title="No costs recorded"
            description="Add manual entries or import from ad platforms."
          />
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-ink-tertiary border-b border-line-soft">
                <th className="py-2">Period</th>
                <th>Source</th>
                <th>Cost</th>
                <th>Impr.</th>
                <th>Clicks</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {costs.map((c) => (
                <tr key={c.id} className="border-b border-line-soft">
                  <td className="py-2 text-xs">
                    {c.periodStart} → {c.periodEnd}
                  </td>
                  <td className="text-xs">{c.sourceKey}</td>
                  <td className="font-mono tabular-nums">
                    {(Number(c.costMinor) / 100).toLocaleString()} {c.currency}
                  </td>
                  <td className="font-mono tabular-nums text-xs">{c.impressions ?? "—"}</td>
                  <td className="font-mono tabular-nums text-xs">{c.clicks ?? "—"}</td>
                  <td className="text-xs">{c.dataSource}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </DevelopmentShell>
  );
}
