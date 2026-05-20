"use server";

/**
 * P5.3.2 AGENT-CRUD — server actions for platform_agent_configs and
 * org_agent_subscriptions. Called from the /platform/agents super_admin
 * UI.
 *
 * Auth: the parent (platform-app)/layout.tsx already gates the entire
 * /platform/* tree on super_admin (Stage 10.6.E.1). These actions add a
 * defensive re-check via getCurrentUserContext() so a misconfigured
 * route or a non-layout call site can't accidentally write.
 *
 * Vault: API keys are routed through src/lib/agents/vault.ts. They
 * never touch the application database column, are never returned to
 * the client, and only ever appear in audit logs as a last-4
 * fingerprint.
 */

import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDb } from "@/lib/db/client";
import { platformAgentConfigs } from "@/lib/db/schema/agents";
import { requireSuperAdmin as requireSuperAdminCtx } from "@/features/auth/require-super-admin";
import { recordAuditEvent } from "@/features/audit/services";
import {
  storeAgentApiKey,
  deleteAgentApiKey,
  vaultAuditMetadata,
  keyFingerprint,
} from "./vault";

// -----------------------------------------------------------------------------
// Auth helper
// -----------------------------------------------------------------------------

async function requireSuperAdmin(): Promise<{ appUserId: string }> {
  const ctx = await requireSuperAdminCtx();
  return { appUserId: ctx.appUser?.id ?? "demo" };
}

export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

// -----------------------------------------------------------------------------
// CREATE
// -----------------------------------------------------------------------------

const createSchema = z.object({
  agentCode: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z][a-z0-9_]*$/, "lowercase letters / digits / underscore; must start with a letter"),
  displayName: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  scope: z.enum(["global", "organization"]),
  provider: z.enum(["openai", "anthropic", "google"]),
  model: z.string().min(1).max(120),
  systemPrompt: z.string().max(20000).optional().nullable(),
  apiKey: z.string().min(1).max(500).optional().nullable(),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(1).max(200000),
  budgetMonthlyUsdMinor: z.number().int().min(0),
  isActive: z.boolean(),
});

export type CreatePlatformAgentInput = z.input<typeof createSchema>;

export async function createPlatformAgent(
  input: CreatePlatformAgentInput,
): Promise<ActionResult<{ id: string; agentCode: string }>> {
  let appUserId: string;
  try {
    ({ appUserId } = await requireSuperAdmin());
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Forbidden" };
  }

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const db = requireDb();

  // 1) Insert the config row without the vault_secret_name (set in step 2).
  let agentId: string;
  try {
    const [row] = await db
      .insert(platformAgentConfigs)
      .values({
        agentCode: parsed.data.agentCode,
        displayName: parsed.data.displayName,
        description: parsed.data.description ?? null,
        scope: parsed.data.scope,
        provider: parsed.data.provider,
        model: parsed.data.model,
        systemPrompt: parsed.data.systemPrompt ?? "",
        temperature: parsed.data.temperature.toFixed(2),
        maxTokens: parsed.data.maxTokens,
        budgetMonthlyUsdMinor: parsed.data.budgetMonthlyUsdMinor,
        isActive: parsed.data.isActive,
        createdBy: appUserId,
      })
      .returning({ id: platformAgentConfigs.id });
    agentId = row.id;
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    if (raw.includes("23505")) {
      return {
        ok: false,
        error: `Agent code "${parsed.data.agentCode}" already exists.`,
      };
    }
    return { ok: false, error: raw.slice(0, 300) };
  }

  // 2) If a key was provided, store it in Vault and update the row.
  let fingerprint: string | undefined;
  if (parsed.data.apiKey && parsed.data.apiKey.trim().length > 0) {
    const stored = await storeAgentApiKey(
      agentId,
      parsed.data.apiKey,
      `${parsed.data.provider} key for agent ${parsed.data.agentCode}`,
    );
    if (!stored.ok) {
      // The agent row exists but no key — operator can rotate later.
      // Don't roll back; surface the warning via audit + result.
      await recordAuditEvent({
        actorUserId: appUserId,
        action: "platform.agent.api_key.store_failed",
        entityType: "platform_agent_config",
        entityId: agentId,
        metadata: {
          provider: parsed.data.provider,
          error: stored.error ?? "unknown",
        },
      }).catch(() => null);
    } else {
      await db
        .update(platformAgentConfigs)
        .set({ vaultSecretName: stored.vaultSecretName, updatedAt: new Date() })
        .where(eq(platformAgentConfigs.id, agentId));
      fingerprint = stored.fingerprint;
    }
  }

  // 3) Audit.
  await recordAuditEvent({
    actorUserId: appUserId,
    action: "platform.agent.created",
    entityType: "platform_agent_config",
    entityId: agentId,
    metadata: {
      agent_code: parsed.data.agentCode,
      provider: parsed.data.provider,
      model: parsed.data.model,
      scope: parsed.data.scope,
      ...(fingerprint
        ? vaultAuditMetadata({
            agentId,
            fingerprint,
            provider: parsed.data.provider,
          })
        : {}),
    },
  }).catch(() => null);

  revalidatePath("/platform/agents");
  return { ok: true, data: { id: agentId, agentCode: parsed.data.agentCode } };
}

