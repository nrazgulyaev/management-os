import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { buyers } from "@/lib/db/schema/buyers";
import { getCurrentAuthUser } from "@/lib/supabase/server";

export interface BuyerSession {
  /** auth.users.id */
  authUserId: string;
  /** buyers.id */
  buyerId: string;
  buyerCode: string;
  displayName: string;
  preferredLanguage: string;
  primaryEmail: string | null;
}

/**
 * Resolves the Supabase auth user → buyers. Returns null when:
 *   - no Supabase session
 *   - DB unavailable
 *   - no buyer matches the supabase_user_id
 *   - portal_access_enabled = false
 *
 * Pages should `redirect("/buyer-portal/login")` on null. RLS on every
 * buyer-portal-readable table is the security boundary; this helper only
 * controls UX redirection.
 */
export async function getBuyerSession(): Promise<BuyerSession | null> {
  const auth = await getCurrentAuthUser();
  if (!auth) return null;
  const db = getDb();
  if (!db) return null;
  const [buyer] = await db
    .select()
    .from(buyers)
    .where(eq(buyers.supabaseUserId, auth.id))
    .limit(1);
  if (!buyer || !buyer.portalAccessEnabled) return null;
  return {
    authUserId: auth.id,
    buyerId: buyer.id,
    buyerCode: buyer.buyerCode,
    displayName: buyer.displayName,
    preferredLanguage: buyer.preferredLanguage,
    primaryEmail: buyer.primaryEmail,
  };
}
