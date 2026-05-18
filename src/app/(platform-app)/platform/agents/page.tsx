import Link from "next/link";
import { sql } from "drizzle-orm";
import { ArrowLeft, Bot, Plus } from "lucide-react";
import { SectionHeading, Card, Badge } from "@/components/dashboard/primitives";
import { getDb } from "@/lib/db/client";

/**
 * P5.3.1 AGENT-ADMIN-ROUTES — super_admin agent list.
 *
 * Reads platform_agent_configs (the new agent foundation table) and
 * shows one row per agent with subscriber count + 30-day cost roll-up
 * from agent_runs. The parent `(platform-app)/layout.tsx` already gates
 * super_admin via getCurrentUserContext, so no extra auth here.
 *
 * This is the list-page scaffold. CRUD actions (new/edit/delete),
 * knowledge-base upload, subscriptions tab, test interface, and
 * telemetry runs sub-page ship in follow-up commits.
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

function asRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return ((result as { rows: T[] }).rows) ?? [];
  }
  return [];
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
      <div className="mx-auto max-w-6xl px-6 py-12 flex flex-col gap-8">
        <SectionHeading
          eyebrow="Platform Admin · AI agents"
          title="AI agents"
          subtitle="Database not configured."
        />
      </div>
    );
  }

  const rows = asRows<AgentRow>(
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

  return (
    <div className="mx-auto max-w-6xl px-6 py-12 flex flex-col gap-8">
      <Link
        href="/platform"
        className="inline-flex items-center gap-1.5 text-xs text-ink-tertiary hover:text-ink"
      >
        <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.75} /> Platform Admin
      </Link>

      <SectionHeading
        eyebrow="Platform Admin · AI agents"
        title="AI agents"
        subtitle="Centrally defined agents. Each agent carries a provider/model/system prompt/knowledge base; customer orgs are subscribed to enabled agents to surface them in their cabinets."
        actions={
          <Link
            href="/platform/agents/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-ink px-4 py-2 text-sm text-ink-inverse hover:bg-ink/90"
          >
            <Plus className="w-4 h-4" strokeWidth={1.75} />
            New agent
          </Link>
        }
      />

      {rows.length === 0 ? (
        <Card style={{ padding: 40, textAlign: "center" }}>
          <Bot
            className="w-10 h-10 text-ink-tertiary mx-auto mb-3"
            strokeWidth={1.5}
          />
          <h3 className="display" style={{ fontSize: 20, marginBottom: 8, fontWeight: 500 }}>
            No agents configured yet
          </h3>
          <p className="text-sm text-ink-tertiary mb-4 max-w-md mx-auto">
            Create your first platform agent — start with the Tax Assistant
            (Indonesian villa tax context) using gpt-4o-mini or Claude Sonnet.
          </p>
          <Link
            href="/platform/agents/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-ink px-4 py-2 text-sm text-ink-inverse hover:bg-ink/90"
          >
            <Plus className="w-4 h-4" strokeWidth={1.75} />
            New agent
          </Link>
        </Card>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <table className="data w-full">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Provider · model</th>
                <th>Scope</th>
                <th className="num">Subscribers</th>
                <th className="num">30-day cost</th>
                <th>Status</th>
                <th>API key</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link
                      href={`/platform/agents/${r.id}`}
                      className="flex flex-col gap-0.5 hover:text-terra"
                    >
                      <span className="font-medium">{r.display_name}</span>
                      <span className="text-[11px] font-mono text-ink-tertiary">
                        {r.agent_code}
                      </span>
                    </Link>
                  </td>
                  <td className="text-sm">
                    {r.provider} · {r.model}
                  </td>
                  <td>
                    <Badge tone={r.scope === "global" ? "info" : "ink"}>
                      {r.scope}
                    </Badge>
                  </td>
                  <td className="num">{r.subscriber_count}</td>
                  <td className="num">
                    {fmtUsd(Number(r.cost_30d_usd_minor || 0))}
                  </td>
                  <td>
                    <Badge tone={r.is_active ? "ok" : "ink"}>
                      {r.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td>
                    {r.vault_secret_name ? (
                      <Badge tone="ok">Configured</Badge>
                    ) : (
                      <Badge tone="warn">Missing</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
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
