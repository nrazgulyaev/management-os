import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { KeyRound, Trash2, FileText, Upload, RefreshCcw, Bot } from "lucide-react";
import { Kpi } from "@/components/dashboard/primitives";
import { getDb, rowsOf } from "@/lib/db/client";
import {
  updatePlatformAgentFromForm,
  rotateAgentApiKeyFromForm,
  removeAgentApiKeyFromForm,
  deletePlatformAgentFromForm,
  toggleSubscriptionFromForm,
} from "@/lib/agents/actions";
import {
  uploadAgentDocumentFromForm,
  reprocessAgentDocumentFromForm,
  deleteAgentDocumentFromForm,
} from "@/lib/agents/knowledge-actions";
import { AgentTestChat } from "./test-chat";
import { KnowledgePoller } from "./knowledge-poller";

export const metadata = { title: "Agent · Platform Admin" };
export const dynamic = "force-dynamic";

interface AgentRow {
  id: string;
  agent_code: string;
  display_name: string;
  description: string | null;
  scope: string;
  provider: string;
  model: string;
  system_prompt: string;
  vault_secret_name: string | null;
  temperature: string;
  max_tokens: number;
  budget_monthly_usd_minor: number;
  is_active: boolean;
  created_at: string;
}

interface OrgSubRow {
  organization_id: string;
  organization_code: string;
  display_name: string | null;
  is_enabled: boolean | null;
  enabled_at: string | null;
}

interface DocRow {
  id: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  chunk_count: number;
  processing_status: string;
  processing_error: string | null;
  uploaded_at: string;
  processed_at: string | null;
  organization_id: string | null;
  organization_code: string | null;
}

interface OrgPickRow {
  id: string;
  code: string;
  name: string | null;
}

interface RunsKpiRow {
  total_runs: number;
  success_runs: number;
  total_cost_mtd: number;
  avg_latency: number | null;
  active_threads: number;
}

interface RunsStatusBucketRow {
  status: string;
  count: number;
}

interface RunsDailyRow {
  day: string;
  runs: number;
  cost_minor: number;
}

interface RecentRunRow {
  id: string;
  started_at: string;
  status: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd_minor: number;
  latency_ms: number | null;
  error_message: string | null;
  user_email: string | null;
}

const VALID_TABS = ["config", "subs", "knowledge", "runs", "test"] as const;
type Tab = (typeof VALID_TABS)[number];

