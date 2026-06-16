"use server";

import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client";
import { organizations } from "@/lib/db/schema/saas";
import { appUsers } from "@/lib/db/schema/identity";
import { appUserRoles } from "@/lib/db/schema/role-cabinets";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { type ProductSlug } from "@/lib/products";
import {
  computeTrialEndsAt,
  TRIAL_DURATION_DAYS_DEFAULT,
} from "@/features/billing/trial-state";
import { landingPathFor } from "@/features/auth/products-access-pure";
import { sendEmail, welcomeEmailTemplate } from "@/features/email";
import { recordSecurityEvent } from "@/features/security-baseline/security-events";

/**
 * Stage 10.I.5 — Public signup flow.
 *
 * - Validates inputs (Zod).
 * - Provisions Supabase auth user via the service-role admin client
 *   (so email_confirm=true; no email-verify round trip in 10.I).
 * - Creates the organization with trial state set
 *   (trial_started_at = now, trial_ends_at = now + 14 days).
 * - Creates app_users row + assigns super_admin role via the
 *   `assign_user_role` SECURITY DEFINER helper (Stage 9.0 pattern).
 * - Signs the user in (sets the session cookie).
 * - Sends a welcome email via the no-op `sendEmail` stub
 *   (Stage 10.G; Stage 10.L wires Resend).
 * - Records a `signup_completed` security event.
 * - Returns the landing URL via `landingPathFor()` (Stage 10.H).
 *
 * Stripe + email verification + multi-step onboarding all defer to
 * Stage 10.L / Stage 11.
 */

export type SignupResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const PRODUCT_INPUTS = ["mgmt", "dev", "both"] as const;

const signupSchema = z
  .object({
    email: z.string().email("Enter a valid email address."),
    organizationName: z
      .string()
      .min(2, "Organization name must be at least 2 characters."),
    product: z.enum(PRODUCT_INPUTS, {
      errorMap: () => ({ message: "Pick one product (or both)." }),
    }),
    password: z
      .string()
      .min(12, "Password must be at least 12 characters."),
    confirmPassword: z.string(),
    terms: z.string().refine((v) => v === "on" || v === "true", {
      message: "Please accept the terms to continue.",
    }),
    // Honeypot field — anti-bot. Bots fill every field; humans never see this.
    company: z.string().optional(),
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

function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .slice(0, 32);
}

/** Generate a unique organization_code from the org name. Falls back to
 *  a timestamp suffix if collision. */
async function generateOrgCode(name: string): Promise<string> {
  const db = getDb();
  if (!db) return `${slugify(name)}-${Date.now()}`;
  const base = slugify(name) || "workspace";
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const [existing] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.organizationCode, candidate))
      .limit(1);
    if (!existing) return candidate;
  }
  return `${base}-${Date.now()}`;
}

function productInputToSlugs(value: (typeof PRODUCT_INPUTS)[number]): ProductSlug[] {
  if (value === "both") return ["mgmt", "dev"];
  return [value];
}

