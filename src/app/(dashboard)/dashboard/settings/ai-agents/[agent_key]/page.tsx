/**
 * Stage 9.F.2 — per-agent detail page.
 *
 * Shows the canonical kickoff prompt + lets an admin override it for
 * their org. Also surfaces:
 *   - Tier classification (drives the runtime model choice).
 *   - Plan-tier eligibility (whether this agent is allowed by the
 *     current subscription).
 *   - Current enable/disable state + toggle.
 *   - Link back to the run-now button on the operator page.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getDb } from "@/lib/db/client";
import { orgAiAgentConfig } from "@/lib/db/schema/org-ai-agent-config";
import {
  AGENT_CATALOG,
  CONFIGURABLE_AGENTS,
  type ConfigurableAgentKey,
} from "@/features/ai-agents/agent-config-keys";
import { RUN_NOW_AGENTS } from "@/features/ai-agents/run-agent-config";
import { getOrganizationByCode } from "@/lib/development/server/organizations/organization-queries";
import { getFeatureForOrg } from "@/lib/billing/gating";
import { ToggleAgentButton } from "../toggle-agent-button";
import { CustomPromptForm } from "./custom-prompt-form";
import { ProviderConfigForm } from "./provider-config-form";

export const metadata: Metadata = { title: "AI agent detail · Settings" };
export const dynamic = "force-dynamic";

export default async function AiAgentDetailPage({
  params,
}: {
  params: Promise<{ agent_key: string }>;
}) {
  const { agent_key: rawKey } = await params;
  if (!CONFIGURABLE_AGENTS.includes(rawKey as ConfigurableAgentKey)) {
    notFound();
  }
  const agentKey = rawKey as ConfigurableAgentKey;
  const desc = AGENT_CATALOG[agentKey];

  const db = getDb();
  if (!db) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title={desc.label} />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </div>
    );
  }
  const org = await getOrganizationByCode("ARCONIQUE_DEFAULT");
  if (!org) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title={desc.label} />
        <EmptyState
          title="No organization context"
          description="ARCONIQUE_DEFAULT organization missing — apply migration 0071."
        />
      </div>
    );
  }

  const override = await db
    .select()
    .from(orgAiAgentConfig)
    .where(
      and(
        eq(orgAiAgentConfig.organizationId, org.id),
        eq(orgAiAgentConfig.agentKey, agentKey),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);

  const requiredFlag = desc.tier === 3 ? "ai.agents_full" : "ai.agents_basic";
  const planFlag = await getFeatureForOrg(org.id, requiredFlag);
  const planAllows = planFlag.enabled;
  const isEnabled =
    planAllows && (!override || override.isEnabled);
  const canonicalPrompt =
    agentKey in RUN_NOW_AGENTS
      ? RUN_NOW_AGENTS[agentKey as keyof typeof RUN_NOW_AGENTS].kickoffPrompt
      : null;
  const runSlug =
    agentKey in RUN_NOW_AGENTS
      ? RUN_NOW_AGENTS[agentKey as keyof typeof RUN_NOW_AGENTS].slug
      : null;

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Settings", href: "/dashboard/settings" },
          { label: "AI agents", href: "/dashboard/settings/ai-agents" },
          { label: desc.label },
        ]}
        title={desc.label}
        description={desc.blurb}
      />

      <Section eyebrow="Status" title="Eligibility + state">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-line-soft bg-surface p-5 shadow-soft-card">
            <div className="text-[11px] uppercase tracking-widest text-ink-tertiary">
              Tier
            </div>
            <div className="mt-1 text-lg font-medium">Tier {desc.tier}</div>
            <div className="mt-1 text-xs text-ink-secondary">
              {desc.tier === 1 && "Light prompts on Haiku."}
              {desc.tier === 2 && "Standard prompts on Sonnet."}
              {desc.tier === 3 && "Heavy reasoning on Opus."}
            </div>
          </div>
          <div className="rounded-2xl border border-line-soft bg-surface p-5 shadow-soft-card">
            <div className="text-[11px] uppercase tracking-widest text-ink-tertiary">
              Plan
            </div>
            <div className="mt-1">
              {planAllows ? (
                <Badge tone="success">Allowed</Badge>
              ) : (
                <Badge tone="neutral">Not in plan</Badge>
              )}
            </div>
            <div className="mt-1 text-xs text-ink-secondary">
              Requires <span className="font-mono">{requiredFlag}</span>.
              {!planAllows && (
                <>
                  {" "}
                  <Link href="/dashboard/billing/upgrade" className="underline">
                    Upgrade plan
                  </Link>
                </>
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-line-soft bg-surface p-5 shadow-soft-card">
            <div className="text-[11px] uppercase tracking-widest text-ink-tertiary">
              State
            </div>
            <div className="mt-1">
              {!planAllows ? (
                <Badge tone="neutral">—</Badge>
              ) : isEnabled ? (
                <Badge tone="success">Enabled</Badge>
              ) : (
                <Badge tone="warning">Disabled by org</Badge>
              )}
            </div>
            {planAllows && (
              <div className="mt-2">
                <ToggleAgentButton
                  agentKey={agentKey}
                  currentEnabled={isEnabled}
                />
              </div>
            )}
          </div>
        </div>
      </Section>

      <Section
        eyebrow="Provider"
        title="API key + provider override"
        description="Per-agent provider routing and API key. Defaults to the platform's system key when none is set. Encrypted at rest with AES-256-GCM."
      >
        <ProviderConfigForm
          agentKey={agentKey}
          currentProvider={
            override?.provider === "anthropic" ||
            override?.provider === "openai" ||
            override?.provider === "gemini"
              ? override.provider
              : null
          }
          currentModel={override?.model ?? null}
          hasApiKey={Boolean(override?.apiKeyEncrypted)}
          apiKeySetAt={
            override?.apiKeySetAt ? override.apiKeySetAt.toISOString() : null
          }
          lastTestStatus={
            override?.lastTestStatus === "ok" ||
            override?.lastTestStatus === "failed"
              ? override.lastTestStatus
              : null
          }
          lastTestAt={
            override?.lastTestAt ? override.lastTestAt.toISOString() : null
          }
          lastTestError={override?.lastTestError ?? null}
        />
      </Section>

      {canonicalPrompt !== null && (
        <Section
          eyebrow="Prompt"
          title="Kickoff prompt"
          description="Sent to the agent when an operator presses 'Run now'. The canonical prompt below ships with the platform; you can override it for your workspace without changing other tenants."
        >
          <div className="rounded-2xl border border-line-soft bg-muted/30 p-5 text-sm">
            <div className="text-[11px] uppercase tracking-widest text-ink-tertiary mb-2">
              Canonical prompt
            </div>
            <p className="font-mono text-xs whitespace-pre-wrap leading-relaxed">
              {canonicalPrompt}
            </p>
          </div>
          <div className="mt-4">
            <CustomPromptForm
              agentKey={agentKey}
              currentOverride={override?.customPrompt ?? null}
              canonicalPrompt={canonicalPrompt}
            />
          </div>
        </Section>
      )}

      {runSlug && (
        <Section
          eyebrow="Run"
          title="Trigger the agent"
          description="The Run-now button lives on the agent's dashboard page. It uses the canonical prompt unless you've set an override above."
        >
          <Link
            href={`/development-os/ai-agents/${runSlug}`}
            className="inline-flex items-center rounded-full border border-line-soft bg-surface px-4 py-2 text-sm font-medium hover:bg-muted/40"
          >
            Open {desc.label} dashboard →
          </Link>
        </Section>
      )}

      {desc.category === "system" && (
        <Section eyebrow="System" title="System surface">
          <p className="text-sm text-ink-secondary max-w-prose">
            This is a system-level surface, not a runnable agent. The
            enable/disable toggle controls whether the dashboard page and its
            associated machinery (queue / memory ingestion) are active for
            your workspace.
          </p>
          <div className="mt-4">
            {agentKey === "inbox" && (
              <Link
                href="/development-os/ai-agents/inbox"
                className="inline-flex items-center rounded-full border border-line-soft bg-surface px-4 py-2 text-sm font-medium hover:bg-muted/40"
              >
                Open inbox →
              </Link>
            )}
            {agentKey === "memory" && (
              <Link
                href="/development-os/ai-agents/memory"
                className="inline-flex items-center rounded-full border border-line-soft bg-surface px-4 py-2 text-sm font-medium hover:bg-muted/40"
              >
                Open memory →
              </Link>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}
