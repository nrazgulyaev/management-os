import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DevelopmentShell } from "@/components/development/development-shell";
import {
  getCampaignByCode,
  listCampaignCosts,
} from "@/lib/development/server/campaigns/campaign-queries";

export const metadata: Metadata = { title: "Campaign · Marketing" };
export const dynamic = "force-dynamic";

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

  return (
    <DevelopmentShell>
      <PageHeader
        title={campaign.name}
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Marketing" },
          { label: "Campaigns", href: "/development-os/marketing/campaigns" },
          { label: campaign.campaignCode },
        ]}
        description={`${campaign.campaignObjective} · ${campaign.campaignStart} → ${campaign.campaignEnd}`}
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/marketing/campaigns">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Back
            </Link>
          </Button>
        }
      />
      <Section title="Status">
        <Badge tone="info">{campaign.status}</Badge>
      </Section>
      <Section title="Budget">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-ink-tertiary text-xs">Total budget</div>
            <div className="font-mono tabular-nums text-lg">
              {(budget / 100).toLocaleString()} {campaign.currency}
            </div>
          </div>
          <div>
            <div className="text-ink-tertiary text-xs">Spent (cost rows)</div>
            <div className="font-mono tabular-nums text-lg">
              {(totalCost / 100).toLocaleString()} {campaign.currency}
            </div>
          </div>
          <div>
            <div className="text-ink-tertiary text-xs">Burn</div>
            <div className="font-mono tabular-nums text-lg">{burnPct.toFixed(1)}%</div>
          </div>
        </div>
      </Section>
      <Section title="Cost entries">
        <Link
          href={`/development-os/marketing/campaigns/${code}/costs`}
          className="text-info text-sm hover:underline"
        >
          View all → ({costs.length})
        </Link>
      </Section>
    </DevelopmentShell>
  );
}
