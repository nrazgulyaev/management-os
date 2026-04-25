import "server-only";

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
}

/**
 * Resolves the Supabase auth user → app_users row. Returns null when no
 * session, no Supabase config, or no app_users record yet.
 */
export async function getCurrentAppUser(): Promise<CurrentUser | null> {
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
  };
}
