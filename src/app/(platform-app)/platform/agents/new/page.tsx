import Link from "next/link";
import { SectionHeading } from "@/components/dashboard/primitives";
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
    <div className="mx-auto max-w-[760px] px-[34px] py-[26px] pb-20">
      <Link
        href="/platform/agents"
        className="btn btn-ghost btn-sm pl-0 mb-3 inline-flex"
      >
        ← All agents
      </Link>

      <SectionHeading
        eyebrow="Platform Admin · agents · new"
        title="New agent"
        subtitle="Define a platform-managed agent. The API key is encrypted at rest via Supabase Vault; the platform records only a last-4 fingerprint in audit logs."
      />

      {sp.error && (
        <div
          role="alert"
          className="rounded-[10px] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_6%,transparent)] px-4 py-3 text-sm text-[var(--danger)] mb-5"
        >
          {sp.error}
        </div>
      )}

      <form action={createPlatformAgentFromForm} className="flex flex-col gap-[18px]">
        <div className="card card-pad">
          <h3 className="ag-h3">Identity</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Agent code" hint="lowercase + underscore; unique">
              <input
                type="text"
                name="agentCode"
                required
                pattern="[a-z][a-z0-9_]*"
                placeholder="tax_assistant"
                className="input mono"
              />
            </Field>
            <Field label="Display name">
              <input
                type="text"
                name="displayName"
                required
                placeholder="Tax Assistant"
                className="input"
              />
            </Field>
            <Field label="Scope" hint="global = available to all subscribed orgs">
              <select name="scope" defaultValue="global" className="select">
                <option value="global">global</option>
                <option value="organization">organization</option>
              </select>
            </Field>
            <Field label="Active">
              <label className="inline-flex items-center gap-2 h-9">
                <input type="checkbox" name="isActive" defaultChecked />
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
                className="textarea"
              />
            </Field>
          </div>
        </div>

        <div className="card card-pad">
          <h3 className="ag-h3">Model + credentials</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Provider">
              <select name="provider" required defaultValue="openai" className="select">
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Model" hint={MODEL_HINTS.openai} hintId="model-hint">
              <input
                type="text"
                name="model"
                required
                placeholder="gpt-4o-mini"
                className="input mono"
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
                className="input mono"
              />
            </Field>
            <Field label="System prompt" full>
              <textarea
                name="systemPrompt"
                rows={6}
                placeholder="You are a helpful assistant for…"
                className="textarea mono text-[13px] leading-[1.6]"
              />
            </Field>
          </div>
        </div>

        <div className="card card-pad">
          <h3 className="ag-h3">Limits</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Temperature" hint="0 = deterministic, 2 = max creativity">
              <input
                type="number"
                name="temperature"
                step="0.1"
                min="0"
                max="2"
                defaultValue="0.7"
                className="input mono tabular-nums"
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
                className="input mono tabular-nums"
              />
            </Field>
            <Field label="Monthly budget · USD" hint="across all orgs combined">
              <input
                type="number"
                name="budgetMonthlyUsd"
                step="1"
                min="0"
                defaultValue="50"
                className="input mono tabular-nums"
              />
            </Field>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button type="submit" className="btn btn-accent btn-sm">
            Create agent
          </button>
          <Link href="/platform/agents" className="btn btn-secondary btn-sm">
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
    <div className={`field ${full ? "md:col-span-2 lg:col-span-3" : ""}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <p className="field-help">{hint}</p>}
    </div>
  );
}
