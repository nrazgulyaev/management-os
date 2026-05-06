import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { agentConfigurations } from "@/lib/db/schema/ai-agents";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "AI agents · Development OS" };
export const dynamic = "force-dynamic";

const AGENT_HREF: Record<string, string | null> = {
  qs_cost_analyst: "/development-os/ai-agents/qs-cost-analyst",
  procurement_analyst: "/development-os/ai-agents/procurement-analyst",
  tax_assistant: "/development-os/ai-agents/tax-assistant",
  marketing_assistant: "/development-os/ai-agents/marketing-assistant",
  executive_business: "/development-os/ai-agents/executive-business",
  daily_digest: "/development-os/ai-agents/daily-digest",
  weekly_plan: "/development-os/ai-agents/weekly-plan",
};

export default async function AiAgentsHubPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="AI agents" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }

  const configs = await safeQuery(
    "agentConfigurations",
    db.select().from(agentConfigurations).orderBy(agentConfigurations.displayName),
    [],
  );

  const monthlyCostResult = await safeQuery(
    "monthlyCost",
    db.execute<{ agent_key: string; spent: string; n: string }>(sql`
      SELECT agent_key,
             COALESCE(SUM(cost_minor), 0)::text AS spent,
             COUNT(*)::text AS n
        FROM agent_invocation_log
       WHERE invoked_at >= date_trunc('month', now())
       GROUP BY agent_key
    `),
    null as unknown as Awaited<ReturnType<typeof db.execute>>,
  );
  const usageRows =
    (monthlyCostResult as unknown as { rows?: Array<{ agent_key: string; spent: string; n: string }> })
      ?.rows ?? [];
  const usageByAgent: Record<string, { spent: number; count: number }> = {};
  for (const r of usageRows) {
    usageByAgent[r.agent_key] = { spent: Number(r.spent), count: Number(r.n) };
  }

  return (
    <DevelopmentShell>
      <PageHeader
        title="AI agents"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "AI agents" },
        ]}
        description={`${configs.length} agent(s) configured. All operate in dry-run unless ANTHROPIC_API_KEY is set.`}
      />
      <Section title="All agents">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-ink-tertiary border-b border-line-soft">
              <th className="py-2">Agent</th>
              <th>Type</th>
              <th>Status</th>
              <th>Daily cap</th>
              <th>This month (count / spent)</th>
              <th>Memory</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {configs.map((c) => {
              const usage = usageByAgent[c.agentKey] ?? { spent: 0, count: 0 };
              const href = AGENT_HREF[c.agentKey] ?? null;
              return (
                <tr key={c.id} className="border-b border-line-soft hover:bg-muted/30">
                  <td className="py-2">
                    {href ? (
                      <Link href={href} className="hover:underline">
                        {c.displayName}
                      </Link>
                    ) : (
                      c.displayName
                    )}
                  </td>
                  <td className="text-xs">{c.agentType}</td>
                  <td>
                    <Badge tone={c.isActive ? "success" : "neutral"}>
                      {c.isActive ? "active" : "disabled"}
                    </Badge>
                  </td>
                  <td className="font-mono tabular-nums text-xs">
                    {Number(c.dailyBudgetMinor) > 0
                      ? `${(Number(c.dailyBudgetMinor) / 100).toLocaleString()} ${c.budgetCurrency}`
                      : "—"}
                  </td>
                  <td className="font-mono tabular-nums text-xs">
                    {usage.count} / {(usage.spent / 100).toLocaleString()}
                  </td>
                  <td className="text-xs">
                    {c.usesMemory ? `${c.maxMemoryItemsLoaded} items` : "off"}
                  </td>
                  <td className="text-xs">
                    {href && (
                      <Link href={href} className="text-info hover:underline">
                        View →
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>
    </DevelopmentShell>
  );
}