// -----------------------------------------------------------------------------
// UPDATE (config fields, not the key)
// -----------------------------------------------------------------------------

const updateSchema = createSchema
  .omit({ agentCode: true, apiKey: true })
  .partial()
  .extend({ id: z.string().uuid() });

export type UpdatePlatformAgentInput = z.input<typeof updateSchema>;

export async function updatePlatformAgent(
  input: UpdatePlatformAgentInput,
): Promise<ActionResult> {
  let appUserId: string;
  try {
    ({ appUserId } = await requireSuperAdmin());
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Forbidden" };
  }

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const { id, ...patch } = parsed.data;

  const db = requireDb();

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.displayName !== undefined) updates.displayName = patch.displayName;
  if (patch.description !== undefined) updates.description = patch.description;
  if (patch.scope !== undefined) updates.scope = patch.scope;
  if (patch.provider !== undefined) updates.provider = patch.provider;
  if (patch.model !== undefined) updates.model = patch.model;
  if (patch.systemPrompt !== undefined) updates.systemPrompt = patch.systemPrompt;
  if (patch.temperature !== undefined)
    updates.temperature = patch.temperature.toFixed(2);
  if (patch.maxTokens !== undefined) updates.maxTokens = patch.maxTokens;
  if (patch.budgetMonthlyUsdMinor !== undefined)
    updates.budgetMonthlyUsdMinor = patch.budgetMonthlyUsdMinor;
  if (patch.isActive !== undefined) updates.isActive = patch.isActive;

  try {
    await db
      .update(platformAgentConfigs)
      .set(updates)
      .where(eq(platformAgentConfigs.id, id));
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message.slice(0, 300) : String(err),
    };
  }

  await recordAuditEvent({
    actorUserId: appUserId,
    action: "platform.agent.updated",
    entityType: "platform_agent_config",
    entityId: id,
    metadata: { fields: Object.keys(patch) },
  }).catch(() => null);

  revalidatePath("/platform/agents");
  revalidatePath(`/platform/agents/${id}`);
  return { ok: true };
}

// -----------------------------------------------------------------------------
// SOFT DELETE (is_active=false). Hard delete only on operator request.
// -----------------------------------------------------------------------------

export async function deletePlatformAgent(
  id: string,
): Promise<ActionResult> {
  let appUserId: string;
  try {
    ({ appUserId } = await requireSuperAdmin());
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Forbidden" };
  }
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid agent id." };
  }

  const db = requireDb();
  await db
    .update(platformAgentConfigs)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(platformAgentConfigs.id, id));

  await recordAuditEvent({
    actorUserId: appUserId,
    action: "platform.agent.deleted",
    entityType: "platform_agent_config",
    entityId: id,
  }).catch(() => null);

  revalidatePath("/platform/agents");
  return { ok: true };
}