export default async function PlatformAgentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: string;
    saved?: string;
    error?: string;
    key_rotated?: string;
    key_removed?: string;
    key_error?: string;
    sub?: string;
    uploaded?: string;
    processing?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab: Tab = (VALID_TABS.find((t) => t === sp.tab) ?? "config") as Tab;

  const db = getDb();
  if (!db) {
    return (
      <div className="mx-auto max-w-[1080px] px-[34px] py-[26px] pb-20">
        <div className="page-header">
          <div className="left">
            <div className="crumb">Platform Admin · agents</div>
            <h1>Database not configured</h1>
          </div>
        </div>
      </div>
    );
  }

  const agentRows = rowsOf<AgentRow>(
    await db.execute(sql`
      SELECT id::text                          AS id,
             agent_code                         AS agent_code,
             display_name                       AS display_name,
             description                        AS description,
             scope                              AS scope,
             provider                           AS provider,
             model                              AS model,
             system_prompt                      AS system_prompt,
             vault_secret_name                  AS vault_secret_name,
             temperature::text                  AS temperature,
             max_tokens                         AS max_tokens,
             budget_monthly_usd_minor           AS budget_monthly_usd_minor,
             is_active                          AS is_active,
             created_at::text                   AS created_at
        FROM platform_agent_configs
       WHERE id = ${id}::uuid
       LIMIT 1
    `),
  );
  if (agentRows.length === 0) notFound();
  const a = agentRows[0];

  // Knowledge base — doc rows for the Knowledge tab.
  const docRows =
    tab === "knowledge"
      ? rowsOf<DocRow>(
          await db.execute(sql`
            SELECT d.id::text                  AS id,
                   d.filename                   AS filename,
                   d.mime_type                  AS mime_type,
                   d.size_bytes                 AS size_bytes,
                   d.chunk_count                AS chunk_count,
                   d.processing_status          AS processing_status,
                   d.processing_error           AS processing_error,
                   d.uploaded_at::text          AS uploaded_at,
                   d.processed_at::text         AS processed_at,
                   d.organization_id::text      AS organization_id,
                   o.organization_code          AS organization_code
              FROM agent_knowledge_documents d
              LEFT JOIN organizations o ON o.id = d.organization_id
             WHERE d.agent_id = ${a.id}::uuid
             ORDER BY d.uploaded_at DESC
          `),
        )
      : [];

  // Org list for the scope dropdown (knowledge tab only).
  const orgPickRows =
    tab === "knowledge"
      ? rowsOf<OrgPickRow>(
          await db.execute(sql`
            SELECT id::text                  AS id,
                   organization_code          AS code,
                   display_name               AS name
              FROM organizations
             ORDER BY organization_code ASC
          `),
        )
      : [];

  // Runs tab — telemetry: header KPIs, status buckets, daily series,
  // recent 50 runs. Limited to a single read pass so the tab loads
  // even on agents with weeks of history.
  const runsKpiRows =
    tab === "runs"
      ? rowsOf<RunsKpiRow>(
          await db.execute(sql`
            SELECT
              COUNT(*)::int                                                   AS total_runs,
              COUNT(*) FILTER (WHERE status = 'success')::int                  AS success_runs,
              COALESCE(SUM(cost_usd_minor) FILTER (
                WHERE started_at >= date_trunc('month', now())
              ), 0)::int                                                       AS total_cost_mtd,
              CASE WHEN COUNT(latency_ms) > 0
                   THEN AVG(latency_ms)::int ELSE NULL END                      AS avg_latency,
              (SELECT COUNT(*)::int FROM agent_threads
                WHERE agent_id = ${a.id}::uuid)                                 AS active_threads
              FROM agent_runs
             WHERE agent_id = ${a.id}::uuid
               AND started_at >= now() - INTERVAL '30 days'
          `),
        )
      : [];

  const runsStatusBuckets =
    tab === "runs"
      ? rowsOf<RunsStatusBucketRow>(
          await db.execute(sql`
            SELECT status, COUNT(*)::int AS count
              FROM agent_runs
             WHERE agent_id = ${a.id}::uuid
               AND started_at >= now() - INTERVAL '30 days'
             GROUP BY status
             ORDER BY count DESC
          `),
        )
      : [];

  const runsDaily =
    tab === "runs"
      ? rowsOf<RunsDailyRow>(
          await db.execute(sql`
            SELECT to_char(date_trunc('day', started_at), 'YYYY-MM-DD') AS day,
                   COUNT(*)::int                                          AS runs,
                   COALESCE(SUM(cost_usd_minor), 0)::int                  AS cost_minor
              FROM agent_runs
             WHERE agent_id = ${a.id}::uuid
               AND started_at >= now() - INTERVAL '30 days'
             GROUP BY 1
             ORDER BY 1 ASC
          `),
        )
      : [];

  const recentRuns =
    tab === "runs"
      ? rowsOf<RecentRunRow>(
          await db.execute(sql`
            SELECT r.id::text             AS id,
                   r.started_at::text     AS started_at,
                   r.status               AS status,
                   r.tokens_in            AS tokens_in,
                   r.tokens_out           AS tokens_out,
                   r.cost_usd_minor       AS cost_usd_minor,
                   r.latency_ms           AS latency_ms,
                   r.error_message        AS error_message,
                   u.email                AS user_email
              FROM agent_runs r
              LEFT JOIN app_users u ON u.id = r.user_id
             WHERE r.agent_id = ${a.id}::uuid
             ORDER BY r.started_at DESC
             LIMIT 50
          `),
        )
      : [];

  // Org list + subscription state for the Subscriptions tab.
  const orgRows =
    tab === "subs"
      ? rowsOf<OrgSubRow>(
          await db.execute(sql`
            SELECT o.id::text                            AS organization_id,
                   o.organization_code                    AS organization_code,
                   o.display_name                         AS display_name,
                   s.is_enabled                           AS is_enabled,
                   s.enabled_at::text                     AS enabled_at
              FROM organizations o
              LEFT JOIN org_agent_subscriptions s
                     ON s.organization_id = o.id
                    AND s.agent_id = ${a.id}::uuid
             ORDER BY o.organization_code ASC
          `),
        )
      : [];

  return (
    <div className="mx-auto max-w-[1080px] px-[34px] py-[26px] pb-20">
      <Link
        href="/platform/agents"
        className="btn btn-ghost btn-sm pl-0 mb-3 inline-flex"
      >
        ← All agents
      </Link>

      <div className="page-header">
        <div className="left">
          <div className="crumb">{a.agent_code}</div>
          <h1 className="flex items-center gap-3">
            <span className="ag-ava lg">
              <Bot className="w-5 h-5" strokeWidth={1.7} />
            </span>
            {a.display_name}
          </h1>
          <div className="mono text-[12px] text-[var(--ink-4)] mt-1">
            {a.provider} · {a.model}
          </div>
        </div>
        <div className="actions">
          <span className={`badge ${a.is_active ? "badge-ok" : "badge-soft"}`}>
            {a.is_active ? "Active" : "Inactive"}
          </span>
          <span className={`badge ${a.vault_secret_name ? "badge-ok" : "badge-warn"}`}>
            {a.vault_secret_name ? "Key configured" : "No key"}
          </span>
        </div>
      </div>

      <Flash params={sp} />

      <nav className="detail-tabs">
        {VALID_TABS.map((t) => (
          <Link
            key={t}
            href={`/platform/agents/${a.id}?tab=${t}`}
            className={`tab ${t === tab ? "on" : ""}`}
          >
            {tabLabel(t)}
          </Link>
        ))}
      </nav>

      {tab === "config" && <ConfigTab agent={a} />}
      {tab === "subs" && <SubscriptionsTab agentId={a.id} orgs={orgRows} />}
      {tab === "knowledge" && (
        <KnowledgeTab agentId={a.id} docs={docRows} orgs={orgPickRows} />
      )}
      {tab === "runs" && (
        <RunsTab
          kpis={runsKpiRows[0] ?? null}
          statusBuckets={runsStatusBuckets}
          daily={runsDaily}
          recent={recentRuns}
        />
      )}
      {tab === "test" && (
        <div className="flex flex-col gap-4">
          {!a.vault_secret_name && (
            <div role="alert" className="ag-note">
              This agent has no API key configured. Sending a test message will
              fail with 503 until you add one on the Config tab.
            </div>
          )}
          <AgentTestChat agentId={a.id} />
        </div>
      )}
    </div>
  );
}