export async function signupAction(
  _prev: SignupResult | null,
  formData: FormData,
): Promise<SignupResult> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]?.toString() ?? "_";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return {
      ok: false,
      error: "Please fix the form and resubmit.",
      fieldErrors,
    };
  }
  const data = parsed.data;

  // Honeypot — bots fill `company`; legitimate users never see the field.
  if (data.company && data.company.trim().length > 0) {
    return { ok: false, error: "Submission rejected." };
  }

  const db = getDb();
  if (!db) {
    return {
      ok: false,
      error: "Database is not configured in this environment.",
    };
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return {
      ok: false,
      error:
        "Auth service-role key is not configured. Set SUPABASE_SERVICE_ROLE_KEY in the environment.",
    };
  }

  // 1) Reject if email already in use (in app_users).
  const emailLower = data.email.toLowerCase();
  const [existing] = await db
    .select({ id: appUsers.id })
    .from(appUsers)
    .where(eq(appUsers.email, emailLower))
    .limit(1);
  if (existing) {
    return {
      ok: false,
      error: "An account with this email already exists.",
      fieldErrors: { email: "Already registered. Try signing in instead." },
    };
  }

  // 2) Create the Supabase auth user (email auto-confirmed; 10.L will
  //    add a verify-email step if desired).
  const created = await admin.auth.admin.createUser({
    email: emailLower,
    password: data.password,
    email_confirm: true,
    user_metadata: {
      full_name: data.organizationName,
      signup_product: data.product,
    },
  });
  if (created.error || !created.data.user) {
    return {
      ok: false,
      error: created.error?.message ?? "Could not create your account.",
    };
  }
  const authUserId = created.data.user.id;

  // 3) Create the organization with trial state set.
  const now = new Date();
  const orgCode = await generateOrgCode(data.organizationName);
  const products = productInputToSlugs(data.product);
  const trialEndsAt = computeTrialEndsAt(now, TRIAL_DURATION_DAYS_DEFAULT);

  const [createdOrg] = await db
    .insert(organizations)
    .values({
      organizationCode: orgCode,
      name: data.organizationName,
      organizationType: "developer_client",
      productsEnabled: products,
      trialStartedAt: now,
      trialEndsAt,
      trialStatus: "active",
    })
    .returning({ id: organizations.id });

  // 4) Provision app_users row.
  const [appUser] = await db
    .insert(appUsers)
    .values({
      authUserId,
      email: emailLower,
      fullName: data.organizationName,
      organizationId: createdOrg.id,
      status: "active",
    })
    .returning({ id: appUsers.id });

  // 5) Assign super_admin role via the SECURITY DEFINER helper (handles
  //    RLS bootstrap + UNIQUE NULLS NOT DISTINCT).
  await db.execute(
    sql`SELECT public.assign_user_role(${appUser.id}::uuid, ${"super_admin"}::text, NULL::text, NULL::uuid)`,
  );

  // 5b) CABINET ACCESS — assign_user_role only writes `user_roles` (the RLS
  //     bypass flag). Cabinet routing (Stage 5.F) reads `app_user_roles`; a
  //     user with no app_user_roles row lands without a cabinet. The
  //     canonical onboarding path (provision_app_user, migration 0087) grants
  //     BOTH — internal 'super_admin' AND cabinet 'admin'. signupAction did
  //     its own app_users insert + assign_user_role and so never created the
  //     cabinet grant. Mirror provision_app_user's idempotent company_wide
  //     'admin' grant here so a freshly-provisioned tenant admin has cabinet
  //     access. Idempotent via the same NOT-EXISTS guard provision_app_user
  //     uses (a fresh signup never has a row, but this stays re-run-safe and
  //     respects the partial-unique-primary index).
  const [existingCabinetRole] = await db
    .select({ id: appUserRoles.id })
    .from(appUserRoles)
    .where(
      and(
        eq(appUserRoles.userId, appUser.id),
        eq(appUserRoles.roleKey, "admin"),
        eq(appUserRoles.scope, "company_wide"),
        eq(appUserRoles.isActive, true),
      ),
    )
    .limit(1);
  if (!existingCabinetRole) {
    await db.insert(appUserRoles).values({
      userId: appUser.id,
      roleKey: "admin",
      scope: "company_wide",
      isPrimary: true,
      isActive: true,
    });
  }

  // 6) Welcome email (no-op until 10.L wires Resend).
  await sendEmail(emailLower, welcomeEmailTemplate, {
    recipientName: data.organizationName,
    organizationName: data.organizationName,
    dashboardUrl: `https://arconique.com${landingPathFor(products)}`,
    trialEndsOn: trialEndsAt.toISOString().slice(0, 10),
  });

  // 7) Sign the user in so the session cookie is set and the user lands
  //    straight in their workspace — no second login after signup. The
  //    cookie is written origin-aware by getSupabaseServer (Domain
  //    `.arconique.com` in production), so it's valid across the
  //    management / development / subscription subdomains.
  //
  //    The previous version ignored the sign-in result: on any failure it
  //    still redirected to the dashboard sessionless, and the dashboard
  //    guard then bounced the user to /login — the "log in again after
  //    signup" symptom. We now gate the workspace redirect on a live
  //    session and, on failure (Supabase unconfigured, network/Supabase
  //    error), fall back to /login?onboarded=1 — an already-handled route
  //    that shows a "workspace ready, sign in" notice. The account is
  //    fully provisioned at this point, so the user just signs in once.
  const supabase = await getSupabaseServer();
  let signedIn = false;
  if (supabase) {
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: emailLower,
      password: data.password,
    });
    signedIn = !signInError;
  }
  if (!signedIn) {
    redirect("/login?onboarded=1");
  }

  // 8) Record the signup security event — only on the success path, so a
  //    failed auto-sign-in (which falls back to /login above) never logs a
  //    bogus "login_succeeded".
  await recordSecurityEvent({
    appUserId: appUser.id,
    eventType: "login_succeeded",
    severity: "info",
    metadata: {
      via: "signup",
      organizationId: createdOrg.id,
      products,
    },
  });

  // Live session — land in the products-aware workspace (both/mgmt →
  // /dashboard, dev-only → /development-os). redirect() signals via a
  // thrown NEXT_REDIRECT, so it must stay at top level, never inside a
  // try/catch that would swallow it.
  const landingPath = landingPathFor(products);
  revalidatePath(landingPath);
  redirect(landingPath);
}