// -----------------------------------------------------------------------------
// API KEY rotation / removal
// -----------------------------------------------------------------------------

export async function rotateAgentApiKeyAction(
  id: string,
  newKey: string,
): Promise<ActionResult<{ fingerprint: string }>> {
  let appUserId: string;
  try {
    ({ appUserId } = await requireSuperAdmin());
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Forbidden" };
  }
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid agent id." };
  }
  if (!newKey || newKey.trim().length === 0) {
    return { ok: false, error: "API key cannot be empty." };
  }

  const db = requireDb();
  const [agent] = await db
    .select({
      id: platformAgentConfigs.id,
      provider: platformAgentConfigs.provider,
      agentCode: platformAgentConfigs.agentCode,
    })
    .from(platformAgentConfigs)
    .where(eq(platformAgentConfigs.id, id))
    .limit(1);
  if (!agent) return { ok: false, error: "Agent not found." };

  const stored = await storeAgentApiKey(
    id,
    newKey,
    `${agent.provider} key for agent ${agent.agentCode}`,
  );
  if (!stored.ok) {
    return { ok: false, error: stored.error ?? "Vault store failed." };
  }
  await db
    .update(platformAgentConfigs)
    .set({ vaultSecretName: stored.vaultSecretName, updatedAt: new Date() })
    .where(eq(platformAgentConfigs.id, id));

  await recordAuditEvent({
    actorUserId: appUserId,
    action: "platform.agent.api_key.rotated",
    entityType: "platform_agent_config",
    entityId: id,
    metadata: vaultAuditMetadata({
      agentId: id,
      fingerprint: stored.fingerprint,
      provider: agent.provider,
    }),
  }).catch(() => null);

  revalidatePath(`/platform/agents/${id}`);
  return { ok: true, data: { fingerprint: stored.fingerprint ?? keyFingerprint(newKey) } };
}

export async function removeAgentApiKeyAction(
  id: string,
): Promise<ActionResult> {
  let appUserId: string;
  try {
    ({ appUserId } = await requireSuperAdmin());
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Forbidden" };
  }
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid agent id." };
  }

  const db = requireDb();
  const result = await deleteAgentApiKey(id);
  if (!result.ok) {
    return { ok: false, error: result.error ?? "Vault delete failed." };
  }
  await db
    .update(platformAgentConfigs)
    .set({ vaultSecretName: null, updatedAt: new Date() })
    .where(eq(platformAgentConfigs.id, id));

  await recordAuditEvent({
    actorUserId: appUserId,
    action: "platform.agent.api_key.removed",
    entityType: "platform_agent_config",
    entityId: id,
    metadata: { removed_secret: result.removed },
  }).catch(() => null);

  revalidatePath(`/platform/agents/${id}`);
  return { ok: true };
}

// -----------------------------------------------------------------------------
// SUBSCRIPTIONS (per-org enable/disable)
// -----------------------------------------------------------------------------

