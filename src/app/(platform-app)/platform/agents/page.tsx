import Link from "next/link";
import { sql } from "drizzle-orm";
import { Bot, Plus } from "lucide-react";
import { Kpi } from "@/components/dashboard/primitives";
import { getDb, rowsOf } from "@/lib/db/client";

/**
 * P5.3.1 AGENT-ADMIN-ROUTES — super_admin agent list / Agent Studio registry.
 *
 * Reads platform_agent_configs (the new agent foundation table) and
 * shows one row per agent with subscriber count + 30-day cost roll-up
 * from agent_runs. The parent `(platform-app)/layout.tsx` already gates
 * super_admin via getCurrentUserContext, so no extra auth here.
 *
 * Pixel pass: re-laid to the `Agent Studio` super-admin mockup — page
 * header with mono crumb + display title, a 4-tile KPI strip, and the
 * registry `table.data`. All data wiring (SQL, links, fields) preserved.
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
      <div className="mx-auto max-w-[1080px] px-[34px] py-[26px] pb-20">
        <div className="page-header">
          <div className="left">
            <div className="crumb">AI · single registry</div>
            <h1>Agent Studio</h1>
          </div>
        </div>
        <p className="ag-muted">Database not configured.</p>
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

  const activeCount = rows.filter((r) => r.is_active).length;
  const globalCount = rows.filter((r) => r.scope === "global").length;
  const inactiveCount = rows.length - activeCount;
  const cost30dTotal = rows.reduce(
    (n, r) => n + Number(r.cost_30d_usd_minor || 0),
    0,
  );

  return (
    <div className="mx-auto max-w-[1080px] px-[34px] py-[26px] pb-20">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/platform">Platform Admin</Link>
            <span className="text-[var(--ink-4)]">/</span>
            AI · single registry
          </div>
          <h1>Agent Studio</h1>
        </div>
        <div className="actions">
          <Link href="/platform/agents/new" className="btn btn-accent">
            <Plus className="w-[15px] h-[15px]" strokeWidth={2} />
            New agent
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card px-10 py-10 text-center">
          <Bot className="w-10 h-10 text-ink-tertiary mx-auto mb-3" strokeWidth={1.5} />
          <h3 className="display text-[20px] mb-2 font-medium">
            No agents configured yet
          </h3>
          <p className="text-sm text-ink-tertiary mb-4 max-w-md mx-auto">
            Create your first platform agent — start with the Tax Assistant
            (Indonesian villa tax context) using gpt-4o-mini or Claude Sonnet.
          </p>
          <Link
            href="/platform/agents/new"
            className="btn btn-accent btn-sm inline-flex"
          >
            <Plus className="w-[15px] h-[15px]" strokeWidth={2} />
            New agent
          </Link>
        </div>
      ) : (
        <>
          <div className="ag-kpis">
            <Kpi label="Active" value={String(activeCount)} sub="live" tone="success" />
            <Kpi label="Global" value={String(globalCount)} sub="all orgs" />
            <Kpi
              label="Inactive"
              value={String(inactiveCount)}
              sub="not launched"
              tone="warn"
            />
            <Kpi label="Cost · 30d" value={fmtUsd(cost30dTotal)} sub="all agents" />
          </div>

          <div className="card overflow-hidden mt-[18px]">
            <div className="overflow-x-auto">
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
                          className="flex items-center gap-2.5 hover:text-terra"
                        >
                          <span className="ag-ava">
                            <Bot className="w-4 h-4" strokeWidth={1.7} />
                          </span>
                          <span className="flex flex-col gap-0.5">
                            <span className="row-title font-medium">
                              {r.display_name}
                            </span>
                            <span className="mono text-[11px] text-[var(--ink-4)]">
                              {r.agent_code}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="text-[12.5px] text-[var(--ink-3)]">
                        {r.provider} · {r.model}
                      </td>
                      <td>
                        <span
                          className={`badge ${r.scope === "global" ? "badge-info" : "badge-soft"}`}
                        >
                          {r.scope}
                        </span>
                      </td>
                      <td className="num">{r.subscriber_count}</td>
                      <td className="num">
                        {fmtUsd(Number(r.cost_30d_usd_minor || 0))}
                      </td>
                      <td>
                        <span className={`badge ${r.is_active ? "badge-ok" : "badge-soft"}`}>
                          {r.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>
                        {r.vault_secret_name ? (
                          <span className="badge badge-ok">Configured</span>
                        ) : (
                          <span className="badge badge-warn">Missing</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <p className="ag-foot">
        Agent definitions live in <code>platform_agent_configs</code>; per-org
        enablement in <code>org_agent_subscriptions</code>; knowledge base in{" "}
        <code>agent_knowledge_documents</code> + <code>agent_knowledge_chunks</code>{" "}
        (pgvector). All API keys are encrypted at rest via Supabase Vault — the
        raw key never appears in the application database or in logs. Created by
        migration <code>0109_agent_foundation.sql</code>.
      </p>
    </div>
  );
}
