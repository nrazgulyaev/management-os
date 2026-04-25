import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, isSupabaseAdminConfigured } from "@/lib/env";

let cached: SupabaseClient | null = null;

/**
 * Service-role Supabase client. Bypasses RLS — use sparingly and only
 * inside background jobs / migrations / privileged server actions.
 * Never import this from client components.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (!isSupabaseAdminConfigured()) return null;
  if (cached) return cached;
  cached = createClient(
    env.public.NEXT_PUBLIC_SUPABASE_URL!,
    env.server.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  return cached;
}
