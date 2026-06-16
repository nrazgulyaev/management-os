/**
 * Stage 8.F.3 — tenant onboarding endpoint.
 *
 * POST /api/onboarding/start
 *
 * Atomic flow (all-or-nothing — DB transaction wraps every step except
 * the Supabase Auth user creation which is a separate API call). On
 * any failure after auth user creation, we delete the auth user to
 * avoid leaving an orphan in auth.users.
 *
 *   1. Validate the form payload via Zod.
 *   2. Reject if email is already in auth.users (409).
 *   3. Reject if org slug or org_code is taken (409).
 *   4. Create the Supabase Auth user (email_confirm: true so login works
 *      immediately — magic-link / verification can be a Stage 9 add-on).
 *   5. Insert organizations row with the new slug.
 *   6. Call provision_app_user() (migration 0087) to insert the
 *      app_users row + grant super_admin in user_roles + grant 'admin'
 *      in app_user_roles.
 *   7. Insert org_subscriptions row at the requested plan_code.
 *   8. Audit-log "org_created" + "user_provisioned".
 *   9. Return JSON { ok, app_user_id, organization_id, redirect_url }.
 *
 * Stripe Checkout, magic-link verification, custom domain, Stripe
 * Customer Portal — all out of scope. Stage 9 commerce activation.
 *
 * Security:
 *   - Zod schema enforces sane lengths + slug shape.
 *   - Slug uniqueness checked before mutation.
 *   - Audit events log every provisioning action.
 *   - Errors do NOT leak internal IDs.
 */

import { NextResponse, type NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDb, rowsOf } from "@/lib/db/client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { organizations } from "@/lib/db/schema/saas";
import { subscriptionPlans, orgSubscriptions } from "@/lib/db/schema/subscriptions";
import { auditEvents } from "@/lib/db/schema/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Reasonable accept/reject ranges; tighter than DB CHECK constraints.
const ORG_NAME_MIN = 2;
const ORG_NAME_MAX = 80;
const ORG_SLUG_MIN = 2;
const ORG_SLUG_MAX = 40;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

// Accept both camelCase (matches the existing /sign-up form fields) and
// snake_case (canonical for HTTP APIs). Each field is required exactly
// once via the union — extra alias fields are tolerated.
const baseSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(200).optional(),
  fullName: z.string().min(1).max(200).optional(),
  full_name: z.string().min(1).max(200).optional(),
  orgName: z.string().min(ORG_NAME_MIN).max(ORG_NAME_MAX).optional(),
  org_name: z.string().min(ORG_NAME_MIN).max(ORG_NAME_MAX).optional(),
  orgSlug: z.string().min(ORG_SLUG_MIN).max(ORG_SLUG_MAX).regex(SLUG_RE).optional(),
  org_slug: z.string().min(ORG_SLUG_MIN).max(ORG_SLUG_MAX).regex(SLUG_RE).optional(),
  planCode: z.string().min(1).max(40).optional(),
  plan_code: z.string().min(1).max(40).optional(),
});

interface NormalizedInput {
  email: string;
  password?: string;
  full_name?: string;
  org_name: string;
  org_slug: string;
  plan_code: string;
}

function normalize(parsed: z.infer<typeof baseSchema>): NormalizedInput | string {
  const orgName = parsed.orgName ?? parsed.org_name;
  const orgSlug = parsed.orgSlug ?? parsed.org_slug;
  if (!orgName) return "Organization name is required.";
  if (!orgSlug) return "Workspace slug is required.";
  return {
    email: parsed.email,
    password: parsed.password,
    full_name: parsed.fullName ?? parsed.full_name,
    org_name: orgName,
    org_slug: orgSlug,
    plan_code: parsed.planCode ?? parsed.plan_code ?? "trial",
  };
}

interface _SuccessBody {
  ok: true;
  app_user_id: string;
  organization_id: string;
  redirect_url: string;
}
interface ErrorBody {
  ok: false;
  error: string;
  fieldErrors?: Record<string, string>;
}

function badRequest(error: string, fieldErrors?: Record<string, string>): NextResponse<ErrorBody> {
  return NextResponse.json({ ok: false, error, fieldErrors }, { status: 400 });
}

async function readPayload(request: NextRequest): Promise<unknown> {
  const ct = request.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return request.json();
  // Standard <form action="/api/onboarding/start" method="POST"> submits
  // application/x-www-form-urlencoded. Promote it to a plain object.
  const fd = await request.formData();
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) out[k] = String(v);
  return out;
}

