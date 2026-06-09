"use server";

/**
 * Stage 9.F.1 — per-tenant AI agent enable/disable + custom prompt.
 *
 * Two server actions:
 *   setAgentEnabledAction      — toggle on/off; default state for an
 *                                untouched agent is "enabled" (subject
 *                                to the org's plan-tier eligibility).
 *   setAgentCustomPromptAction — override or clear the canonical
 *                                kickoff prompt. NULL = use canonical.
 *
 * Plan-tier eligibility check lives in `getAgentEligibility(orgId, agentKey)`
 * — the runtime caller (e.g., `runAgentAction`) consults this BEFORE
 * firing the agent so a disabled / not-entitled agent fails fast with
 * a clear message.
 */

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/lib/db/client";
import { orgAiAgentConfig } from "@/lib/db/schema/org-ai-agent-config";
import { auditEvents } from "@/lib/db/schema/audit";
import { requirePermission } from "@/features/auth/permissions";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { requireOrgId } from "@/features/auth/require-org";
import { getFeatureForOrg } from "@/lib/billing/gating";
import { agentCodeToTier } from "@/lib/ai/router/tier-rules";
import {
  CONFIGURABLE_AGENTS,
  DEFAULT_KNOWLEDGE_SOURCES,
  type ConfigurableAgentKey,
  type AgentMode,
  type KnowledgeSources,
} from "./agent-config-keys";

// ============================================================================
// Eligibility — composes plan-tier (Stage 7.B) + per-org override (this table)
// ============================================================================

export type AgentEligibility =
  | { eligible: true; reason: "plan_allows_and_enabled" }
  | {
      eligible: false;
      reason:
        | "no_subscription"
        | "plan_excludes_agent"
        | "disabled_by_org"
        | "unknown_agent";
    };

/**
 * Resolves whether an agent is currently runnable for an org.
 * Compose: plan-tier check (via `plan_features`) AND per-org override.
 */
export async function getAgentEligibility(
  organizationId: string,
  agentKey: string,
): Promise<AgentEligibility> {
  if (!CONFIGURABLE_AGENTS.includes(agentKey as ConfigurableAgentKey)) {
    return { eligible: false, reason: "unknown_agent" };
  }

  // Tier 3 (Opus) requires the `ai.agents_full` flag; Tier 1+2 require
  // `ai.agents_basic`. Internal / Pro / Enterprise carry full; Standard
  // carries basic; Trial inherits basic via the seed.
  const tier = agentCodeToTier(agentKey);
  const requiredFlag = tier === 3 ? "ai.agents_full" : "ai.agents_basic";
  const flag = await getFeatureForOrg(organizationId, requiredFlag);
  if (!flag.enabled) {
    return {
      eligible: false,
      reason:
        flag.reason === "no_subscription" ? "no_subscription" : "plan_excludes_agent",
    };
  }

  const db = requireDb();
  const override = await db
    .select({ isEnabled: orgAiAgentConfig.isEnabled })
    .from(orgAiAgentConfig)
    .where(
      and(
        eq(orgAiAgentConfig.organizationId, organizationId),
        eq(orgAiAgentConfig.agentKey, agentKey),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);

  if (override && !override.isEnabled) {
    return { eligible: false, reason: "disabled_by_org" };
  }
  return { eligible: true, reason: "plan_allows_and_enabled" };
}

// ============================================================================
// Agent mode + tone + knowledge sources (Block 03 — no-code config)
//
// AgentMode / KnowledgeSources / DEFAULT_KNOWLEDGE_SOURCES are defined in the
// pure `agent-config-keys` module (a "use server" file may only export async
// functions) and imported above; client components import them from there.
// ============================================================================

interface AgentRuntimeConfig {
  mode: AgentMode;
  tone: string | null;
  knowledgeSources: KnowledgeSources;
  customPrompt: string | null;
}

function coerceKnowledgeSources(raw: unknown): KnowledgeSources {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_KNOWLEDGE_SOURCES };
  const r = raw as Record<string, unknown>;
  return {
    conversation: r.conversation !== false,
    project_memory: r.project_memory !== false,
    templates: r.templates !== false,
  };
}

/**
 * Resolve the full per-org runtime config for an agent — mode, tone,
 * knowledge sources, custom prompt. Used by the inbox→agent draft loop so
 * the drafter honors the operator's no-code settings. Falls back to safe
 * defaults (mode='semi' / all sources on / no custom prompt) when no row
 * exists or the agent key is unknown.
 */
