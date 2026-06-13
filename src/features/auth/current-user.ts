import "server-only";

import { cache } from "react";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { appUsers } from "@/lib/db/schema/identity";
import { getCurrentAuthUser } from "@/lib/supabase/server";

export interface CurrentUser {
  id: string;
  authUserId: string;
  email: string;
  fullName: string;
  status: string;
  /**
   * STAB-4 — the current user's organization. Required for multi-tenant
   * server actions (team invites, etc.) that previously hardcoded
   * `ARCONIQUE_DEFAULT` and would have leaked across tenants.
   */
  organizationId: string;
}

/**
 * Resolves the Supabase auth user → app_users row. Returns null when no
 * session, no Supabase config, or no app_users record yet.
 *
 * PERF: React `cache()` dedups the app_users lookup across the many callers in
 * a single render (layout guard, products-access, dashboard shell, page body
 * all call this). Request-scoped — no cross-request staleness.
 */
export const getCurrentAppUser = cache(
  async (): Promise<CurrentUser | null> => {
    const auth = await getCurrentAuthUser();
    if (!auth) return null;
    const db = getDb();
    if (!db) return null;

    const [u] = await db
      .select()
      .from(appUsers)
      .where(eq(appUsers.authUserId, auth.id))
      .limit(1);

    if (!u) return null;
    return {
      id: u.id,
      authUserId: u.authUserId!,
      email: u.email,
      fullName: u.fullName,
      status: u.status,
      organizationId: u.organizationId,
    };
  },
);