function tabLabel(t: Tab): string {
  return {
    config: "Config",
    subs: "Subscriptions",
    knowledge: "Knowledge base",
    runs: "Runs",
    test: "Test chat",
  }[t];
}

function Flash({
  params,
}: {
  params: {
    saved?: string;
    error?: string;
    key_rotated?: string;
    key_removed?: string;
    key_error?: string;
    sub?: string;
    uploaded?: string;
    processing?: string;
  };
}) {
  if (params.error) {
    return (
      <div className="rounded-[10px] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_6%,transparent)] px-4 py-3 text-sm text-[var(--danger)] mb-5">
        {params.error}
      </div>
    );
  }
  if (params.key_error) {
    return (
      <div className="rounded-[10px] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_6%,transparent)] px-4 py-3 text-sm text-[var(--danger)] mb-5">
        API key error: {params.key_error}
      </div>
    );
  }
  const msg =
    params.saved === "1"
      ? "Saved."
      : params.key_rotated === "1"
        ? "API key rotated — stored in Supabase Vault."
        : params.key_removed === "1"
          ? "API key removed."
          : params.sub === "on"
            ? "Subscription enabled."
            : params.sub === "off"
              ? "Subscription disabled."
              : params.processing
                ? "Document uploaded — processing in background. Status will update as it lands."
                : params.uploaded
                  ? "Document uploaded — processing complete."
                  : null;
  if (!msg) return null;
  return (
    <div className="rounded-[10px] border border-[color-mix(in_srgb,var(--ok)_35%,transparent)] bg-[color-mix(in_srgb,var(--ok)_8%,transparent)] px-4 py-3 text-sm text-[var(--ink)] mb-5">
      {msg}
    </div>
  );
}

