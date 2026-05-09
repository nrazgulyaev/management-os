import "server-only";

/**
 * Stage 10.5.B.4 — per-org agent runtime configuration loader.
 *
 * Decrypts the per-org per-agent API key (when set) + returns the
 * resolved provider/model triple. Designed for the agent runner to
 * call at invocation time, but also used by the test-connection
 * action to retest already-saved credentials.
 *
 * Returns:
 *   { isEnabled, provider, model, apiKey } — apiKey is plaintext,
 *   present only when the org has an encrypted key on file.
 *
 * Falls back gracefully:
 *   - No row     → { isEnabled: true, provider: null, model: null, apiKey: null }
 *   - Disabled   → { isEnabled: false, ... }
 *   - Bad cipher → logs nothing sensitive; returns { isEnabled, provider, model, apiKey: null }
 *
 * Agent-runner integration is a deliberate carry-over — the runner
 * today reads the global agent_configurations.preferred_provider
 * (Stage 6.P6). Wiring it to call this helper instead is a small
 * refactor that ships in a follow-up sub-phase to keep 10.5.B's
 * scope tight.
 */

import { and, eq } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import { orgAiAgentConfig } from "@/lib/db/schema/org-ai-agent-config";
import { stayLinkKmsSecret } from "@/lib/env";
import {
  decryptCredentials,
  isEncryptedBlob,
  type EncryptedCredentialsBlob,
} from "@/lib/channel-manager/credentials-crypto";

export type OrgAgentProvider = "anthropic" | "openai" | "gemini";

export interface OrgAgentRuntimeConfig {
  isEnabled: boolean;
  provider: OrgAgentProvider | null;
  model: string | null;
  /** Decrypted plaintext key. Null when no per-org override. */
  apiKey: string | null;
  /** True when an encrypted blob existed but couldn't be decrypted. */
  apiKeyDecryptError: boolean;
}

const DEFAULT_CONFIG: OrgAgentRuntimeConfig = {
  isEnabled: true,
  provider: null,
  model: null,
  apiKey: null,
  apiKeyDecryptError: false,
};

function isProvider(v: unknown): v is OrgAgentProvider {
  return v === "anthropic" || v === "openai" || v === "gemini";
}

export async function loadOrgAgentRuntimeConfig(
  organizationId: string,
  agentKey: string,
): Promise<OrgAgentRuntimeConfig> {
  const db = requireDb();
  const row = await db
    .select({
      isEnabled: orgAiAgentConfig.isEnabled,
      provider: orgAiAgentConfig.provider,
      model: orgAiAgentConfig.model,
      apiKeyEncrypted: orgAiAgentConfig.apiKeyEncrypted,
    })
    .from(orgAiAgentConfig)
    .where(
      and(
        eq(orgAiAgentConfig.organizationId, organizationId),
        eq(orgAiAgentConfig.agentKey, agentKey),
      ),
    )
    .limit(1)
    .then((r) => r[0]);

  if (!row) return DEFAULT_CONFIG;

  let apiKey: string | null = null;
  let decryptError = false;
  if (row.apiKeyEncrypted && isEncryptedBlob(row.apiKeyEncrypted)) {
    const secret = stayLinkKmsSecret();
    if (secret) {
      try {
        const plaintextJson = decryptCredentials(
          row.apiKeyEncrypted as EncryptedCredentialsBlob,
          secret,
        );
        const parsed = JSON.parse(plaintextJson) as { apiKey?: string };
        apiKey = typeof parsed.apiKey === "string" ? parsed.apiKey : null;
      } catch {
        decryptError = true;
      }
    } else {
      decryptError = true;
    }
  }

  return {
    isEnabled: row.isEnabled,
    provider: isProvider(row.provider) ? row.provider : null,
    model: row.model,
    apiKey,
    apiKeyDecryptError: decryptError,
  };
}
