"use server";

/**
 * Stage 10.5.B — per-agent provider configuration server actions.
 *
 * Three actions in one module (kept separate from
 * agent-config-actions.ts so the older Stage 9.F surfaces stay
 * stable):
 *
 *   setAgentProviderConfigAction  — saves provider + model + (encrypted)
 *                                   API key for one agent within the
 *                                   current org.
 *   testAgentConnectionAction     — instantiates the chosen provider
 *                                   with the supplied API key and runs
 *                                   a minimal completion to validate
 *                                   the credentials before they're saved.
 *   clearAgentApiKeyAction        — wipes the encrypted key + provider
 *                                   override so the agent falls back to
 *                                   the system default.
 *
 * Encryption: AES-256-GCM via the existing `credentials-crypto` helper
 * (Stage 6.P1.B). Same `STAY_LINK_KMS_SECRET` pattern used for
 * channel-manager credentials and Wi-Fi passwords.
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
import { stayLinkKmsSecret } from "@/lib/env";
import {
  encryptCredentials,
  decryptCredentials,
  isEncryptedBlob,
  type EncryptedCredentialsBlob,
} from "@/lib/channel-manager/credentials-crypto";
import {
  CONFIGURABLE_AGENTS,
  type ConfigurableAgentKey,
} from "./agent-config-keys";
import { getAIProviderForCredentials } from "@/lib/ai/providers";

const PROVIDER_NAMES = ["anthropic", "openai", "gemini"] as const;
type ProviderName = (typeof PROVIDER_NAMES)[number];

// ============================================================================
// setAgentProviderConfigAction
// ============================================================================

const setProviderSchema = z.object({
  agentKey: z.enum(CONFIGURABLE_AGENTS),
  provider: z.enum(PROVIDER_NAMES).nullable(),
  model: z.string().trim().max(120).nullable(),
  apiKey: z.string().trim().max(500).nullable(),
});

export type SetAgentProviderConfigResult =
  | { ok: true; agentKey: string; hasKey: boolean; provider: ProviderName | null }
  | { ok: false; error: string };

export async function setAgentProviderConfigAction(
  input: z.input<typeof setProviderSchema>,
): Promise<SetAgentProviderConfigResult> {
  await requirePermission("users.write");
  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not signed in." };

  const parsed = setProviderSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  const { agentKey, provider, model, apiKey } = parsed.data;

  // Provider + key must be coherent: both set, or neither set, or only
  // provider set (key inherited from system env vars).
  if (apiKey !== null && apiKey.length > 0 && provider === null) {
    return {
      ok: false,
      error: "Pick a provider before supplying an API key.",
    };
  }

  // Encrypt the key when present.
  let envelope: EncryptedCredentialsBlob | null = null;
  if (apiKey !== null && apiKey.length > 0) {
    const secret = stayLinkKmsSecret();
    if (!secret) {
      return {
        ok: false,
        error:
          "Encryption secret (STAY_LINK_KMS_SECRET) is not configured. Cannot store the API key safely.",
      };
    }
    try {
      envelope = encryptCredentials(JSON.stringify({ apiKey }), secret);
    } catch (err) {
      return {
        ok: false,
        error: `Failed to encrypt API key: ${err instanceof Error ? err.message : "unknown error"}`,
      };
    }
  }

  let orgId: string;
  try {
    orgId = await requireOrgId();
  } catch {
    return { ok: false, error: "No organization context available." };
  }

  const db = requireDb();
  const now = new Date();
  const trimmedModel =
    model !== null && model.trim().length > 0 ? model.trim() : null;

  await db
    .insert(orgAiAgentConfig)
    .values({
      organizationId: orgId,
      agentKey,
      isEnabled: true,
      provider,
      model: trimmedModel,
      apiKeyEncrypted: envelope as unknown as Record<string, unknown> | null,
      apiKeySetAt: envelope ? now : null,
      // Saving a fresh config invalidates the previous test status —
      // the operator needs to retest.
      lastTestStatus: null,
      lastTestAt: null,
      lastTestError: null,
      updatedBy: me.id,
    })
    .onConflictDoUpdate({
      target: [orgAiAgentConfig.organizationId, orgAiAgentConfig.agentKey],
      set: {
        provider,
        model: trimmedModel,
        // When apiKey is null in the input, leave the existing key in
        // place. Use clearAgentApiKeyAction to wipe.
        ...(envelope
          ? {
              apiKeyEncrypted: envelope as unknown as Record<string, unknown>,
              apiKeySetAt: now,
              lastTestStatus: null,
              lastTestAt: null,
              lastTestError: null,
            }
          : {}),
        updatedBy: me.id,
        updatedAt: now,
      },
    });

  await db.insert(auditEvents).values({
    actorUserId: me.id,
    action: "ai.agent.provider_configured",
    entityType: "org_ai_agent_config",
    entityId: null,
    after: {
      organization_id: orgId,
      agent_key: agentKey,
      provider,
      model: trimmedModel,
      has_key: envelope !== null,
    },
  });

  revalidatePath(`/dashboard/settings/ai-agents/${agentKey}`);
  return {
    ok: true,
    agentKey,
    hasKey: envelope !== null,
    provider,
  };
}

// ============================================================================
// clearAgentApiKeyAction
// ============================================================================

const clearKeySchema = z.object({
  agentKey: z.enum(CONFIGURABLE_AGENTS),
});

export type ClearAgentApiKeyResult =
  | { ok: true; agentKey: string }
  | { ok: false; error: string };

export async function clearAgentApiKeyAction(
  input: z.input<typeof clearKeySchema>,
): Promise<ClearAgentApiKeyResult> {
  await requirePermission("users.write");
  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not signed in." };
  const parsed = clearKeySchema.safeParse(input);
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
  await db
    .update(orgAiAgentConfig)
    .set({
      apiKeyEncrypted: null,
      apiKeySetAt: null,
      lastTestStatus: null,
      lastTestAt: null,
      lastTestError: null,
      updatedBy: me.id,
      updatedAt: now,
    })
    .where(
      and(
        eq(orgAiAgentConfig.organizationId, orgId),
        eq(orgAiAgentConfig.agentKey, parsed.data.agentKey),
      ),
    );

  await db.insert(auditEvents).values({
    actorUserId: me.id,
    action: "ai.agent.api_key_cleared",
    entityType: "org_ai_agent_config",
    entityId: null,
    after: { organization_id: orgId, agent_key: parsed.data.agentKey },
  });

  revalidatePath(`/dashboard/settings/ai-agents/${parsed.data.agentKey}`);
  return { ok: true, agentKey: parsed.data.agentKey };
}

// ============================================================================
// testAgentConnectionAction
// ============================================================================

const testSchema = z.object({
  agentKey: z.enum(CONFIGURABLE_AGENTS),
  provider: z.enum(PROVIDER_NAMES),
  /** Optional: when omitted, we use the previously-saved encrypted key. */
  apiKey: z.string().trim().min(1).max(500).optional(),
  model: z.string().trim().max(120).optional(),
});

