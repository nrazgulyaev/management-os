import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { ArrowLeft, KeyRound, Trash2, FileText, Upload, RefreshCcw } from "lucide-react";
import {
  SectionHeading,
  Card,
  HandoffBadge,
} from "@/components/dashboard/primitives";
import { getDb } from "@/lib/db/client";
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

function asRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return ((result as { rows: T[] }).rows) ?? [];
  }
  return [];
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
      <div className="mx-auto max-w-5xl px-6 py-12">
        <SectionHeading
          eyebrow="Platform Admin · agents"
          title="Database not configured"
        />
      </div>
    );
  }

  const agentRows = asRows<AgentRow>(
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
      ? asRows<DocRow>(
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
      ? asRows<OrgPickRow>(
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
      ? asRows<RunsKpiRow>(
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
      ? asRows<RunsStatusBucketRow>(
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
      ? asRows<RunsDailyRow>(
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
      ? asRows<RecentRunRow>(
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
      ? asRows<OrgSubRow>(
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
    <div className="mx-auto max-w-5xl px-6 py-12 flex flex-col gap-6">
      <Link
        href="/platform/agents"
        className="inline-flex items-center gap-1.5 text-xs text-ink-tertiary hover:text-ink"
      >
        <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.75} /> All agents
      </Link>

      <SectionHeading
        eyebrow={`Platform Admin · agents · ${a.agent_code}`}
        title={a.display_name}
        subtitle={a.description ?? `${a.provider} · ${a.model}`}
        actions={
          <div className="flex items-center gap-2">
            <HandoffBadge tone={a.is_active ? "ok" : "ink"}>
              {a.is_active ? "Active" : "Inactive"}
            </HandoffBadge>
            <HandoffBadge tone={a.vault_secret_name ? "ok" : "warn"}>
              {a.vault_secret_name ? "Key configured" : "No key"}
            </HandoffBadge>
          </div>
        }
      />

      <Flash params={sp} />

      {/* tab bar */}
      <nav className="flex items-center gap-1 border-b border-line-soft">
        {VALID_TABS.map((t) => (
          <Link
            key={t}
            href={`/platform/agents/${a.id}?tab=${t}`}
            className={`px-3 py-2 text-sm border-b-2 -mb-px ${
              t === tab
                ? "border-ink text-ink"
                : "border-transparent text-ink-tertiary hover:text-ink"
            }`}
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
            <div
              role="alert"
              className="rounded-md border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-ink-secondary"
            >
              This agent has no API key configured. Sending a test
              message will fail with 503 until you add one on the
              Config tab.
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
    test: "Test",
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
      <div className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">
        {params.error}
      </div>
    );
  }
  if (params.key_error) {
    return (
      <div className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">
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
    <div className="rounded-md border border-ok/40 bg-ok/5 px-4 py-3 text-sm text-ink">
      {msg}
    </div>
  );
}

function ConfigTab({ agent: a }: { agent: AgentRow }) {
  return (
    <div className="flex flex-col gap-6">
      <form action={updatePlatformAgentFromForm} className="flex flex-col gap-6">
        <input type="hidden" name="id" value={a.id} />
        <Card style={{ padding: 20 }}>
          <h2 className="display" style={{ fontSize: 18, marginBottom: 16, fontWeight: 500 }}>
            Identity
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Agent code (immutable)">
              <input
                type="text"
                value={a.agent_code}
                disabled
                className="w-full rounded-md border border-line-soft bg-muted px-3 py-2 text-sm font-mono opacity-70"
              />
            </Field>
            <Field label="Display name">
              <input
                type="text"
                name="displayName"
                defaultValue={a.display_name}
                required
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Scope">
              <select
                name="scope"
                defaultValue={a.scope}
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              >
                <option value="global">global</option>
                <option value="organization">organization</option>
              </select>
            </Field>
            <Field label="Active">
              <label className="inline-flex items-center gap-2 h-9">
                <input
                  type="checkbox"
                  name="isActive"
                  defaultChecked={a.is_active}
                />
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
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              />
            </Field>
          </div>
        </Card>

        <Card style={{ padding: 20 }}>
          <h2 className="display" style={{ fontSize: 18, marginBottom: 16, fontWeight: 500 }}>
            Model
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Provider">
              <select
                name="provider"
                defaultValue={a.provider}
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              >
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
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm font-mono"
              />
            </Field>
            <Field label="System prompt" full>
              <textarea
                name="systemPrompt"
                rows={6}
                defaultValue={a.system_prompt}
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm font-mono"
              />
            </Field>
          </div>
        </Card>

        <Card style={{ padding: 20 }}>
          <h2 className="display" style={{ fontSize: 18, marginBottom: 16, fontWeight: 500 }}>
            Limits
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Temperature">
              <input
                type="number"
                name="temperature"
                step="0.1"
                min="0"
                max="2"
                defaultValue={Number(a.temperature)}
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm tabular-nums"
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
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm tabular-nums"
              />
            </Field>
            <Field label="Monthly budget · USD">
              <input
                type="number"
                name="budgetMonthlyUsd"
                step="1"
                min="0"
                defaultValue={(a.budget_monthly_usd_minor / 100).toFixed(0)}
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm tabular-nums"
              />
            </Field>
          </div>
        </Card>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="rounded-md bg-ink px-4 py-2 text-sm text-ink-inverse hover:bg-ink/90"
          >
            Save changes
          </button>
          <Link
            href="/platform/agents"
            className="rounded-md border border-line-soft px-4 py-2 text-sm text-ink hover:border-line-strong"
          >
            Cancel
          </Link>
        </div>
      </form>

      {/* API key — separate cluster so the password field doesn't ride
          inside the main form. */}
      <Card style={{ padding: 20 }}>
        <h2 className="display" style={{ fontSize: 18, marginBottom: 12, fontWeight: 500 }}>
          API key
        </h2>
        {a.vault_secret_name ? (
          <p className="text-sm text-ink-secondary mb-4">
            Key configured. Vault secret:{" "}
            <code className="font-mono text-xs">{a.vault_secret_name}</code>.
            Plaintext is never returned to the client.
          </p>
        ) : (
          <p className="text-sm text-ink-tertiary mb-4">
            No key configured. The agent will fail at inference time until a
            key is rotated in.
          </p>
        )}
        <form action={rotateAgentApiKeyFromForm} className="flex items-end gap-2 flex-wrap">
          <input type="hidden" name="id" value={a.id} />
          <div className="flex-1 min-w-[280px] flex flex-col gap-1.5">
            <label className="text-[11px] uppercase tracking-widest text-ink-tertiary">
              {a.vault_secret_name ? "Rotate key" : "Set key"}
            </label>
            <input
              type="password"
              name="apiKey"
              required
              placeholder="sk-..."
              autoComplete="off"
              className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm font-mono"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-ink px-4 py-2 text-sm text-ink-inverse hover:bg-ink/90 inline-flex items-center gap-1.5"
          >
            <KeyRound className="w-3.5 h-3.5" strokeWidth={1.75} />
            {a.vault_secret_name ? "Rotate" : "Save key"}
          </button>
        </form>
        {a.vault_secret_name && (
          <form action={removeAgentApiKeyFromForm} className="mt-3">
            <input type="hidden" name="id" value={a.id} />
            <button
              type="submit"
              className="text-xs text-danger hover:underline inline-flex items-center gap-1.5"
            >
              <Trash2 className="w-3 h-3" strokeWidth={1.75} />
              Remove key entirely
            </button>
          </form>
        )}
      </Card>

      {/* Soft-delete (mark inactive). Kept in its own form so a stray
          click in the main form can't trigger it. */}
      <Card style={{ padding: 20, borderColor: "var(--danger, var(--terra))" }}>
        <h2 className="display" style={{ fontSize: 18, marginBottom: 8, fontWeight: 500 }}>
          Deactivate agent
        </h2>
        <p className="text-sm text-ink-secondary mb-3">
          Marks the agent inactive (is_active=false). Subscribed orgs stop
          seeing it; rows and key history are preserved. Reactivate by
          editing the Active flag above.
        </p>
        <form action={deletePlatformAgentFromForm}>
          <input type="hidden" name="id" value={a.id} />
          <button
            type="submit"
            className="rounded-md border border-danger/40 bg-danger/5 px-4 py-2 text-sm text-danger hover:bg-danger/10 inline-flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
            Mark inactive
          </button>
        </form>
      </Card>
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
      <Card style={{ padding: 40, textAlign: "center" }}>
        <p className="text-sm text-ink-tertiary">No organizations on this platform yet.</p>
      </Card>
    );
  }
  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
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
                <td className="font-medium">{o.display_name ?? "—"}</td>
                <td className="text-sm font-mono text-ink-tertiary">
                  {o.organization_code}
                </td>
                <td>
                  <HandoffBadge tone={enabled ? "ok" : "ink"}>
                    {o.is_enabled === null ? "Not subscribed" : enabled ? "On" : "Off"}
                  </HandoffBadge>
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
                    <button
                      type="submit"
                      className="rounded-md border border-line-soft px-3 py-1 text-xs text-ink hover:border-line-strong"
                    >
                      {enabled ? "Disable" : "Enable"}
                    </button>
                  </form>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
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
  const successRate =
    total > 0 ? `${((success / total) * 100).toFixed(1)}%` : "—";
  const costMtd = ((kpis?.total_cost_mtd ?? 0) / 100).toFixed(2);
  const avgLatency =
    kpis?.avg_latency != null ? `${kpis.avg_latency} ms` : "—";

  const STATUS_TONE: Record<string, "ok" | "warn" | "danger" | "ink"> = {
    success: "ok",
    error: "danger",
    budget_exceeded: "warn",
    rate_limited: "warn",
    in_progress: "ink",
  };

  // Daily bar chart — normalize to the max in the window for the
  // height. SVG bars keep this self-contained, no chart lib needed.
  const maxRuns = Math.max(1, ...daily.map((d) => d.runs));
  const barWidth = 100 / Math.max(daily.length, 1);

  return (
    <div className="flex flex-col gap-6">
      {/* Header KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Runs (30d)" value={String(total)} />
        <Kpi label="Success rate" value={successRate} />
        <Kpi label="Cost (MTD)" value={`$${costMtd}`} />
        <Kpi label="Avg latency" value={avgLatency} />
        <Kpi
          label="Threads"
          value={String(kpis?.active_threads ?? 0)}
        />
      </div>

      {/* Status histogram */}
      <Card style={{ padding: 20 }}>
        <h3
          className="display"
          style={{ fontSize: 16, marginBottom: 12, fontWeight: 500 }}
        >
          Status breakdown · 30d
        </h3>
        {statusBuckets.length === 0 ? (
          <p className="text-sm text-ink-tertiary">No runs yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {statusBuckets.map((b) => {
              const pct = total > 0 ? (b.count / total) * 100 : 0;
              return (
                <li key={b.status} className="flex items-center gap-3">
                  <div className="w-28 shrink-0">
                    <HandoffBadge tone={STATUS_TONE[b.status] ?? "ink"}>{b.status}</HandoffBadge>
                  </div>
                  <div className="flex-1 h-2 bg-muted rounded-sm overflow-hidden">
                    <div
                      className="h-full bg-ink/70"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-ink-tertiary tabular-nums w-16 text-right">
                    {b.count} · {pct.toFixed(0)}%
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Daily bar chart */}
      <Card style={{ padding: 20 }}>
        <h3
          className="display"
          style={{ fontSize: 16, marginBottom: 12, fontWeight: 500 }}
        >
          Daily runs · last 30 days
        </h3>
        {daily.length === 0 ? (
          <p className="text-sm text-ink-tertiary">No activity in this window.</p>
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
                    fill="var(--ink-2, currentColor)"
                    opacity={0.55}
                  >
                    <title>{`${d.day}: ${d.runs} run${d.runs === 1 ? "" : "s"} · $${(d.cost_minor / 100).toFixed(2)}`}</title>
                  </rect>
                );
              })}
            </svg>
          </div>
        )}
        <div className="mt-2 flex items-center justify-between text-[11px] text-ink-tertiary">
          <span>{daily[0]?.day ?? ""}</span>
          <span>{daily[daily.length - 1]?.day ?? ""}</span>
        </div>
      </Card>

      {/* Recent runs */}
      <Card style={{ padding: 0 }}>
        <div className="px-5 py-4 border-b border-line-soft">
          <h3
            className="display"
            style={{ fontSize: 16, fontWeight: 500 }}
          >
            Recent runs · last 50
          </h3>
        </div>
        {recent.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-ink-tertiary">
            No runs yet. Use the Test tab to send some test traffic.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary border-b border-line-soft">
                <th className="text-left px-5 py-2">Started</th>
                <th className="text-left px-3 py-2">User</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-right px-3 py-2">Tok in / out</th>
                <th className="text-right px-3 py-2">Cost</th>
                <th className="text-right px-5 py-2">Latency</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id} className="border-b border-line-soft last:border-b-0">
                  <td className="px-5 py-2 font-mono text-[11px] text-ink-tertiary">
                    {r.started_at.slice(0, 19).replace("T", " ")}
                  </td>
                  <td className="px-3 py-2 text-ink-secondary">
                    {r.user_email ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <HandoffBadge tone={STATUS_TONE[r.status] ?? "ink"}>{r.status}</HandoffBadge>
                    {r.error_message && (
                      <div className="text-[11px] text-danger mt-1 max-w-md truncate">
                        {r.error_message}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.tokens_in} / {r.tokens_out}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    ${(r.cost_usd_minor / 100).toFixed(3)}
                  </td>
                  <td className="px-5 py-2 text-right tabular-nums text-ink-secondary">
                    {r.latency_ms != null ? `${r.latency_ms} ms` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card style={{ padding: 14 }}>
      <div className="text-[10px] uppercase tracking-widest text-ink-tertiary mb-1">
        {label}
      </div>
      <div className="text-lg font-medium text-ink tabular-nums">{value}</div>
    </Card>
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
    <div className="flex flex-col gap-6">
      <KnowledgePoller statuses={docs.map((d) => d.processing_status)} />
      <Card style={{ padding: 20 }}>
        <h2
          className="display"
          style={{ fontSize: 18, marginBottom: 6, fontWeight: 500 }}
        >
          Upload document
        </h2>
        <p className="text-xs text-ink-tertiary mb-4">
          PDF, DOCX, plain text, or markdown · up to 50 MB · processing
          runs in the background. The list below updates automatically.
        </p>
        <form
          action={uploadAgentDocumentFromForm}
          encType="multipart/form-data"
          className="flex flex-col gap-3"
        >
          <input type="hidden" name="agentId" value={agentId} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                File
              </label>
              <input
                type="file"
                name="file"
                required
                accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm file:mr-3 file:rounded-sm file:border-0 file:bg-ink file:text-ink-inverse file:px-3 file:py-1.5 file:text-xs"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                Scope
              </label>
              <select
                name="organizationId"
                defaultValue=""
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              >
                <option value="">Platform-global (all subscribed orgs)</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    Organization · {o.code}
                    {o.name ? ` — ${o.name}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm text-ink-inverse hover:bg-ink/90"
            >
              <Upload className="w-3.5 h-3.5" strokeWidth={1.75} />
              Upload + process
            </button>
          </div>
        </form>
      </Card>

      <Card style={{ padding: 0 }}>
        <div className="px-5 py-4 border-b border-line-soft flex items-center justify-between">
          <h2 className="display" style={{ fontSize: 16, fontWeight: 500 }}>
            Documents ({docs.length})
          </h2>
          <p className="text-xs text-ink-tertiary">
            Chunks are retrieved via cosine similarity at query time.
          </p>
        </div>
        {docs.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-ink-tertiary">
            No documents yet. Upload above to populate the agent&apos;s knowledge base.
          </div>
        ) : (
          <ul className="divide-y divide-line-soft">
            {docs.map((d) => (
              <DocumentRow key={d.id} agentId={agentId} doc={d} />
            ))}
          </ul>
        )}
      </Card>
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
      <FileText
        className="w-4 h-4 text-ink-tertiary mt-1 shrink-0"
        strokeWidth={1.75}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-ink font-medium truncate">
            {d.filename}
          </span>
          <HandoffBadge tone={statusTone}>{d.processing_status}</HandoffBadge>
          <HandoffBadge tone={d.organization_id ? "ink" : "ok"}>
            {d.organization_id
              ? `Org · ${d.organization_code ?? d.organization_id.slice(0, 8)}`
              : "Global"}
          </HandoffBadge>
          <span className="text-[11px] text-ink-tertiary">
            {sizeKb} · {d.chunk_count} chunk{d.chunk_count === 1 ? "" : "s"}
          </span>
        </div>
        {d.processing_error && (
          <p className="text-xs text-danger mt-1 break-words">{d.processing_error}</p>
        )}
        <p className="text-[11px] text-ink-tertiary mt-1">
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
            <button
              type="submit"
              title="Re-process"
              className="p-1.5 rounded-sm hover:bg-muted text-ink-tertiary hover:text-ink"
            >
              <RefreshCcw className="w-3.5 h-3.5" strokeWidth={1.75} />
            </button>
          </form>
        )}
        <form action={deleteAgentDocumentFromForm}>
          <input type="hidden" name="documentId" value={d.id} />
          <input type="hidden" name="agentId" value={agentId} />
          <button
            type="submit"
            title="Delete document + chunks"
            className="p-1.5 rounded-sm hover:bg-danger/10 text-ink-tertiary hover:text-danger"
          >
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
    <div className={`flex flex-col gap-1.5 ${full ? "md:col-span-2 lg:col-span-3" : ""}`}>
      <label className="text-[11px] uppercase tracking-widest text-ink-tertiary">
        {label}
      </label>
      {children}
    </div>
  );
}
