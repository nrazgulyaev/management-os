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
import { and, eq } from "drizzle-orm";
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
import { requireOrgId } from "@/features/auth/require-org";
import { getFeatureForOrg } from "@/lib/billing/gating";
import { ToggleAgentButton } from "../toggle-agent-button";
import { CustomPromptForm } from "./custom-prompt-form";
import { ProviderConfigForm } from "./provider-config-form";
import { AgentConfigForm } from "./agent-config-form";
import type {
  AgentMode,
  KnowledgeSources,
} from "@/features/ai-agents/agent-config-keys";

export const metadata: Metadata = { title: "AI agent detail · Settings" };
export const dynamic = "force-dynamic";

function AgentDetailHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="page-header">
      <div className="left">
        <div className="crumb">
          <Link href="/dashboard/settings">Settings</Link> /{" "}
          <Link href="/dashboard/settings/ai-agents">AI agents</Link> /{" "}
          <span>{title}</span>
        </div>
        <h1>{title}</h1>
        {description && (
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

export default async function AiAgentDetailPage({
  params,
}: {
  params: Promise<{ agent_key: string }>;
}) {
  const { agent_key: rawKey } = await params;
  // Hotfix HF-3 — graceful unknown-key handling instead of a bare
  // notFound(). New agent_configurations rows added in SQL without
  // a matching CONFIGURABLE_AGENTS entry now render a helpful
  // EmptyState pointing back at the list, rather than a 404.
  if (!CONFIGURABLE_AGENTS.includes(rawKey as ConfigurableAgentKey)) {
    return (
      <>
        <AgentDetailHeader title="Unknown agent" />
        <EmptyState
          title={`No agent registered with key "${rawKey}"`}
          description="This URL does not match any agent in the configurable-agents catalog. If you arrived here from a cabinet 'Configure key' CTA, the underlying agent may have been added in SQL without a matching entry in src/features/ai-agents/agent-config-keys.ts — open a ticket so the team can sync the catalog."
        />
        <div className="mt-[18px]">
          <Link
            href="/dashboard/settings/ai-agents"
            className="btn btn-ghost btn-sm"
          >
            ← Back to AI agents
          </Link>
        </div>
      </>
    );
  }
  const agentKey = rawKey as ConfigurableAgentKey;
  const desc = AGENT_CATALOG[agentKey];

  const db = getDb();
  if (!db) {
    return (
      <>
        <AgentDetailHeader title={desc.label} />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </>
    );
  }
  let orgId: string;
  try {
    orgId = await requireOrgId();
  } catch {
    return (
      <>
        <AgentDetailHeader title={desc.label} />
        <EmptyState
          title="No organization context"
          description="Sign in to configure this agent."
        />
      </>
    );
  }

  const override = await db
    .select()
    .from(orgAiAgentConfig)
    .where(
      and(
        eq(orgAiAgentConfig.organizationId, orgId),
        eq(orgAiAgentConfig.agentKey, agentKey),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);

  const requiredFlag = desc.tier === 3 ? "ai.agents_full" : "ai.agents_basic";
  const planFlag = await getFeatureForOrg(orgId, requiredFlag);
  const planAllows = planFlag.enabled;
  const isEnabled =
    planAllows && (!override || override.isEnabled);
  // Block 03 — resolve the no-code config knobs from the override row.
  const rawMode = override?.agentMode;
  const currentMode: AgentMode =
    rawMode === "auto" || rawMode === "off" ? rawMode : "semi";
  const rawSources = override?.knowledgeSources as
    | Partial<KnowledgeSources>
    | null
    | undefined;
  const currentSources: KnowledgeSources = {
    conversation: rawSources?.conversation !== false,
    project_memory: rawSources?.project_memory !== false,
    templates: rawSources?.templates !== false,
  };
  const canonicalPrompt =
    agentKey in RUN_NOW_AGENTS
      ? RUN_NOW_AGENTS[agentKey as keyof typeof RUN_NOW_AGENTS].kickoffPrompt
      : null;
  const runSlug =
    agentKey in RUN_NOW_AGENTS
      ? RUN_NOW_AGENTS[agentKey as keyof typeof RUN_NOW_AGENTS].slug
      : null;

  return (
    <>
      <AgentDetailHeader title={desc.label} description={desc.blurb} />

      <h2 className="display text-[22px] font-normal mt-[18px] mb-3.5">
        Eligibility + state
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-[18px]">
        <div className="card card-pad">
          <div className="label">Tier</div>
          <div className="mt-1 text-lg font-medium text-ink">
            Tier {desc.tier}
          </div>
          <div className="mt-1 text-xs text-ink-3">
            {desc.tier === 1 && "Light prompts on Haiku."}
            {desc.tier === 2 && "Standard prompts on Sonnet."}
            {desc.tier === 3 && "Heavy reasoning on Opus."}
          </div>
        </div>
        <div className="card card-pad">
          <div className="label">Plan</div>
          <div className="mt-1">
            {planAllows ? (
              <Badge tone="success">Allowed</Badge>
            ) : (
              <Badge tone="neutral">Not in plan</Badge>
            )}
          </div>
          <div className="mt-1 text-xs text-ink-3">
            Requires <span className="mono">{requiredFlag}</span>.
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
        <div className="card card-pad">
          <div className="label">State</div>
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

      <h2 className="display text-[22px] font-normal mt-[18px] mb-1">
        No-code agent config
      </h2>
      <p className="text-[12px] text-ink-3 mb-3.5 max-w-[760px]">
        Tune how this agent behaves without touching the prompt. Mode controls
        autonomy (auto sends on its own · semi drafts for review · off
        disables AI); tone shapes the writing style; knowledge sources govern
        what the drafter may ground on. The Agent Inbox agent&apos;s mode +
        tone + sources drive the AI-draft loop in the unified inbox.
      </p>
      <div className="card card-pad mb-[18px]">
        <AgentConfigForm
          agentKey={agentKey}
          currentMode={currentMode}
          currentTone={override?.tone ?? null}
          currentSources={currentSources}
          drivesInbox={agentKey === "inbox"}
        />
      </div>

      <h2 className="display text-[22px] font-normal mt-[18px] mb-1">
        API key + provider override
      </h2>
      <p className="text-[12px] text-ink-3 mb-3.5 max-w-[760px]">
        Per-agent provider routing and API key. Defaults to the
        platform&apos;s system key when none is set. Encrypted at rest with
        AES-256-GCM.
      </p>
      <div className="card card-pad mb-[18px]">
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
      </div>

      {canonicalPrompt !== null && (
        <>
          <h2 className="display text-[22px] font-normal mt-[18px] mb-1">
            Kickoff prompt
          </h2>
          <p className="text-[12px] text-ink-3 mb-3.5 max-w-[760px]">
            Sent to the agent when an operator presses &lsquo;Run now&rsquo;.
            The canonical prompt below ships with the platform; you can
            override it for your workspace without changing other tenants.
          </p>
          <div className="card card-pad mb-[18px]">
            <div className="label mb-2">Canonical prompt</div>
            <p className="mono text-xs whitespace-pre-wrap leading-relaxed">
              {canonicalPrompt}
            </p>
          </div>
          <div className="card card-pad mb-[18px]">
            <CustomPromptForm
              agentKey={agentKey}
              currentOverride={override?.customPrompt ?? null}
              canonicalPrompt={canonicalPrompt}
            />
          </div>
        </>
      )}

      {runSlug && (
        <>
          <h2 className="display text-[22px] font-normal mt-[18px] mb-1">
            Trigger the agent
          </h2>
          <p className="text-[12px] text-ink-3 mb-3.5 max-w-[760px]">
            The Run-now button lives on the agent&apos;s dashboard page. It
            uses the canonical prompt unless you&apos;ve set an override
            above.
          </p>
          <div className="mb-[18px]">
            <Link
              href={`/development-os/ai-agents/${runSlug}`}
              className="btn btn-secondary btn-sm"
            >
              Open {desc.label} dashboard →
            </Link>
          </div>
        </>
      )}

      {desc.category === "system" && (
        <>
          <h2 className="display text-[22px] font-normal mt-[18px] mb-3.5">
            System surface
          </h2>
          <div className="card card-pad mb-[18px]">
            <p className="text-sm text-ink-3 max-w-prose">
              This is a system-level surface, not a runnable agent. The
              enable/disable toggle controls whether the dashboard page and
              its associated machinery (queue / memory ingestion) are active
              for your workspace.
            </p>
            <div className="mt-4">
              {agentKey === "inbox" && (
                <Link
                  href="/development-os/ai-agents/inbox"
                  className="btn btn-secondary btn-sm"
                >
                  Open inbox →
                </Link>
              )}
              {agentKey === "memory" && (
                <Link
                  href="/development-os/ai-agents/memory"
                  className="btn btn-secondary btn-sm"
                >
                  Open memory →
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
