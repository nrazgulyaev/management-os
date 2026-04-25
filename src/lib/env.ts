import { z } from "zod";

/**
 * Server-only env. Lazily validated so missing values do not crash the
 * marketing/demo surfaces — instead, callers ask `isDbConfigured()` etc.
 * and we render mock fallbacks when the backend isn't wired.
 */

const serverSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  DIRECT_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  ARCONIQUE_FORCE_MOCK: z.string().optional(),
  ADMIN_BOOTSTRAP_SECRET: z.string().min(16).optional(),
});

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20).optional(),
  NEXT_PUBLIC_ENABLE_DEMO_MODE: z.string().optional(),
});

const parsedServer = serverSchema.safeParse({
  DATABASE_URL: process.env.DATABASE_URL,
  DIRECT_URL: process.env.DIRECT_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  ARCONIQUE_FORCE_MOCK: process.env.ARCONIQUE_FORCE_MOCK,
  ADMIN_BOOTSTRAP_SECRET: process.env.ADMIN_BOOTSTRAP_SECRET,
});

const parsedPublic = publicSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_ENABLE_DEMO_MODE: process.env.NEXT_PUBLIC_ENABLE_DEMO_MODE,
});

export const env = {
  server: parsedServer.success ? parsedServer.data : ({} as z.infer<typeof serverSchema>),
  public: parsedPublic.success ? parsedPublic.data : ({} as z.infer<typeof publicSchema>),
};

export function forceMock(): boolean {
  return env.server.ARCONIQUE_FORCE_MOCK === "1";
}

export function isDbConfigured(): boolean {
  return !forceMock() && Boolean(env.server.DATABASE_URL);
}

export function isSupabaseAuthConfigured(): boolean {
  return Boolean(
    env.public.NEXT_PUBLIC_SUPABASE_URL && env.public.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function isSupabaseAdminConfigured(): boolean {
  return Boolean(
    env.public.NEXT_PUBLIC_SUPABASE_URL && env.server.SUPABASE_SERVICE_ROLE_KEY
  );
}

export function isDemoMode(): boolean {
  return env.public.NEXT_PUBLIC_ENABLE_DEMO_MODE === "1";
}
