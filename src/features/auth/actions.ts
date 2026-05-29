"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
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

// ============================================================================
// Password recovery (forgot / reset)
// ============================================================================

const forgotSchema = z.object({ email: z.string().email() });

/** Resolve the public origin of the current request so the recovery
 *  email links back to the same host the user is signing in from
 *  (works across the management/development/subscription subdomains). */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "arconique.com";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https");
  return `${proto}://${host}`;
}

/**
 * Forgot-password step 1 — email the user a recovery link.
 *
 * Always returns `{ ok: true }` on a well-formed email even if no account
 * matches, to avoid leaking which addresses are registered (enumeration).
 * The link lands on `/auth/confirm`, which exchanges the recovery
 * token/code for a session and then forwards to `/reset-password`.
 */
export async function requestPasswordResetAction(
  _prev: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  const parsed = forgotSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const supabase = await getSupabaseServer();
  if (!supabase) {
    return {
      ok: false,
      error:
        "Supabase auth is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to the environment.",
    };
  }

  const origin = await requestOrigin();
  // The recovery email's redirect target. `/auth/confirm` handles both the
  // PKCE `code` (default Supabase template) and the `token_hash` OTP
  // (cross-device template — see that route's header for the email-template
  // snippet) before forwarding to `next`.
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/confirm?next=/reset-password`,
  });

  // Generic success regardless of whether the address exists.
  return { ok: true };
}

const resetSchema = z
  .object({
    password: z.string().min(12, "Password must be at least 12 characters."),
    confirmPassword: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Passwords do not match.",
        path: ["confirmPassword"],
      });
    }
  });

/**
 * Forgot-password step 2 — set a new password.
 *
 * Requires the recovery session established by `/auth/confirm`. On success
 * we sign the user out and bounce to `/login?reset=1` so they sign in fresh
 * with the new password (confirms it works and avoids relying on the
 * limited-scope recovery session).
 */
export async function updatePasswordAction(
  _prev: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  const parsed = resetSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Enter a valid new password.",
    };
  }

  const supabase = await getSupabaseServer();
  if (!supabase) {
    return { ok: false, error: "Supabase auth is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error:
        "Your reset link is invalid or has expired. Request a new one from the forgot-password page.",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) return { ok: false, error: error.message };

  await supabase.auth.signOut();
  redirect("/login?reset=1");
}