export async function getAgentRuntimeConfig(
  organizationId: string,
  agentKey: string,
): Promise<AgentRuntimeConfig> {
  const fallback: AgentRuntimeConfig = {
    mode: "semi",
    tone: null,
    knowledgeSources: { ...DEFAULT_KNOWLEDGE_SOURCES },
    customPrompt: null,
  };
  if (!CONFIGURABLE_AGENTS.includes(agentKey as ConfigurableAgentKey)) {
    return fallback;
  }
  const db = requireDb();
  const row = await db
    .select({
      agentMode: orgAiAgentConfig.agentMode,
      tone: orgAiAgentConfig.tone,
      knowledgeSources: orgAiAgentConfig.knowledgeSources,
      customPrompt: orgAiAgentConfig.customPrompt,
      isEnabled: orgAiAgentConfig.isEnabled,
    })
    .from(orgAiAgentConfig)
    .where(
      and(
        eq(orgAiAgentConfig.organizationId, organizationId),
        eq(orgAiAgentConfig.agentKey, agentKey),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);
  if (!row) return fallback;
  // A disabled agent is treated as mode 'off' regardless of the stored
  // mode — the toggle is the hard kill-switch.
  const storedMode =
    row.agentMode === "auto" || row.agentMode === "off" ? row.agentMode : "semi";
  return {
    mode: row.isEnabled ? storedMode : "off",
    tone: row.tone ?? null,
    knowledgeSources: coerceKnowledgeSources(row.knowledgeSources),
    customPrompt: row.customPrompt ?? null,
  };
}

const setModeSchema = z.object({
  agentKey: z.enum(CONFIGURABLE_AGENTS),
  mode: z.enum(["auto", "semi", "off"]),
});

export type SetAgentModeResult =
  | { ok: true; agentKey: string; mode: AgentMode }
  | { ok: false; error: string };

export async function setAgentModeAction(
  input: z.input<typeof setModeSchema>,
): Promise<SetAgentModeResult> {
  await requirePermission("users.write");
  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not signed in." };

  const parsed = setModeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  let orgId: string;
  try {
    orgId = await requireOrgId();
  } catch {
    return { ok: false, error: "No organization context available." };
  }

  const db = requireDb();
  const now = new Date();
  await db
    .insert(orgAiAgentConfig)
    .values({
      organizationId: orgId,
      agentKey: parsed.data.agentKey,
      isEnabled: true,
      agentMode: parsed.data.mode,
      updatedBy: me.id,
    })
    .onConflictDoUpdate({
      target: [orgAiAgentConfig.organizationId, orgAiAgentConfig.agentKey],
      set: {
        agentMode: parsed.data.mode,
        updatedBy: me.id,
        updatedAt: now,
      },
    });

  await db.insert(auditEvents).values({
    actorUserId: me.id,
    action: "ai.agent.mode_changed",
    entityType: "org_ai_agent_config",
    entityId: null,
    after: {
      organization_id: orgId,
      agent_key: parsed.data.agentKey,
      agent_mode: parsed.data.mode,
    },
  });

  revalidatePath("/dashboard/settings/ai-agents");
  revalidatePath(`/dashboard/settings/ai-agents/${parsed.data.agentKey}`);
  return { ok: true, agentKey: parsed.data.agentKey, mode: parsed.data.mode };
}

const setToneSchema = z.object({
  agentKey: z.enum(CONFIGURABLE_AGENTS),
  tone: z.string().max(280).nullable(),
});

export type SetAgentToneResult =
  | { ok: true; agentKey: string; hasTone: boolean }
  | { ok: false; error: string };

export async function setAgentToneAction(
  input: z.input<typeof setToneSchema>,
): Promise<SetAgentToneResult> {
  await requirePermission("users.write");
  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not signed in." };

  const parsed = setToneSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const trimmed =
    parsed.data.tone && parsed.data.tone.trim().length > 0
      ? parsed.data.tone.trim()
      : null;

  let orgId: string;
  try {
    orgId = await requireOrgId();
  } catch {
    return { ok: false, error: "No organization context available." };
  }

  const db = requireDb();
  const now = new Date();
  await db
    .insert(orgAiAgentConfig)
    .values({
      organizationId: orgId,
      agentKey: parsed.data.agentKey,
      isEnabled: true,
      tone: trimmed,
      updatedBy: me.id,
    })
    .onConflictDoUpdate({
      target: [orgAiAgentConfig.organizationId, orgAiAgentConfig.agentKey],
      set: { tone: trimmed, updatedBy: me.id, updatedAt: now },
    });

  await db.insert(auditEvents).values({
    actorUserId: me.id,
    action: "ai.agent.tone_changed",
    entityType: "org_ai_agent_config",
    entityId: null,
    after: {
      organization_id: orgId,
      agent_key: parsed.data.agentKey,
      has_tone: trimmed !== null,
    },
  });

  revalidatePath(`/dashboard/settings/ai-agents/${parsed.data.agentKey}`);
  return { ok: true, agentKey: parsed.data.agentKey, hasTone: trimmed !== null };
}

const setSourcesSchema = z.object({
  agentKey: z.enum(CONFIGURABLE_AGENTS),
  knowledgeSources: z.object({
    conversation: z.boolean(),
    project_memory: z.boolean(),
    templates: z.boolean(),
  }),
});

export type SetKnowledgeSourcesResult =
  | { ok: true; agentKey: string; knowledgeSources: KnowledgeSources }
  | { ok: false; error: string };

export async function setAgentKnowledgeSourcesAction(
  input: z.input<typeof setSourcesSchema>,
): Promise<SetKnowledgeSourcesResult> {
  await requirePermission("users.write");
  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not signed in." };

  const parsed = setSourcesSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  let orgId: string;
  try {
    orgId = await requireOrgId();
  } catch {
    return { ok: false, error: "No organization context available." };
  }

  const sources = parsed.data.knowledgeSources;
  const db = requireDb();
  const now = new Date();
  await db
    .insert(orgAiAgentConfig)
    .values({
      organizationId: orgId,
      agentKey: parsed.data.agentKey,
      isEnabled: true,
      knowledgeSources: sources,
      updatedBy: me.id,
    })
    .onConflictDoUpdate({
      target: [orgAiAgentConfig.organizationId, orgAiAgentConfig.agentKey],
      set: { knowledgeSources: sources, updatedBy: me.id, updatedAt: now },
    });

  await db.insert(auditEvents).values({
    actorUserId: me.id,
    action: "ai.agent.knowledge_sources_changed",
    entityType: "org_ai_agent_config",
    entityId: null,
    after: {
      organization_id: orgId,
      agent_key: parsed.data.agentKey,
      knowledge_sources: sources,
    },
  });

  revalidatePath(`/dashboard/settings/ai-agents/${parsed.data.agentKey}`);
  return { ok: true, agentKey: parsed.data.agentKey, knowledgeSources: sources };
}

// ============================================================================
// setAgentEnabledAction
// ============================================================================

const setEnabledSchema = z.object({
  agentKey: z.enum(CONFIGURABLE_AGENTS),
  enabled: z.boolean(),
});

export type SetAgentEnabledResult =
  | { ok: true; agentKey: string; enabled: boolean }
  | { ok: false; error: string };

export async function setAgentEnabledAction(
  input: z.input<typeof setEnabledSchema>,
): Promise<SetAgentEnabledResult> {
  await requirePermission("users.write");
  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not signed in." };

  const parsed = setEnabledSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  let orgId: string;
  try {
    orgId = await requireOrgId();
  } catch {
    return { ok: false, error: "No organization context available." };
  }

  const db = requireDb();
  const now = new Date();
  // Upsert on (org, agent_key).
  await db
    .insert(orgAiAgentConfig)
    .values({
      organizationId: orgId,
      agentKey: parsed.data.agentKey,
      isEnabled: parsed.data.enabled,
      updatedBy: me.id,
    })
    .onConflictDoUpdate({
      target: [orgAiAgentConfig.organizationId, orgAiAgentConfig.agentKey],
      set: {
        isEnabled: parsed.data.enabled,
        updatedBy: me.id,
        updatedAt: now,
      },
    });

  await db.insert(auditEvents).values({
    actorUserId: me.id,
    action: parsed.data.enabled
      ? "ai.agent.enabled"
      : "ai.agent.disabled",
    entityType: "org_ai_agent_config",
    entityId: null,
    after: {
      organization_id: orgId,
      agent_key: parsed.data.agentKey,
      is_enabled: parsed.data.enabled,
    },
  });

  revalidatePath("/dashboard/settings/ai-agents");
  revalidatePath(`/dashboard/settings/ai-agents/${parsed.data.agentKey}`);
  return {
    ok: true,
    agentKey: parsed.data.agentKey,
    enabled: parsed.data.enabled,
  };
}

// ============================================================================
// setAgentCustomPromptAction
// ============================================================================

const setPromptSchema = z.object({
  agentKey: z.enum(CONFIGURABLE_AGENTS),
  customPrompt: z.string().max(2000).nullable(),
});

export type SetAgentCustomPromptResult =
  | { ok: true; agentKey: string; hasOverride: boolean }
  | { ok: false; error: string };

export async function setAgentCustomPromptAction(
  input: z.input<typeof setPromptSchema>,
): Promise<SetAgentCustomPromptResult> {
  await requirePermission("users.write");
  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not signed in." };

  const parsed = setPromptSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const trimmed =
    parsed.data.customPrompt && parsed.data.customPrompt.trim().length > 0
      ? parsed.data.customPrompt.trim()
      : null;

  let orgId: string;
  try {
    orgId = await requireOrgId();
  } catch {
    return { ok: false, error: "No organization context available." };
  }

  const db = requireDb();
  const now = new Date();
  await db
    .insert(orgAiAgentConfig)
    .values({
      organizationId: orgId,
      agentKey: parsed.data.agentKey,
      isEnabled: true,
      customPrompt: trimmed,
      updatedBy: me.id,
    })
    .onConflictDoUpdate({
      target: [orgAiAgentConfig.organizationId, orgAiAgentConfig.agentKey],
      set: {
        customPrompt: trimmed,
        updatedBy: me.id,
        updatedAt: now,
      },
    });

  await db.insert(auditEvents).values({
    actorUserId: me.id,
    action: trimmed
      ? "ai.agent.prompt_overridden"
      : "ai.agent.prompt_reset",
    entityType: "org_ai_agent_config",
    entityId: null,
    after: {
      organization_id: orgId,
      agent_key: parsed.data.agentKey,
      has_override: trimmed !== null,
    },
  });

  revalidatePath(`/dashboard/settings/ai-agents/${parsed.data.agentKey}`);
  return {
    ok: true,
    agentKey: parsed.data.agentKey,
    hasOverride: trimmed !== null,
  };
}
