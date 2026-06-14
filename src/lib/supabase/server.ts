import "server-only";

import { cache } from "react";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env, isSupabaseAuthConfigured } from "@/lib/env";

/**
 * Sprint ARCH-1 — cross-subdomain SSO.
 *
 * In production we set the auth cookie's `Domain` to `.arconique.com`
 * (leading dot) so a single sign-in flow on management.arconique.com is
 * also valid on development.arconique.com, subscription.arconique.com,
 * and platform.arconique.com. Without this, each subdomain forks its own
 * session and signing in once doesn't grant access to sibling products.
 *
 * Gated on VERCEL_ENV === "production" — Vercel preview deploys set
 * VERCEL_ENV="preview" + NODE_ENV="production", so checking NODE_ENV
 * alone would wrongly scope preview cookies to `.arconique.com` even
 * though previews live on `*.vercel.app`. Localhost and previews fall
 * through to the default host-scoped behaviour.
 */
function shouldUseRootDomain(): boolean {
  return process.env.VERCEL_ENV === "production";
}

function adjustCookieOptions(options: CookieOptions): CookieOptions {
  if (!shouldUseRootDomain()) return options;
  return {
    ...options,
    domain: ".arconique.com",
    secure: true,
    sameSite: options.sameSite ?? "lax",
  };
}

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
              cookieStore.set(name, value, adjustCookieOptions(options));
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
 *
 * PERF: wrapped in React `cache()` so the underlying `supabase.auth.getUser()`
 * network round-trip to Supabase Auth runs at most ONCE per request render,
 * even though the layout guard, products-access, the dashboard shell and the
 * page body each resolve the user. Previously this fired 2–4× per page render
 * — pure latency on every navigation. `cache()` dedup is request-scoped only
 * (no cross-request staleness).
 */
export const getCurrentAuthUser = cache(async () => {
  const supabase = await getSupabaseServer();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
