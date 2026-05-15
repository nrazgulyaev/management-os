import "server-only";

import { loadOrgAgentRuntimeConfig } from "./agent-runtime-config";

/**
 * Sprint MD-5 — Boolean "is this agent fully wired for this org"
 * helper used by cabinet apexes to flip between the
 * "Coming soon · Configure key" empty-state card and the live
 * inline 3-card grid (or the live AI prompt input on the
 * investor portal).
 *
 * "Enabled" means the org has an `org_ai_agent_config` row that:
 *   - is marked enabled (`is_enabled = true`), AND
 *   - carries a decryptable API key (so a real provider call can
 *     happen)
 *
 * Returns false defensively when there's no row, no key, or the
 * cipher couldn't be unsealed.
 */
export async function isAgentEnabledForOrg(
  organizationId: string,
  agentKey: string,
): Promise<boolean> {
  if (!organizationId) return false;
  const config = await loadOrgAgentRuntimeConfig(
    organizationId,
    agentKey,
  );
  return config.isEnabled && config.apiKey !== null;
}
