import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SectionHeading, Card } from "@/components/dashboard/primitives";
import { createPlatformAgentFromForm } from "@/lib/agents/actions";

export const metadata = { title: "New agent · Platform Admin" };
export const dynamic = "force-dynamic";

const PROVIDERS = ["openai", "anthropic", "google"] as const;
const MODEL_HINTS: Record<(typeof PROVIDERS)[number], string> = {
  openai: "e.g. gpt-4o-mini, gpt-4o, o1-mini",
  anthropic: "e.g. claude-haiku-4-5, claude-sonnet-4-6, claude-opus-4-7",
  google: "e.g. gemini-2.0-flash-exp, gemini-1.5-pro",
};

export default async function NewAgentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 flex flex-col gap-6">
      <Link
        href="/platform/agents"
        className="inline-flex items-center gap-1.5 text-xs text-ink-tertiary hover:text-ink"
      >
        <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.75} /> All agents
      </Link>

      <SectionHeading
        eyebrow="Platform Admin · agents · new"
        title="New agent"
        subtitle="Define a platform-managed agent. The API key is encrypted at rest via Supabase Vault; the platform records only a last-4 fingerprint in audit logs."
      />

      {sp.error && (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {sp.error}
        </div>
      )}

      <form action={createPlatformAgentFromForm} className="flex flex-col gap-6">
        <Card style={{ padding: 20 }}>
          <h2
            className="display"
            style={{ fontSize: 18, marginBottom: 16, fontWeight: 500 }}
          >
            Identity
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Agent code" hint="lowercase + underscore; unique">
              <input
                type="text"
                name="agentCode"
                required
                pattern="[a-z][a-z0-9_]*"
                placeholder="tax_assistant"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm font-mono"
              />
            </Field>
            <Field label="Display name">
              <input
                type="text"
                name="displayName"
                required
                placeholder="Tax Assistant"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Scope" hint="global = available to all subscribed orgs">
              <select
                name="scope"
                defaultValue="global"
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
                  defaultChecked
                  className="rounded border-line-soft"
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
                placeholder="Short summary of what this agent does"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              />
            </Field>
          </div>
        </Card>

        <Card style={{ padding: 20 }}>
          <h2
            className="display"
            style={{ fontSize: 18, marginBottom: 16, fontWeight: 500 }}
          >
            Model + credentials
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Provider">
              <select
                name="provider"
                required
                defaultValue="openai"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm"
              >
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Model"
              hint={MODEL_HINTS.openai}
              hintId="model-hint"
            >
              <input
                type="text"
                name="model"
                required
                placeholder="gpt-4o-mini"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm font-mono"
              />
            </Field>
            <Field
              label="API key"
              hint="Stored encrypted in Supabase Vault. Skip to add later via Rotate key."
              full
            >
              <input
                type="password"
                name="apiKey"
                placeholder="sk-..."
                autoComplete="off"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm font-mono"
              />
            </Field>
            <Field label="System prompt" full>
              <textarea
                name="systemPrompt"
                rows={6}
                placeholder="You are a helpful assistant for…"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm font-mono"
              />
            </Field>
          </div>
        </Card>

        <Card style={{ padding: 20 }}>
          <h2
            className="display"
            style={{ fontSize: 18, marginBottom: 16, fontWeight: 500 }}
          >
            Limits
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Temperature" hint="0 = deterministic, 2 = max creativity">
              <input
                type="number"
                name="temperature"
                step="0.1"
                min="0"
                max="2"
                defaultValue="0.7"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm tabular-nums"
              />
            </Field>
            <Field label="Max tokens" hint="hard cap per response">
              <input
                type="number"
                name="maxTokens"
                step="100"
                min="1"
                max="200000"
                defaultValue="2000"
                className="w-full rounded-md border border-line-soft bg-surface px-3 py-2 text-sm tabular-nums"
              />
            </Field>
            <Field label="Monthly budget · USD" hint="across all orgs combined">
              <input
                type="number"
                name="budgetMonthlyUsd"
                step="1"
                min="0"
                defaultValue="50"
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
            Create agent
          </button>
          <Link
            href="/platform/agents"
            className="rounded-md border border-line-soft px-4 py-2 text-sm text-ink hover:border-line-strong"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  children,
  hint,
  hintId: _hintId,
  full,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  hintId?: string;
  full?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${full ? "md:col-span-2 lg:col-span-3" : ""}`}>
      <label className="text-[11px] uppercase tracking-widest text-ink-tertiary">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-ink-tertiary">{hint}</p>}
    </div>
  );
}
