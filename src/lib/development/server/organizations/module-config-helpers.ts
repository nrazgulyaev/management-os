/**
 * Stage 5.J.2 — Pure module-enablement helpers.
 *
 * No I/O, no `import "server-only"`. Runtime testable.
 *
 * `enabled_modules` is stored as a JSONB array. The special value
 * `"all_modules"` permits everything (default for the Arconique
 * internal org). An empty list disables everything.
 */

export type ModuleKey =
  | "investor_portal"
  | "buyer_portal"
  | "whatsapp_integration"
  | "ai_agents"
  | "marketing_intelligence"
  | "role_cabinets"
  | "mobile_pwa"
  | "schedule_sophistication"
  | "executive_command_center"
  | "knowledge_base"
  | "public_api"
  | "webhooks";

export const ALL_MODULE_KEYS: ModuleKey[] = [
  "investor_portal",
  "buyer_portal",
  "whatsapp_integration",
  "ai_agents",
  "marketing_intelligence",
  "role_cabinets",
  "mobile_pwa",
  "schedule_sophistication",
  "executive_command_center",
  "knowledge_base",
  "public_api",
  "webhooks",
];

export function isModuleEnabled(
  enabledModules: unknown,
  moduleKey: ModuleKey,
): boolean {
  if (!Array.isArray(enabledModules)) return false;
  if (enabledModules.includes("all_modules")) return true;
  return enabledModules.includes(moduleKey);
}

export function moduleEnabledFlags(
  enabledModules: unknown,
): Record<ModuleKey, boolean> {
  const out = {} as Record<ModuleKey, boolean>;
  for (const k of ALL_MODULE_KEYS) {
    out[k] = isModuleEnabled(enabledModules, k);
  }
  return out;
}
