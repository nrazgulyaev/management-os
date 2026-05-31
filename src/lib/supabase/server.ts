import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env, isSupabaseAuthConfigured } from "@/lib/env";
import { logger } from "@/lib/observability/logger";

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
          } catch (err) {
            // AUTH-COOKIE-SWALLOW-1: a cookie write here is *expected* to fail
            // during a Server Component render (cookies are immutable in RSC) —
            // sign-in/out flows must run inside a Server Action or Route Handler.
            // We must NOT rethrow (that would break legitimate RSC reads), but we
            // no longer swallow it silently: log so a genuine write failure in a
            // Server Action context is at least visible.
            logger.warn("supabase setAll: cookie write skipped (expected in RSC render)", {
              area: "auth",
              error: err instanceof Error ? err.message : String(err),
            });
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
