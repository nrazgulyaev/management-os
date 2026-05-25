import "server-only";

/**
 * P5.2 AGENT-VAULT — encrypted-at-rest API key storage for platform AI agents.
 *
 * Wraps Supabase Vault (`vault.secrets` + `vault.decrypted_secrets` view)
 * so super_admin code can store provider API keys without ever putting
 * the plaintext in the application database or the JS bundle. The key
 * itself is encrypted at rest by Vault via libsodium; the decrypted view
 * is only readable by the service role.
 *
 * Naming convention: each platform_agent_configs row owns one secret
 * named `agent_${agent_id}_api_key`. The `vault_secret_name` column on
 * platform_agent_configs stores that name; the raw key never appears in
 * either table or in audit logs (we log only the last-4 fingerprint).
 *
 * Server-only. Importing from a client component throws at build time
 * via the `server-only` package.
 */

import { sql } from "drizzle-orm";
import { requireDb, rowsOf } from "@/lib/db/client";

/** Convention: each agent owns a single secret keyed by its id. */
export function vaultSecretNameFor(agentId: string): string {
  return `agent_${agentId}_api_key`;
}

/**
 * Returns the last 4 chars of a key for audit-log fingerprinting.
 * We log fingerprints, never full keys.
 */
export function keyFingerprint(apiKey: string): string {
  return apiKey.length >= 4 ? `…${apiKey.slice(-4)}` : "…";
}

export interface StoreKeyResult {
  ok: boolean;
  vaultSecretName?: string;
  fingerprint?: string;
  error?: string;
}

/**
 * Stores or rotates an API key for an agent. If a secret with this name
 * already exists, it is updated in place (Vault's `vault.update_secret`).
 * Otherwise a fresh secret is created via `vault.create_secret`.
 *
 * Returns the `vault_secret_name` to persist on platform_agent_configs
 * plus the fingerprint to record in the audit log.
 */
export async function storeAgentApiKey(
  agentId: string,
  apiKey: string,
  description?: string,
): Promise<StoreKeyResult> {
  if (!apiKey || apiKey.trim().length === 0) {
    return { ok: false, error: "API key cannot be empty." };
  }
  const db = requireDb();
  const secretName = vaultSecretNameFor(agentId);
  const desc = description ?? `Arconique platform agent ${agentId}`;

  try {
    // Check existence — Vault doesn't have an upsert helper.
    const existing = await db.execute<{ id: string }>(sql`
      SELECT id::text AS id FROM vault.secrets WHERE name = ${secretName} LIMIT 1
    `);
    // SHAPE-FIX-1: rowsOf() handles postgres-js's Array return shape.
    const rows = rowsOf<{ id: string }>(existing);

    if (rows.length > 0) {
      await db.execute(sql`
        SELECT vault.update_secret(
          ${rows[0].id}::uuid,
          ${apiKey},
          ${secretName},
          ${desc}
        )
      `);
    } else {
      await db.execute(sql`
        SELECT vault.create_secret(${apiKey}, ${secretName}, ${desc})
      `);
    }

    return {
      ok: true,
      vaultSecretName: secretName,
      fingerprint: keyFingerprint(apiKey),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/**
 * Retrieves the plaintext API key for an agent. SERVER-SIDE ONLY.
 * Caller is responsible for making sure this is called inside a server
 * action / API route — never in a Client Component.
 *
 * Returns null if no secret exists or if the read fails (caller should
 * fall back to env vars in that case).
 */
export async function retrieveAgentApiKey(
  agentId: string,
): Promise<string | null> {
  const db = requireDb();
  const secretName = vaultSecretNameFor(agentId);

  try {
    const result = await db.execute<{ decrypted_secret: string }>(sql`
      SELECT decrypted_secret
        FROM vault.decrypted_secrets
       WHERE name = ${secretName}
       LIMIT 1
    `);
    // SHAPE-FIX-1: rowsOf() handles postgres-js's Array return shape.
    return rowsOf<{ decrypted_secret: string }>(result)[0]?.decrypted_secret ?? null;
  } catch {
    return null;
  }
}

export interface DeleteKeyResult {
  ok: boolean;
  removed: boolean;
  error?: string;
}

/**
 * Deletes the API key secret for an agent. Idempotent — returns
 * `removed: false` if no secret existed in the first place.
 */
export async function deleteAgentApiKey(
  agentId: string,
): Promise<DeleteKeyResult> {
  const db = requireDb();
  const secretName = vaultSecretNameFor(agentId);

  try {
    const result = await db.execute<{ id: string }>(sql`
      DELETE FROM vault.secrets
       WHERE name = ${secretName}
       RETURNING id::text AS id
    `);
    // SHAPE-FIX-1: rowsOf() handles postgres-js's Array return shape.
    const rows = rowsOf<{ id: string }>(result);
    return { ok: true, removed: rows.length > 0 };
  } catch (err) {
    return {
      ok: false,
      removed: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Tiny audit-log builder that callers can hand to recordAuditEvent —
 * keeps the convention "log fingerprint, never the full key" in one
 * place. Use the returned object as the `metadata` argument.
 */
export function vaultAuditMetadata(input: {
  agentId: string;
  fingerprint?: string;
  provider?: string;
}): Record<string, string> {
  return {
    agent_id: input.agentId,
    fingerprint: input.fingerprint ?? "—",
    provider: input.provider ?? "—",
  };
}
