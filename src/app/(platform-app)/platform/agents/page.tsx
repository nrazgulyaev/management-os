import Link from "next/link";
import { sql } from "drizzle-orm";
import { Bot, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardKpi, ListTableCard } from "@/components/ui/primitives";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { getDb, rowsOf } from "@/lib/db/client";

/**
 * P5.3.1 AGENT-ADMIN-ROUTES — super_admin agent list.
 *
 * Reads platform_agent_configs (the new agent foundation table) and
 * shows one row per agent with subscriber count + 30-day cost roll-up
 * from agent_runs. The parent `(platform-app)/layout.tsx` already gates
 * super_admin via getCurrentUserContext, so no extra auth here.
 *
 * pixel-platform-console: restyled to the dark operator console (matches
 * cabinets/super-admin/Platform Console.html — AI agents screen). Uses the
 * shared token-driven primitives so it renders dark via the platform
 * surface remap; the SQL query + getDb() guard + rowsOf() are unchanged.
 */

export const metadata = { title: "AI agents · Platform Admin" };
export const dynamic = "force-dynamic";

interface AgentRow {
  id: string;
  agent_code: string;
  display_name: string;
  description: string | null;
  scope: string;
  provider: string;
  model: string;
  is_active: boolean;
  subscriber_count: string;
  cost_30d_usd_minor: string;
  vault_secret_name: string | null;
  created_at: string;
}

function fmtUsd(minor: number): string {
  const usd = minor / 100;
  if (usd >= 1000) return `$${(usd / 1000).toFixed(1)}K`;
  return `$${usd.toFixed(2)}`;
}

export default async function PlatformAgentsListPage() {
  const db = getDb();
  if (!db) {
    return (
      <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-10 flex flex-col gap-10">
        <PageHeader
          breadcrumbs={[
            { label: "Platform Admin OS", href: "/platform" },
            { label: "AI agents" },
          ]}
          eyebrow="Platform · centrally managed"
          title="Agents, one registry"
          description="Database not configured."
        />
      </div>
    );
  }

  const rows = rowsOf<AgentRow>(
    await db.execute(sql`
      SELECT
        c.id::text                      AS id,
        c.agent_code                    AS agent_code,
        c.display_name                  AS display_name,
        c.description                   AS description,
        c.scope                         AS scope,
        c.provider                      AS provider,
        c.model                         AS model,
        c.is_active                     AS is_active,
        c.vault_secret_name             AS vault_secret_name,
        c.created_at::text              AS created_at,
        COALESCE(
          (SELECT COUNT(*)::text FROM org_agent_subscriptions
            WHERE agent_id = c.id AND is_enabled = TRUE),
          '0'
        ) AS subscriber_count,
        COALESCE(
          (SELECT SUM(cost_usd_minor)::text FROM agent_runs
            WHERE agent_id = c.id
              AND started_at >= now() - INTERVAL '30 days'),
          '0'
        ) AS cost_30d_usd_minor
      FROM platform_agent_configs c
      ORDER BY c.is_active DESC, c.display_name ASC
    `),
  );

  // Derived KPI rollups from the live registry (no extra query).
  const activeCount = rows.filter((r) => r.is_active).length;
  const subscriptions = rows.reduce(
    (sum, r) => sum + Number(r.subscriber_count || 0),
    0,
  );
  const cost30d = rows.reduce(
    (sum, r) => sum + Number(r.cost_30d_usd_minor || 0),
    0,
  );
  const missingKey = rows.filter((r) => !r.vault_secret_name).length;

  return (
    <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-10 flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Platform Admin OS", href: "/platform" },
          { label: "AI agents" },
        ]}
        eyebrow="Platform · centrally managed"
        title="Agents, one registry"
        description="Each agent carries a provider / model / system prompt / knowledge base, defined centrally. Customer orgs subscribe to enabled agents to surface them in their cabinets. API keys encrypted at rest via Vault."
        actions={
          <Button asChild variant="accent">
            <Link href="/platform/agents/new">
              <Plus className="w-4 h-4" strokeWidth={1.75} />
              New agent
            </Link>
          </Button>
        }
      />

      {rows.length === 0 ? (
        <ListTableCard flushBody={false}>
          <div className="flex flex-col items-center text-center py-12">
            <Bot
              className="w-10 h-10 text-ink-tertiary mb-3"
              strokeWidth={1.5}
            />
            <h3 className="text-display text-[20px] font-medium text-ink mb-2">
              No agents configured yet
            </h3>
            <p className="text-sm text-ink-tertiary mb-4 max-w-md">
              Create your first platform agent — start with the Tax Assistant
              (Indonesian villa tax context) using gpt-4o-mini or Claude Sonnet.
            </p>
            <Button asChild variant="accent">
              <Link href="/platform/agents/new">
                <Plus className="w-4 h-4" strokeWidth={1.75} />
                New agent
              </Link>
            </Button>
          </div>
        </ListTableCard>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <DashboardKpi
              label="Active agents"
              value={String(activeCount)}
              status="good"
              hint="Live"
            />
            <DashboardKpi
              label="Subscriptions"
              value={String(subscriptions)}
              status="neutral"
              hint="org × agent"
            />
            <DashboardKpi
              label="Cost · 30d"
              value={fmtUsd(cost30d)}
              status="neutral"
              hint="All agents"
            />
            <DashboardKpi
              label="Missing key"
              value={String(missingKey)}
              status={missingKey > 0 ? "warn" : "good"}
              hint="Vault unset"
            />
          </div>

          <ListTableCard
            eyebrow="platform_agent_configs"
            title="Platform agents"
            count={rows.length}
          >
            <Table>
              <THead>
                <TR>
                  <TH>Agent</TH>
                  <TH>Provider · model</TH>
                  <TH>Scope</TH>
                  <TH className="text-right">Subs</TH>
                  <TH className="text-right">30d cost</TH>
                  <TH>Status</TH>
                  <TH>API key</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.id}>
                    <TD>
                      <Link
                        href={`/platform/agents/${r.id}`}
                        className="flex flex-col gap-0.5 hover:text-accent transition-colors"
                      >
                        <span className="text-ink font-medium">
                          {r.display_name}
                        </span>
                        <span className="text-[11px] font-mono text-ink-tertiary">
                          {r.agent_code}
                        </span>
                      </Link>
                    </TD>
                    <TD className="text-sm">
                      {r.provider} · {r.model}
                    </TD>
                    <TD>
                      <Badge tone={r.scope === "global" ? "info" : "neutral"}>
                        {r.scope}
                      </Badge>
                    </TD>
                    <TDNum>{r.subscriber_count}</TDNum>
                    <TDNum>{fmtUsd(Number(r.cost_30d_usd_minor || 0))}</TDNum>
                    <TD>
                      <Badge tone={r.is_active ? "success" : "warning"}>
                        {r.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TD>
                    <TD>
                      {r.vault_secret_name ? (
                        <Badge tone="success">Configured</Badge>
                      ) : (
                        <Badge tone="warning">Missing</Badge>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </ListTableCard>
        </>
      )}

      <p className="text-[11px] text-ink-tertiary leading-relaxed">
        Agent definitions live in <code>platform_agent_configs</code>; per-org
        enablement in <code>org_agent_subscriptions</code>; knowledge base in{" "}
        <code>agent_knowledge_documents</code> + <code>agent_knowledge_chunks</code>{" "}
        (pgvector). All API keys are encrypted at rest via Supabase Vault —
        the raw key never appears in the application database or in logs.
        Created by migration <code>0109_agent_foundation.sql</code>.
      </p>
    </div>
  );
}
