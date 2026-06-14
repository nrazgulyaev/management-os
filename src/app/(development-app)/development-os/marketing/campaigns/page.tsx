import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { listCampaigns } from "@/lib/development/server/campaigns/campaign-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { CampaignCreateForm } from "./_create-form";
import { CampaignStatusControl } from "./_status-control";

export const metadata: Metadata = { title: "Campaigns · Marketing" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "ok" | "warn" | "danger" | "soft"> = {
  planned: "soft",
  in_preparation: "info",
  active: "ok",
  paused: "warn",
  completed: "info",
  cancelled: "danger",
  archived: "soft",
};

export default async function CampaignsPage() {
  const rows = await safeQuery("campaigns", listCampaigns(100), []);
  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Marketing</span> / <span>Campaigns</span>
          </div>
          <h1>Campaigns</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {`${rows.length} campaign(s).`}
          </p>
        </div>
        <div className="actions">
          <CampaignCreateForm />
        </div>
      </div>
      <div>
        <div className="label mb-2.5">All campaigns</div>
        {rows.length === 0 ? (
          <EmptyState
            title="No campaigns yet"
            description="Create your first marketing campaign."

          action={
            <Link href="/development-os/marketing/connections" className="inline-flex items-center justify-center rounded-full border border-line-soft bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-muted/40">Configure connections</Link>
          }
        />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Name</th>
                <th scope="col">Objective</th>
                <th scope="col">Status</th>
                <th scope="col">Period</th>
                <th scope="col">Budget / Spent</th>
                <th scope="col">Set status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className="mono text-xs">
                    <Link
                      href={`/development-os/marketing/campaigns/${c.campaignCode}`}
                      className="hover:underline"
                    >
                      {c.campaignCode}
                    </Link>
                  </td>
                  <td className="row-title">{c.name}</td>
                  <td className="text-xs">{c.campaignObjective}</td>
                  <td>
                    <HandoffBadge tone={STATUS_TONE[c.status] ?? "soft"}>{c.status}</HandoffBadge>
                  </td>
                  <td className="text-xs text-ink-tertiary">
                    {c.campaignStart} → {c.campaignEnd}
                  </td>
                  <td className="num mono text-xs">
                    {(Number(c.totalBudgetMinor) / 100).toLocaleString()} /{" "}
                    {(Number(c.spentToDateMinor) / 100).toLocaleString()}{" "}
                    <span className="text-ink-tertiary">{c.currency}</span>
                  </td>
                  <td>
                    <CampaignStatusControl
                      campaignCode={c.campaignCode}
                      status={c.status}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </DevelopmentShell>
  );
}