function ConfigTab({ agent: a }: { agent: AgentRow }) {
  return (
    <div className="flex flex-col gap-[18px]">
      <form action={updatePlatformAgentFromForm} className="flex flex-col gap-[18px]">
        <input type="hidden" name="id" value={a.id} />
        <div className="card card-pad">
          <h3 className="ag-h3">Identity</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Agent code (immutable)">
              <input
                type="text"
                value={a.agent_code}
                disabled
                className="input mono opacity-70"
              />
            </Field>
            <Field label="Display name">
              <input
                type="text"
                name="displayName"
                defaultValue={a.display_name}
                required
                className="input"
              />
            </Field>
            <Field label="Scope">
              <select name="scope" defaultValue={a.scope} className="select">
                <option value="global">global</option>
                <option value="organization">organization</option>
              </select>
            </Field>
            <Field label="Active">
              <label className="inline-flex items-center gap-2 h-9">
                <input type="checkbox" name="isActive" defaultChecked={a.is_active} />
                <span className="text-sm text-ink-secondary">
                  Enabled (visible to subscribed orgs)
                </span>
              </label>
            </Field>
            <Field label="Description" full>
              <textarea
                name="description"
                rows={2}
                defaultValue={a.description ?? ""}
                className="textarea"
              />
            </Field>
          </div>
        </div>

        <div className="card card-pad">
          <h3 className="ag-h3">Model</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Provider">
              <select name="provider" defaultValue={a.provider} className="select">
                <option value="openai">openai</option>
                <option value="anthropic">anthropic</option>
                <option value="google">google</option>
              </select>
            </Field>
            <Field label="Model">
              <input
                type="text"
                name="model"
                defaultValue={a.model}
                required
                className="input mono"
              />
            </Field>
            <Field label="System prompt" full>
              <textarea
                name="systemPrompt"
                rows={6}
                defaultValue={a.system_prompt}
                className="textarea mono text-[13px] leading-[1.6]"
              />
            </Field>
          </div>
        </div>

        <div className="card card-pad">
          <h3 className="ag-h3">Limits</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Temperature">
              <input
                type="number"
                name="temperature"
                step="0.1"
                min="0"
                max="2"
                defaultValue={Number(a.temperature)}
                className="input mono tabular-nums"
              />
            </Field>
            <Field label="Max tokens">
              <input
                type="number"
                name="maxTokens"
                step="100"
                min="1"
                max="200000"
                defaultValue={a.max_tokens}
                className="input mono tabular-nums"
              />
            </Field>
            <Field label="Monthly budget · USD">
              <input
                type="number"
                name="budgetMonthlyUsd"
                step="1"
                min="0"
                defaultValue={(a.budget_monthly_usd_minor / 100).toFixed(0)}
                className="input mono tabular-nums"
              />
            </Field>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button type="submit" className="btn btn-primary btn-sm">
            Save changes
          </button>
          <Link href="/platform/agents" className="btn btn-secondary btn-sm">
            Cancel
          </Link>
        </div>
      </form>

      {/* API key — separate cluster so the password field doesn't ride
          inside the main form. */}
      <div className="card card-pad">
        <h3 className="ag-h3">API key</h3>
        {a.vault_secret_name ? (
          <p className="ag-muted mb-4">
            Key configured. Vault secret:{" "}
            <code className="mono text-xs">{a.vault_secret_name}</code>. Plaintext
            is never returned to the client.
          </p>
        ) : (
          <p className="ag-muted mb-4">
            No key configured. The agent will fail at inference time until a key is
            rotated in.
          </p>
        )}
        <form action={rotateAgentApiKeyFromForm} className="flex items-end gap-2 flex-wrap">
          <input type="hidden" name="id" value={a.id} />
          <div className="flex-1 min-w-[280px] field">
            <span className="field-label">
              {a.vault_secret_name ? "Rotate key" : "Set key"}
            </span>
            <input
              type="password"
              name="apiKey"
              required
              placeholder="sk-..."
              autoComplete="off"
              className="input mono"
            />
          </div>
          <button type="submit" className="btn btn-primary btn-sm">
            <KeyRound className="w-3.5 h-3.5" strokeWidth={1.75} />
            {a.vault_secret_name ? "Rotate" : "Save key"}
          </button>
        </form>
        {a.vault_secret_name && (
          <form action={removeAgentApiKeyFromForm} className="mt-3">
            <input type="hidden" name="id" value={a.id} />
            <button
              type="submit"
              className="text-xs text-[var(--danger)] hover:underline inline-flex items-center gap-1.5"
            >
              <Trash2 className="w-3 h-3" strokeWidth={1.75} />
              Remove key entirely
            </button>
          </form>
        )}
      </div>

      {/* Soft-delete (mark inactive). Kept in its own form so a stray
          click in the main form can't trigger it. */}
      <div className="card card-pad border-[color-mix(in_srgb,var(--danger)_45%,transparent)]">
        <h3 className="ag-h3">Deactivate agent</h3>
        <p className="ag-muted mb-3">
          Marks the agent inactive (is_active=false). Subscribed orgs stop seeing
          it; rows and key history are preserved. Reactivate by editing the Active
          flag above.
        </p>
        <form action={deletePlatformAgentFromForm}>
          <input type="hidden" name="id" value={a.id} />
          <button type="submit" className="btn btn-danger btn-sm">
            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
            Mark inactive
          </button>
        </form>
      </div>
    </div>
  );
}