export async function toggleOrgAgentSubscription(input: {
  agentId: string;
  organizationId: string;
  isEnabled: boolean;
}): Promise<ActionResult> {
  let appUserId: string;
  try {
    ({ appUserId } = await requireSuperAdmin());
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Forbidden" };
  }
  const idsValid =
    z.string().uuid().safeParse(input.agentId).success &&
    z.string().uuid().safeParse(input.organizationId).success;
  if (!idsValid) return { ok: false, error: "Invalid agent or org id." };

  const db = requireDb();

  // Upsert: row may exist (was previously enabled and now toggled off, or
  // vice versa). The unique constraint (org_id, agent_id) lets us key on
  // the pair.
  await db.execute(sql`
    INSERT INTO org_agent_subscriptions (
      organization_id, agent_id, is_enabled, enabled_at
    ) VALUES (
      ${input.organizationId}::uuid, ${input.agentId}::uuid,
      ${input.isEnabled}, now()
    )
    ON CONFLICT (organization_id, agent_id)
    DO UPDATE SET is_enabled = EXCLUDED.is_enabled,
                  updated_at = now()
  `);

  await recordAuditEvent({
    actorUserId: appUserId,
    action: "platform.agent.subscription.toggled",
    entityType: "platform_agent_config",
    entityId: input.agentId,
    metadata: {
      organization_id: input.organizationId,
      is_enabled: String(input.isEnabled),
    },
  }).catch(() => null);

  revalidatePath(`/platform/agents/${input.agentId}`);
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Wrappers for form action() — accept FormData, return via redirect or stay
// -----------------------------------------------------------------------------

export async function createPlatformAgentFromForm(
  formData: FormData,
): Promise<void> {
  const input: CreatePlatformAgentInput = {
    agentCode: String(formData.get("agentCode") ?? "").trim(),
    displayName: String(formData.get("displayName") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    scope: (String(formData.get("scope") ?? "global") as "global" | "organization"),
    provider: String(formData.get("provider") ?? "openai") as
      | "openai"
      | "anthropic"
      | "google",
    model: String(formData.get("model") ?? "").trim(),
    systemPrompt: String(formData.get("systemPrompt") ?? "") || null,
    apiKey: String(formData.get("apiKey") ?? "").trim() || null,
    temperature: Number(formData.get("temperature") ?? 0.7),
    maxTokens: Number(formData.get("maxTokens") ?? 2000),
    budgetMonthlyUsdMinor:
      Math.round(Number(formData.get("budgetMonthlyUsd") ?? 50) * 100),
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
  };

  const result = await createPlatformAgent(input);
  if (!result.ok) {
    redirect(
      `/platform/agents/new?error=${encodeURIComponent(result.error ?? "Unknown error")}`,
    );
  }
  redirect(`/platform/agents/${result.data?.id}`);
}

export async function updatePlatformAgentFromForm(
  formData: FormData,
): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const input: UpdatePlatformAgentInput = {
    id,
    displayName: String(formData.get("displayName") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    scope: String(formData.get("scope") ?? "global") as "global" | "organization",
    provider: String(formData.get("provider") ?? "openai") as
      | "openai"
      | "anthropic"
      | "google",
    model: String(formData.get("model") ?? "").trim(),
    systemPrompt: String(formData.get("systemPrompt") ?? "") || null,
    temperature: Number(formData.get("temperature") ?? 0.7),
    maxTokens: Number(formData.get("maxTokens") ?? 2000),
    budgetMonthlyUsdMinor:
      Math.round(Number(formData.get("budgetMonthlyUsd") ?? 50) * 100),
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
  };

  const result = await updatePlatformAgent(input);
  if (!result.ok) {
    redirect(
      `/platform/agents/${id}?error=${encodeURIComponent(result.error ?? "Unknown error")}`,
    );
  }
  redirect(`/platform/agents/${id}?saved=1`);
}

export async function rotateAgentApiKeyFromForm(
  formData: FormData,
): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const newKey = String(formData.get("apiKey") ?? "");
  const result = await rotateAgentApiKeyAction(id, newKey);
  if (!result.ok) {
    redirect(
      `/platform/agents/${id}?key_error=${encodeURIComponent(result.error ?? "Unknown error")}`,
    );
  }
  redirect(`/platform/agents/${id}?key_rotated=1`);
}

export async function removeAgentApiKeyFromForm(
  formData: FormData,
): Promise<void> {
  const id = String(formData.get("id") ?? "");
  await removeAgentApiKeyAction(id);
  redirect(`/platform/agents/${id}?key_removed=1`);
}

export async function deletePlatformAgentFromForm(
  formData: FormData,
): Promise<void> {
  const id = String(formData.get("id") ?? "");
  await deletePlatformAgent(id);
  redirect(`/platform/agents`);
}

export async function toggleSubscriptionFromForm(
  formData: FormData,
): Promise<void> {
  const agentId = String(formData.get("agentId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  const isEnabled = String(formData.get("isEnabled") ?? "true") === "true";
  await toggleOrgAgentSubscription({ agentId, organizationId, isEnabled });
  redirect(`/platform/agents/${agentId}?sub=${isEnabled ? "on" : "off"}`);
}
