/**
 * P116A — Pure helper: resolve the demo owner id when no real grants
 * exist.  Lives in `@/features/demo-data` (no `server-only`) so tests
 * can import it directly without pulling in the DB / Supabase client.
 *
 * The real consumer (`src/features/notifications/services.ts`) imports
 * this and calls it inside `listOwnerIdsForCurrentUser()`.
 */

import { DEMO_OWNER_IDS } from "./demo-ids";

export function demoOwnerIdFallback(env: NodeJS.ProcessEnv = process.env): string[] {
  const isDemoModeFlag =
    env.NEXT_PUBLIC_ENABLE_DEMO_MODE === "1" ||
    env.ARCONIQUE_FORCE_MOCK === "1";
  if (!isDemoModeFlag) return [];
  if (env.NODE_ENV === "production") return [];
  return [DEMO_OWNER_IDS.emma];
}
