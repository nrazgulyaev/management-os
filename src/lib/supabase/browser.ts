"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env, isSupabaseAuthConfigured } from "@/lib/env";

let cached: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient | null {
  if (!isSupabaseAuthConfigured()) return null;
  if (cached) return cached;
  cached = createBrowserClient(
    env.public.NEXT_PUBLIC_SUPABASE_URL!,
    env.public.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return cached;
}