function SubscriptionsTab({
  agentId,
  orgs,
}: {
  agentId: string;
  orgs: OrgSubRow[];
}) {
  if (orgs.length === 0) {
    return (
      <div className="card card-pad text-center">
        <p className="ag-muted">No organizations on this platform yet.</p>
      </div>
    );
  }
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="data w-full">
          <thead>
            <tr>
              <th>Organization</th>
              <th>Code</th>
              <th>Enabled</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((o) => {
              const enabled = o.is_enabled === true;
              return (
                <tr key={o.organization_id}>
                  <td className="row-title font-medium">{o.display_name ?? "—"}</td>
                  <td className="mono text-[12.5px] text-[var(--ink-4)]">
                    {o.organization_code}
                  </td>
                  <td>
                    <span className={`badge ${enabled ? "badge-ok" : "badge-soft"}`}>
                      {o.is_enabled === null ? "Not subscribed" : enabled ? "On" : "Off"}
                    </span>
                  </td>
                  <td>
                    <form action={toggleSubscriptionFromForm}>
                      <input type="hidden" name="agentId" value={agentId} />
                      <input
                        type="hidden"
                        name="organizationId"
                        value={o.organization_id}
                      />
                      <input
                        type="hidden"
                        name="isEnabled"
                        value={enabled ? "false" : "true"}
                      />
                      <button type="submit" className="btn btn-secondary btn-sm">
                        {enabled ? "Disable" : "Enable"}
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RunsTab({
  kpis,
  statusBuckets,
  daily,
  recent,
}: {
  kpis: RunsKpiRow | null;
  statusBuckets: RunsStatusBucketRow[];
  daily: RunsDailyRow[];
  recent: RecentRunRow[];
}) {
  const total = kpis?.total_runs ?? 0;
  const success = kpis?.success_runs ?? 0;
  const successRate = total > 0 ? `${((success / total) * 100).toFixed(1)}%` : "—";
  const costMtd = ((kpis?.total_cost_mtd ?? 0) / 100).toFixed(2);
  const avgLatency = kpis?.avg_latency != null ? `${kpis.avg_latency} ms` : "—";

  const STATUS_TONE: Record<string, "ok" | "warn" | "danger" | "soft"> = {
    success: "ok",
    error: "danger",
    budget_exceeded: "warn",
    rate_limited: "warn",
    in_progress: "soft",
  };

  // Daily bar chart — normalize to the max in the window for the
  // height. SVG bars keep this self-contained, no chart lib needed.
  const maxRuns = Math.max(1, ...daily.map((d) => d.runs));
  const barWidth = 100 / Math.max(daily.length, 1);

  return (
    <div className="flex flex-col gap-6">
      <div className="ag-kpis !grid-cols-2 md:!grid-cols-5">
        <Kpi label="Runs · 30d" value={String(total)} sub="period" />
        <Kpi label="Success rate" value={successRate} sub="ok / total" tone="success" />
        <Kpi label="Cost · MTD" value={`$${costMtd}`} sub="month to date" />
        <Kpi label="Avg latency" value={avgLatency} sub="per run" />
        <Kpi label="Threads" value={String(kpis?.active_threads ?? 0)} sub="active" />
      </div>

      <div className="card card-pad">
        <h3 className="ag-h3">Status breakdown · 30d</h3>
        {statusBuckets.length === 0 ? (
          <p className="ag-muted">No runs yet.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {statusBuckets.map((b) => {
              const pct = total > 0 ? (b.count / total) * 100 : 0;
              return (
                <li key={b.status} className="flex items-center gap-3">
                  <div className="w-28 shrink-0">
                    <span className={`badge badge-${STATUS_TONE[b.status] ?? "soft"}`}>
                      {b.status}
                    </span>
                  </div>
                  <div className="flex-1 h-2 bg-[var(--cream-deep,var(--muted))] rounded-sm overflow-hidden">
                    <div
                      className="h-full bg-[var(--ink-3)]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="num text-xs text-[var(--ink-3)] w-16 text-right">
                    {b.count} · {pct.toFixed(0)}%
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="card card-pad">
        <h3 className="ag-h3">Daily runs · last 30 days</h3>
        {daily.length === 0 ? (
          <p className="ag-muted">No activity in this window.</p>
        ) : (
          <div className="relative h-32 w-full">
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 w-full h-full"
            >
              {daily.map((d, i) => {
                const h = (d.runs / maxRuns) * 100;
                return (
                  <rect
                    key={d.day}
                    x={i * barWidth + 0.5}
                    y={100 - h}
                    width={Math.max(0.5, barWidth - 1)}
                    height={h}
                    fill="var(--accent)"
                    opacity={0.6}
                  >
                    <title>{`${d.day}: ${d.runs} run${d.runs === 1 ? "" : "s"} · $${(d.cost_minor / 100).toFixed(2)}`}</title>
                  </rect>
                );
              })}
            </svg>
          </div>
        )}
        <div className="mt-2 flex items-center justify-between mono text-[11px] text-[var(--ink-4)]">
          <span>{daily[0]?.day ?? ""}</span>
          <span>{daily[daily.length - 1]?.day ?? ""}</span>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--line-soft)]">
          <h3 className="ag-h3 !mb-0">Recent runs · last 50</h3>
        </div>
        {recent.length === 0 ? (
          <div className="px-5 py-12 text-center ag-muted">
            No runs yet. Use the Test chat tab to send some test traffic.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data w-full">
              <thead>
                <tr>
                  <th>Started</th>
                  <th>User</th>
                  <th>Status</th>
                  <th className="num">Tok in / out</th>
                  <th className="num">Cost</th>
                  <th className="num">Latency</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td className="mono text-[11px] text-[var(--ink-4)]">
                      {r.started_at.slice(0, 19).replace("T", " ")}
                    </td>
                    <td className="text-[var(--ink-2)]">{r.user_email ?? "—"}</td>
                    <td>
                      <span className={`badge badge-${STATUS_TONE[r.status] ?? "soft"}`}>
                        {r.status}
                      </span>
                      {r.error_message && (
                        <div className="text-[11px] text-[var(--danger)] mt-1 max-w-md truncate">
                          {r.error_message}
                        </div>
                      )}
                    </td>
                    <td className="num">
                      {r.tokens_in} / {r.tokens_out}
                    </td>
                    <td className="num">${(r.cost_usd_minor / 100).toFixed(3)}</td>
                    <td className="num text-[var(--ink-2)]">
                      {r.latency_ms != null ? `${r.latency_ms} ms` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function KnowledgeTab({
  agentId,
  docs,
  orgs,
}: {
  agentId: string;
  docs: DocRow[];
  orgs: OrgPickRow[];
}) {
  return (
    <div className="flex flex-col gap-[18px]">
      <KnowledgePoller statuses={docs.map((d) => d.processing_status)} />
      <div className="card card-pad">
        <h3 className="ag-h3 !mb-1.5">Upload document</h3>
        <p className="ag-muted mb-4">
          PDF, DOCX, plain text, or markdown · up to 50 MB · processing runs in the
          background. The list below updates automatically.
        </p>
        <form
          action={uploadAgentDocumentFromForm}
          encType="multipart/form-data"
          className="flex flex-col gap-3"
        >
          <input type="hidden" name="agentId" value={agentId} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="File">
              <input
                type="file"
                name="file"
                required
                accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
                className="input file:mr-3 file:rounded-sm file:border-0 file:bg-[var(--inverted-bg,var(--ink))] file:text-[var(--inverted-fg,var(--paper))] file:px-3 file:py-1.5 file:text-xs"
              />
            </Field>
            <Field label="Scope">
              <select name="organizationId" defaultValue="" className="select">
                <option value="">Platform-global (all subscribed orgs)</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    Organization · {o.code}
                    {o.name ? ` — ${o.name}` : ""}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div>
            <button type="submit" className="btn btn-accent btn-sm inline-flex">
              <Upload className="w-3.5 h-3.5" strokeWidth={1.75} />
              Upload + process
            </button>
          </div>
        </form>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--line-soft)] flex items-center justify-between">
          <h3 className="ag-h3 !mb-0">Documents ({docs.length})</h3>
          <p className="ag-muted">Chunks are retrieved via cosine similarity at query time.</p>
        </div>
        {docs.length === 0 ? (
          <div className="px-5 py-12 text-center ag-muted">
            No documents yet. Upload above to populate the agent&apos;s knowledge base.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--line-soft)]">
            {docs.map((d) => (
              <DocumentRow key={d.id} agentId={agentId} doc={d} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function DocumentRow({ agentId, doc: d }: { agentId: string; doc: DocRow }) {
  const sizeKb = d.size_bytes ? `${(d.size_bytes / 1024).toFixed(0)} KB` : "—";
  const statusTone =
    d.processing_status === "ready"
      ? "ok"
      : d.processing_status === "failed"
        ? "danger"
        : "warn";
  return (
    <li className="px-5 py-4 flex items-start gap-4">
      <FileText className="w-4 h-4 text-[var(--ink-4)] mt-1 shrink-0" strokeWidth={1.75} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-ink font-medium truncate">{d.filename}</span>
          <span className={`badge badge-${statusTone}`}>{d.processing_status}</span>
          <span className={`badge ${d.organization_id ? "badge-soft" : "badge-ok"}`}>
            {d.organization_id
              ? `Org · ${d.organization_code ?? d.organization_id.slice(0, 8)}`
              : "Global"}
          </span>
          <span className="text-[11px] text-[var(--ink-4)]">
            {sizeKb} · {d.chunk_count} chunk{d.chunk_count === 1 ? "" : "s"}
          </span>
        </div>
        {d.processing_error && (
          <p className="text-xs text-[var(--danger)] mt-1 break-words">
            {d.processing_error}
          </p>
        )}
        <p className="text-[11px] text-[var(--ink-4)] mt-1">
          Uploaded {d.uploaded_at.slice(0, 19).replace("T", " ")}
          {d.processed_at &&
            ` · processed ${d.processed_at.slice(0, 19).replace("T", " ")}`}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {d.processing_status === "failed" && (
          <form action={reprocessAgentDocumentFromForm}>
            <input type="hidden" name="documentId" value={d.id} />
            <input type="hidden" name="agentId" value={agentId} />
            <button type="submit" title="Re-process" className="ag-icobtn">
              <RefreshCcw className="w-3.5 h-3.5" strokeWidth={1.75} />
            </button>
          </form>
        )}
        <form action={deleteAgentDocumentFromForm}>
          <input type="hidden" name="documentId" value={d.id} />
          <input type="hidden" name="agentId" value={agentId} />
          <button type="submit" title="Delete document + chunks" className="ag-icobtn danger">
            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
          </button>
        </form>
      </div>
    </li>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={`field ${full ? "md:col-span-2 lg:col-span-3" : ""}`}>
      <span className="field-label">{label}</span>
      {children}
    </div>
  );
}