export type TestAgentConnectionResult =
  | {
      ok: true;
      provider: ProviderName;
      model: string;
      sampleTokens: number;
    }
  | { ok: false; error: string };

/**
 * Calls the chosen provider with a minimal 1-token completion request.
 * Used to validate operator-supplied credentials BEFORE they're saved
 * (apiKey passed inline) AND to retest already-saved credentials
 * (apiKey omitted; we decrypt and use the stored envelope).
 *
 * On success, persists `last_test_status='ok'` + `last_test_at=now`.
 * On failure, persists `last_test_status='failed'` + redacted error.
 */
export async function testAgentConnectionAction(
  input: z.input<typeof testSchema>,
): Promise<TestAgentConnectionResult> {
  await requirePermission("users.write");
  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not signed in." };

  const parsed = testSchema.safeParse(input);
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

  // Resolve the API key: caller-supplied wins; otherwise decrypt the saved one.
  let apiKey: string | null = parsed.data.apiKey ?? null;
  if (!apiKey) {
    const row = await db
      .select({
        apiKeyEncrypted: orgAiAgentConfig.apiKeyEncrypted,
      })
      .from(orgAiAgentConfig)
      .where(
        and(
          eq(orgAiAgentConfig.organizationId, orgId),
          eq(orgAiAgentConfig.agentKey, parsed.data.agentKey),
        ),
      )
      .limit(1)
      .then((r) => r[0]);
    if (row?.apiKeyEncrypted && isEncryptedBlob(row.apiKeyEncrypted)) {
      const secret = stayLinkKmsSecret();
      if (!secret) {
        return {
          ok: false,
          error: "Encryption secret is not configured.",
        };
      }
      try {
        const plaintextJson = decryptCredentials(
          row.apiKeyEncrypted as EncryptedCredentialsBlob,
          secret,
        );
        const parsedPlain = JSON.parse(plaintextJson) as { apiKey?: string };
        apiKey = parsedPlain.apiKey ?? null;
      } catch {
        return {
          ok: false,
          error: "Stored API key could not be decrypted.",
        };
      }
    }
  }
  if (!apiKey) {
    return {
      ok: false,
      error: "No API key supplied or saved for this agent.",
    };
  }

  const provider = getAIProviderForCredentials({
    provider: parsed.data.provider,
    apiKey,
    model: parsed.data.model,
  });
  if (!provider) {
    return { ok: false, error: "Failed to construct provider with supplied credentials." };
  }

  const now = new Date();
  let resultRow: TestAgentConnectionResult;
  try {
    const completion = await provider.complete({
      messages: [{ role: "user", content: "ok" }],
      maxTokens: 4,
      temperature: 0,
      timeoutMs: 15_000,
    });
    resultRow = {
      ok: true,
      provider: parsed.data.provider,
      model: completion.model,
      sampleTokens: completion.usage.totalTokens,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message.slice(0, 500) : "Unknown error.";
    resultRow = { ok: false, error: redactSecrets(message, apiKey) };
  }

  // Persist test result. Upsert in case there was no prior config row
  // (caller could test before saving).
  await db
    .insert(orgAiAgentConfig)
    .values({
      organizationId: orgId,
      agentKey: parsed.data.agentKey,
      isEnabled: true,
      provider: parsed.data.provider,
      model: parsed.data.model ?? null,
      lastTestStatus: resultRow.ok ? "ok" : "failed",
      lastTestAt: now,
      lastTestError: resultRow.ok ? null : resultRow.error,
      updatedBy: me.id,
    })
    .onConflictDoUpdate({
      target: [orgAiAgentConfig.organizationId, orgAiAgentConfig.agentKey],
      set: {
        lastTestStatus: resultRow.ok ? "ok" : "failed",
        lastTestAt: now,
        lastTestError: resultRow.ok ? null : resultRow.error,
        updatedBy: me.id,
        updatedAt: now,
      },
    });

  await db.insert(auditEvents).values({
    actorUserId: me.id,
    action: resultRow.ok
      ? "ai.agent.test_connection_ok"
      : "ai.agent.test_connection_failed",
    entityType: "org_ai_agent_config",
    entityId: null,
    after: {
      organization_id: orgId,
      agent_key: parsed.data.agentKey,
      provider: parsed.data.provider,
    },
  });

  revalidatePath(`/dashboard/settings/ai-agents/${parsed.data.agentKey}`);
  return resultRow;
}

/**
 * Defensive: if a provider error message accidentally echoes the API
 * key (some providers do this), strip it before persisting / surfacing.
 */
function redactSecrets(message: string, apiKey: string): string {
  if (apiKey.length === 0) return message;
  return message.split(apiKey).join("<redacted>");
}