function isJsonClient(request: NextRequest): boolean {
  const ct = request.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return true;
  const accept = request.headers.get("accept") ?? "";
  return /application\/json/.test(accept) && !/text\/html/.test(accept);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await readPayload(request);
  } catch {
    return badRequest("Could not parse request body.");
  }

  const parsed = baseSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (path) fieldErrors[path] = issue.message;
    }
    return badRequest("Invalid form input.", fieldErrors);
  }
  const normalized = normalize(parsed.data);
  if (typeof normalized === "string") return badRequest(normalized);
  const input = normalized;
  const slug = input.org_slug.toLowerCase();

  const db = requireDb();
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "Sign-up is temporarily unavailable. Please try again later." },
      { status: 503 },
    );
  }

  // -------- 1. Pre-flight uniqueness checks (cheap, no auth.users mutation yet)
  const orgCode = `ORG_${slug.toUpperCase().replace(/-/g, "_")}`;
  const existingOrg = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.organizationCode, orgCode))
    .limit(1)
    .then((rows) => rows[0]);
  if (existingOrg) {
    return NextResponse.json(
      {
        ok: false,
        error: "That workspace slug is already taken. Please choose another.",
        fieldErrors: { org_slug: "Slug already in use" },
      },
      { status: 409 },
    );
  }

  // Validate plan exists.
  const plan = await db
    .select({ planCode: subscriptionPlans.planCode })
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.planCode, input.plan_code))
    .limit(1)
    .then((rows) => rows[0]);
  if (!plan) {
    return NextResponse.json(
      {
        ok: false,
        error: "Selected plan is not available.",
        fieldErrors: { plan_code: "Unknown plan" },
      },
      { status: 400 },
    );
  }

  // -------- 2. Create the Supabase Auth user.
  // If a password is provided we use it; otherwise we create the user
  // without a password — Supabase will require the user to set one via
  // a password-reset link. The `email_confirm: true` flag bypasses the
  // verification step so the user can sign in immediately for trial.
  const created = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      full_name: input.full_name ?? null,
      onboarding_org_slug: slug,
      provisioned_via: "api/onboarding/start",
    },
  });
  if (created.error || !created.data.user) {
    const msg = created.error?.message ?? "auth user creation failed";
    if (/already registered|exists/i.test(msg)) {
      return NextResponse.json(
        { ok: false, error: "An account with that email already exists.", fieldErrors: { email: "Already registered" } },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Could not create the account. Please try again." },
      { status: 500 },
    );
  }
  const authUserId = created.data.user.id;

  // From this point any failure must roll back the auth user — we don't
  // want orphans in auth.users.
  const rollbackAuth = async (): Promise<void> => {
    try {
      await admin.auth.admin.deleteUser(authUserId);
    } catch {
      // Best-effort. If this also fails, the operator can clean up via dashboard.
    }
  };

  try {
    // Steps 3-6 run inside ONE DB transaction so a failure in any later
    // step (provision_app_user, subscription, audit) rolls back the org +
    // app_user too — never leaving an orphaned organizations row with no
    // user behind it. The auth user is rolled back separately in the catch
    // below (it lives in auth.users, outside this DB transaction).
    const { organizationId, appUserId } = await db.transaction(async (tx) => {
      // -------- 3. Insert organizations row.
      const [org] = await tx
        .insert(organizations)
        .values({
          organizationCode: orgCode,
          name: input.org_name,
          organizationType: "tenant",
          primaryCurrency: "IDR",
          primaryLanguage: "en",
          timezone: "Asia/Makassar",
          subscriptionTier: input.plan_code,
        })
        .returning({ id: organizations.id, name: organizations.name });
      const organizationId = org.id;

      // -------- 4. Provision the app_users row + role grants atomically.
      // Signature: (auth_user_id, email, full_name, organization_id,
      // role_key_internal, role_key_cabinet). The new tenant's org_id
      // was returned from step 3.
      const provisionResult = await tx.execute<{ provision_app_user: string }>(
        sql`SELECT public.provision_app_user(
          ${authUserId}::uuid,
          ${input.email}::text,
          ${input.full_name ?? input.email}::text,
          ${organizationId}::uuid,
          'super_admin'::text,
          'admin'::text
        ) AS provision_app_user`,
      );
      const provisionRows = rowsOf<{ provision_app_user: string }>(provisionResult);
      const appUserId = provisionRows[0]?.provision_app_user;
      if (!appUserId) {
        throw new Error("provision_app_user returned no id");
      }

      // -------- 5. Subscription row.
      const trialDays = 14;
      const trialStart = new Date();
      const trialEnd = new Date(trialStart.getTime() + trialDays * 24 * 60 * 60 * 1000);
      await tx.insert(orgSubscriptions).values({
        organizationId,
        planCode: input.plan_code,
        billingCycle: "monthly",
        status: input.plan_code === "trial" ? "trial" : "active",
        trialStartedAt: trialStart,
        trialEndsAt: trialEnd,
      });

      // -------- 6. Audit log (org + user).
      await tx.insert(auditEvents).values([
        {
          actorUserId: appUserId,
          action: "org.create",
          entityType: "organization",
          entityId: organizationId,
          after: { name: input.org_name, slug, plan: input.plan_code },
          metadata: { source: "api/onboarding/start" },
        },
        {
          actorUserId: appUserId,
          action: "auth.user.provisioned",
          entityType: "app_user",
          entityId: appUserId,
          after: { email: input.email, organization_id: organizationId },
          metadata: { source: "api/onboarding/start", role_internal: "super_admin", role_cabinet: "admin" },
        },
      ]);

      return { organizationId, appUserId };
    });

    // The Supabase Admin API creates the user but does NOT set a session
    // cookie on this response — the user must sign in once. Send them to
    // /login with a success flag and pre-filled email; subsequent visits
    // hit /dashboard directly via the existing auth flow.
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("onboarded", "1");
    loginUrl.searchParams.set("email", input.email);
    if (isJsonClient(request)) {
      return NextResponse.json(
        {
          ok: true,
          app_user_id: appUserId,
          organization_id: organizationId,
          redirect_url: loginUrl.pathname + loginUrl.search,
        },
        { status: 200 },
      );
    }
    return NextResponse.redirect(loginUrl, 303);
  } catch (err) {
    await rollbackAuth();
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json(
      {
        ok: false,
        error: `Onboarding failed: ${msg.slice(0, 200)}. The auth account was rolled back; please try again.`,
      },
      { status: 500 },
    );
  }
}
