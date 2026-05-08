import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { DevelopmentShell } from "@/components/development/development-shell";
import { listCampaigns } from "@/lib/development/server/campaigns/campaign-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Campaigns · Marketing" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "success" | "warning" | "danger" | "neutral"> = {
  planned: "neutral",
  in_preparation: "info",
  active: "success",
  paused: "warning",
  completed: "info",
  cancelled: "danger",
  archived: "neutral",
};

export default async function CampaignsPage() {
  const rows = await safeQuery("campaigns", listCampaigns(100), []);
  return (
    <DevelopmentShell>
      <PageHeader
        title="Campaigns"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Marketing" },
          { label: "Campaigns" },
        ]}
        description={`${rows.length} campaign(s).`}
      />
      <Section title="All campaigns">
        {rows.length === 0 ? (
          <EmptyState
            title="No campaigns yet"
            description="Create your first marketing campaign."
          
          action={
            <Link href="/development-os/marketing/connections" className="inline-flex items-center justify-center rounded-full border border-line-soft bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-muted/40">Configure connections</Link>
          }
        />
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-ink-tertiary border-b border-line-soft">
                <th className="py-2">Code</th>
                <th>Name</th>
                <th>Objective</th>
                <th>Status</th>
                <th>Period</th>
                <th>Budget / Spent</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-line-soft hover:bg-muted/30">
                  <td className="py-2 font-mono text-xs">
                    <Link
                      href={`/development-os/marketing/campaigns/${c.campaignCode}`}
                      className="hover:underline"
                    >
                      {c.campaignCode}
                    </Link>
                  </td>
                  <td>{c.name}</td>
                  <td className="text-xs">{c.campaignObjective}</td>
                  <td>
                    <Badge tone={STATUS_TONE[c.status] ?? "neutral"}>{c.status}</Badge>
                  </td>
                  <td className="text-xs text-ink-tertiary">
                    {c.campaignStart} → {c.campaignEnd}
                  </td>
                  <td className="font-mono tabular-nums text-xs">
                    {(Number(c.totalBudgetMinor) / 100).toLocaleString()} /{" "}
                    {(Number(c.spentToDateMinor) / 100).toLocaleString()}{" "}
                    <span className="text-ink-tertiary">{c.currency}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </DevelopmentShell>
  );
}
