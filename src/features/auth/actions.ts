"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  getProductsEnabledForCurrentUser,
  landingPathFor,
} from "@/features/auth/products-access";

export type AuthResult =
  | { ok: true }
  | { ok: false; error: string };

const credSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  /**
   * Sprint 2 — optional product hint stamped by the login page when the
   * request arrives on a product subdomain. Bounds the post-login
   * redirect to a path that's reachable on that subdomain.
   */
  product: z
    .enum(["management", "development", "subscription", "platform"])
    .optional(),
});

/**
 * Sprint 2 — preferred landing path per product subdomain. Returned
 * when the login form carries a product hint, overriding the
 * Stage-10.H products_enabled lookup. Each path is within that
 * subdomain's allowedPrefixes (see src/middleware.ts), so the
 * post-login redirect never bounces off the subdomain gate.
 *
 * Platform is special: the (platform-app) layout enforces super_admin
 * on /platform, so we send everyone there and let the layout reject
 * non-platform users (it will redirect them to /no-product-access).
 */
const PRODUCT_LANDING: Record<
  "management" | "development" | "subscription" | "platform",
  string
> = {
  management: "/dashboard",
  development: "/development-os",
  subscription: "/pricing",
  platform: "/platform",
};

export async function signInAction(
  _prev: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  const parsed = credSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid email and password (min 8 chars)." };
  }

  const supabase = await getSupabaseServer();
  if (!supabase) {
    return {
      ok: false,
      error:
        "Supabase auth is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local, or use a demo quick-link below.",
    };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) return { ok: false, error: error.message };

  // Sprint 2 — when the user signed in on a product subdomain, prefer
  // that product's canonical landing. Otherwise fall back to the
  // Stage-10.H products_enabled-driven landing (single-product orgs go
  // to their product, dual-product orgs to /dashboard, zero-product
  // orgs to /no-product-access).
  let landingPath: string;
  if (parsed.data.product) {
    landingPath = PRODUCT_LANDING[parsed.data.product];
  } else {
    landingPath = "/dashboard";
    try {
      const products = await getProductsEnabledForCurrentUser();
      landingPath = landingPathFor(products);
    } catch {
      // Lookup failure shouldn't block sign-in — fall back to /dashboard
      // and let the layout-level enforceProductAccess() guard sort it out.
    }
  }

  revalidatePath(landingPath);
  redirect(landingPath);
}

export async function signOutAction(): Promise<void> {
  const supabase = await getSupabaseServer();
  if (supabase) {
    await supabase.auth.signOut();
  }
  revalidatePath("/");
  redirect("/login");
}
