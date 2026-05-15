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
  type ConfigurableAgentKey,
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
