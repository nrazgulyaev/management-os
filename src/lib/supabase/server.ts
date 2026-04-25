import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env, isSupabaseAuthConfigured } from "@/lib/env";

/**
 * Server-side Supabase client bound to the current request's cookies.
 * Returns null when Supabase env is missing — callers should check.
 */
export async function getSupabaseServer(): Promise<SupabaseClient | null> {
  if (!isSupabaseAuthConfigured()) return null;
  const cookieStore = await cookies();
  return createServerClient(
    env.public.NEXT_PUBLIC_SUPABASE_URL!,
    env.public.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components cannot mutate cookies — ignore safely.
            // Sign-in/out flows must run inside a Server Action or Route Handler.
          }
        },
      },
    },
  );
}

/**
 * Returns the current session's user, or null if Supabase is not configured
 * or the visitor is anonymous.
 */
export async function getCurrentAuthUser() {
  const supabase = await getSupabaseServer();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
