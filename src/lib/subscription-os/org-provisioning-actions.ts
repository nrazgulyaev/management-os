/**
 * DOMAIN B (platform-console) — Organization + plan provisioning actions.
 *
 * Closes the two gaps verification found in the Platform Admin OS:
 *   1. There was NO console UI to CREATE an organization — orgs only came
 *      from /signup (or seeds), and the existing `createOrganization`
 *      action (lib/development/.../organization-actions.ts) was mounted
 *      nowhere. `createOrgAction` wires it into /platform/organizations.
 *   2. There was NO console UI to ASSIGN a plan — so /signup orgs had no
 *      `org_subscriptions` row, which left the per-org Extend-trial / Comp
 *      / Cancel buttons inert and mgmt AI-agent cards stuck on "Not in
 *      plan". `assignPlanToOrgAction` creates-or-updates that row.
 *
 * Honest, pre-PSP scoping
 * -----------------------
 * No Stripe money is moved here (Indonesia rails deferred — see PSP memo).
 * An operator-assigned plan is exactly that: the catalog tier is attached
 * to the org so feature-gating + the lifecycle FSM work, but no charge is
 * captured. The UI copy says "operator-assigned plan (no charge)".
 *
 * Every action mirrors the sibling pattern in
 * `src/lib/subscription-os/actions.ts`:
 *   1. Re-checks super_admin (defense-in-depth — the (platform-app) layout
 *      already gates, but server actions can be invoked from anywhere).
 *      super_admin is a GLOBAL role, so org-scope is implicit — but every
 *      audit row is stamped with the TARGET org.
 *   2. zod-validates input.
 *   3. Emits a `platform.*` audit row so it surfaces in /platform/audit.
 *   4. Guards getDb() === null.
 */

"use server";

import "server-only";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { organizations } from "@/lib/db/schema/saas";
import { appUsers } from "@/lib/db/schema/identity";
import {
  orgSubscriptions,
  subscriptionPlans,
} from "@/lib/db/schema/subscriptions";
import { recordAuditEvent } from "@/features/audit/services";
import { requireSuperAdmin as requireSuperAdminCtx } from "@/features/auth/require-super-admin";
import { recordLifecycleEvent } from "@/lib/billing/lifecycle";
import { createOrganization } from "@/lib/development/server/organizations/organization-actions";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export interface ProvisioningResult {
  ok: boolean;
  error?: string;
  /** Set on createOrgAction success so the client can route to the org. */
  organizationCode?: string;
}

async function requireSuperAdmin(): Promise<{ appUserId: string }> {
  const ctx = await requireSuperAdminCtx();
  if (!ctx.appUser) {
    throw new Error("Forbidden — super_admin role required");
  }
  return { appUserId: ctx.appUser.id };
}

// ============================================================================
// Action 1 — Create organization (+ optional initial plan)
// ============================================================================

const PRODUCT_VALUES = ["mgmt", "dev"] as const;

const createOrgSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  organizationCode: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[A-Z0-9_]+$/, "Slug must be UPPER_SNAKE_CASE (A-Z, 0-9, _)"),
  organizationType: z.enum([
    "developer_client",
    "partner_organization",
    "demo_test",
    "arconique_internal",
  ]),
  productsEnabled: z
    .array(z.enum(PRODUCT_VALUES))
    .min(1, "Select at least one product"),
  /** Optional — when present, an org_subscriptions row is created too. */
  initialPlanCode: z.string().trim().min(1).optional(),
});

export type CreateOrgInput = z.input<typeof createOrgSchema>;

export async function createOrgAction(
  input: CreateOrgInput,
): Promise<ProvisioningResult> {
  const parsed = createOrgSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  try {
    const { appUserId } = await requireSuperAdmin();
    const db = getDb();
    if (!db) return { ok: false, error: "Database not configured" };

    // Slug must be unique — createOrganization onConflictDoNothing's, so we
    // detect a collision up front to return an honest error instead of a
    // silent no-op.
    const [clash] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.organizationCode, data.organizationCode))
      .limit(1);
    if (clash) {
      return {
        ok: false,
        error: `Slug "${data.organizationCode}" is already taken.`,
      };
    }

    // Map productsEnabled -> enabledModules for the existing action (it
    // sets enabled_modules; products_enabled keeps its ARRAY['mgmt','dev']
    // default). We pass the product slugs through enabledModules so the
    // operator's selection isn't lost.
    const created = await createOrganization({
      organizationCode: data.organizationCode,
      name: data.name,
      organizationType: data.organizationType,
      enabledModules: data.productsEnabled,
    });
    if (!created.ok) {
      return { ok: false, error: created.error ?? "Failed to create organization" };
    }

    // Re-read to confirm + persist productsEnabled (the create action keeps
    // the column default, so we set it explicitly to the operator's choice).
    const [org] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.organizationCode, data.organizationCode))
      .limit(1);
    if (!org) {
      return { ok: false, error: "Organization create did not persist" };
    }
    await db
      .update(organizations)
      .set({ productsEnabled: data.productsEnabled, updatedAt: new Date() })
      .where(eq(organizations.id, org.id));

    await recordAuditEvent({
      actorUserId: appUserId,
      action: "platform.organization.created",
      entityType: "organization",
      entityId: org.id,
      after: {
        organizationCode: data.organizationCode,
        name: data.name,
        organizationType: data.organizationType,
        productsEnabled: data.productsEnabled,
      },
      metadata: {
        organizationCode: data.organizationCode,
        source: "platform-console",
      },
    });

    // Optional — attach the initial plan in the same flow.
    if (data.initialPlanCode) {
      const planResult = await assignPlanInternal({
        db,
        appUserId,
        organizationId: org.id,
        organizationCode: data.organizationCode,
        planCode: data.initialPlanCode,
        startTrial: true,
      });
      if (!planResult.ok) {
        // The org exists; surface the plan error but don't roll back the org.
        return {
          ok: true,
          organizationCode: data.organizationCode,
          error: `Organization created, but plan assignment failed: ${planResult.error}`,
        };
      }
    }

    revalidatePath("/platform/organizations");
    revalidatePath("/platform");
    revalidatePath("/platform/audit");
    return { ok: true, organizationCode: data.organizationCode };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "create organization failed",
    };
  }
}

// ============================================================================
// Action 1b — Create organization AND its login-capable admin (one shot)
// ============================================================================
//
// The "a customer bought access" onboarding: provisions the org + a Supabase
// auth user + an app_users row + a GLOBAL super_admin grant + the 'admin'
// cabinet row, so the new tenant has a human who can immediately sign in. This
// closes the gap that createOrgAction alone leaves (org with zero users).
//
// It mirrors /signup's Supabase-admin user creation, but reuses the
// constraint-safe createOrgAction for the org and the idempotent
// public.provision_app_user() SECURITY DEFINER fn (migration 0087) for the
// user+grants — the same fn scripts/provision-org.ts uses. On ANY failure
// after the auth user is created, the auth user is deleted so a retry with the
// same email isn't blocked by an orphan.

const createTenantSchema = createOrgSchema.extend({
  adminEmail: z.string().trim().email("Enter a valid admin email").max(200),
  adminFullName: z
    .string()
    .trim()
    .min(2, "Admin name must be at least 2 characters")
    .max(120),
  /** Optional — when blank, a strong password is generated and returned ONCE
   *  for the operator to share (email delivery is a no-op stub today). */
  adminPassword: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .max(200)
    .optional(),
});

export type CreateTenantInput = z.input<typeof createTenantSchema>;

export interface CreateTenantResult extends ProvisioningResult {
  adminEmail?: string;
  /** Set only when the password was auto-generated. Show ONCE; never stored. */
  generatedPassword?: string;
}

function generatePassword(): string {
  // 24 url-safe chars — strong, comfortably over the 12-char floor.
  return randomBytes(18).toString("base64url");
}

export async function createTenantWithAdminAction(
  input: CreateTenantInput,
): Promise<CreateTenantResult> {
  const parsed = createTenantSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;
  const emailLower = data.adminEmail.toLowerCase();

  try {
    const { appUserId } = await requireSuperAdmin();
    const db = getDb();
    if (!db) return { ok: false, error: "Database not configured" };
    const admin = getSupabaseAdmin();
    if (!admin) {
      return {
        ok: false,
        error:
          "Auth service-role key is not configured. Set SUPABASE_SERVICE_ROLE_KEY to create tenant admins from the console.",
      };
    }

    // Pre-checks BEFORE creating the auth user, so obvious conflicts don't
    // leave an orphan Supabase user behind.
    const [clash] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.organizationCode, data.organizationCode))
      .limit(1);
    if (clash) {
      return { ok: false, error: `Slug "${data.organizationCode}" is already taken.` };
    }
    const [emailClash] = await db
      .select({ id: appUsers.id })
      .from(appUsers)
      .where(eq(appUsers.email, emailLower))
      .limit(1);
    if (emailClash) {
      return { ok: false, error: `An account with email ${emailLower} already exists.` };
    }

    // 1) Supabase auth user (email auto-confirmed → can sign in immediately).
    const password = data.adminPassword ?? generatePassword();
    const generated = !data.adminPassword;
    const createdUser = await admin.auth.admin.createUser({
      email: emailLower,
      password,
      email_confirm: true,
      user_metadata: { full_name: data.adminFullName },
    });
    if (createdUser.error || !createdUser.data.user) {
      return {
        ok: false,
        error: createdUser.error?.message ?? "Could not create the admin auth user.",
      };
    }
    const authUserId = createdUser.data.user.id;

    try {
      // 2) Org — reuse the constraint-safe path (org insert + productsEnabled +
      //    audit + optional initial plan). ok=true with a soft `error` means
      //    the org landed but the optional plan failed — non-fatal here.
      const orgResult = await createOrgAction({
        name: data.name,
        organizationCode: data.organizationCode,
        organizationType: data.organizationType,
        productsEnabled: data.productsEnabled,
        initialPlanCode: data.initialPlanCode,
      });
      if (!orgResult.ok) {
        throw new Error(orgResult.error ?? "Failed to create organization");
      }

      // 3) Resolve org id + provision the admin atomically (app_users +
      //    user_roles super_admin + app_user_roles admin).
      const [org] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.organizationCode, data.organizationCode))
        .limit(1);
      if (!org) throw new Error("Organization create did not persist");

      await db.execute(
        sql`SELECT public.provision_app_user(
              ${authUserId}::uuid,
              ${emailLower}::text,
              ${data.adminFullName}::text,
              ${org.id}::uuid,
              'super_admin'::text,
              'admin'::text
            )`,
      );

      await recordAuditEvent({
        actorUserId: appUserId,
        action: "platform.tenant.admin_provisioned",
        entityType: "organization",
        entityId: org.id,
        after: { adminEmail: emailLower, adminFullName: data.adminFullName, role: "super_admin" },
        metadata: { organizationCode: data.organizationCode, source: "platform-console" },
      });

      revalidatePath("/platform/organizations");
      revalidatePath("/platform");
      return {
        ok: true,
        organizationCode: data.organizationCode,
        adminEmail: emailLower,
        generatedPassword: generated ? password : undefined,
      };
    } catch (inner) {
      // Roll back the auth user so the email is free to retry.
      await admin.auth.admin.deleteUser(authUserId).catch(() => {});
      return {
        ok: false,
        error: inner instanceof Error ? inner.message : "Tenant provisioning failed",
      };
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "create tenant failed",
    };
  }
}

// ============================================================================
// Action 2 — Assign / change plan on an existing org
// ============================================================================

const assignPlanSchema = z.object({
  organizationCode: z.string().trim().min(1),
  planCode: z.string().trim().min(1),
  /** trialing = start a trial window; active = operator-assigned active. */
  mode: z.enum(["trialing", "active"]),
});

export type AssignPlanInput = z.input<typeof assignPlanSchema>;

export async function assignPlanToOrgAction(
  input: AssignPlanInput,
): Promise<ProvisioningResult> {
  const parsed = assignPlanSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  try {
    const { appUserId } = await requireSuperAdmin();
    const db = getDb();
    if (!db) return { ok: false, error: "Database not configured" };

    const [org] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.organizationCode, data.organizationCode))
      .limit(1);
    if (!org) {
      return { ok: false, error: `Organization ${data.organizationCode} not found` };
    }

    const result = await assignPlanInternal({
      db,
      appUserId,
      organizationId: org.id,
      organizationCode: data.organizationCode,
      planCode: data.planCode,
      startTrial: data.mode === "trialing",
    });
    if (!result.ok) return result;

    revalidatePath(`/platform/${data.organizationCode}`);
    revalidatePath("/platform/organizations");
    revalidatePath("/platform/revenue");
    revalidatePath("/platform/audit");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "assign plan failed",
    };
  }
}

// ============================================================================
// Shared core — create-or-update the org_subscriptions row.
// ============================================================================
//
// Scoping note: super_admin is a GLOBAL role, so there is no requireOrgId
// here — but every write targets a single, explicitly-resolved org. The
// org_subscriptions UPDATE is ANDed with organizationId so it can never
// touch another tenant's row even if two orgs shared a (hypothetical)
// id collision. Reads/writes stay org-pinned.

async function assignPlanInternal(args: {
  db: NonNullable<ReturnType<typeof getDb>>;
  appUserId: string;
  organizationId: string;
  organizationCode: string;
  planCode: string;
  /** When true, status=trialing... mapped to 'trial' + trial dates set. */
  startTrial: boolean;
}): Promise<ProvisioningResult> {
  const { db, appUserId, organizationId, organizationCode, planCode } = args;

  // The plan must exist + be a real FK target (org_subscriptions.plan_code
  // references subscription_plans.plan_code).
  const [plan] = await db
    .select({
      planCode: subscriptionPlans.planCode,
      trialPeriodDays: subscriptionPlans.trialPeriodDays,
    })
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.planCode, planCode))
    .limit(1);
  if (!plan) {
    return { ok: false, error: `Plan "${planCode}" not found` };
  }

  const now = new Date();
  const status = args.startTrial ? "trial" : "active";
  const trialDays = plan.trialPeriodDays > 0 ? plan.trialPeriodDays : 14;
  const trialStartedAt = args.startTrial ? now : null;
  const trialEndsAt = args.startTrial
    ? new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000)
    : null;
  // Active operator-assigned plan gets a 30-day current period window so
  // the lifecycle cron + "Period ends" UI have a date to anchor on.
  const currentPeriodStartsAt = args.startTrial ? null : now;
  const currentPeriodEndsAt = args.startTrial
    ? null
    : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Existing row? -> change plan (UPDATE, org-scoped). Else -> create.
  const [existing] = await db
    .select({
      id: orgSubscriptions.id,
      planCode: orgSubscriptions.planCode,
      status: orgSubscriptions.status,
    })
    .from(orgSubscriptions)
    .where(eq(orgSubscriptions.organizationId, organizationId))
    .limit(1);

  if (existing) {
    await db
      .update(orgSubscriptions)
      .set({
        planCode: plan.planCode,
        status,
        trialStartedAt,
        trialEndsAt,
        currentPeriodStartsAt,
        currentPeriodEndsAt,
        updatedAt: now,
      })
      .where(
        and(
          eq(orgSubscriptions.id, existing.id),
          eq(orgSubscriptions.organizationId, organizationId),
        ),
      );

    await recordLifecycleEvent({
      organizationId,
      subscriptionId: existing.id,
      eventType: "plan_changed",
      actorKind: "admin",
      actorUserId: appUserId,
      payload: {
        fromPlanCode: existing.planCode,
        toPlanCode: plan.planCode,
        fromStatus: existing.status,
        toStatus: status,
        operatorAssigned: true,
        noCharge: true,
      },
    });

    await recordAuditEvent({
      actorUserId: appUserId,
      action: "platform.subscription.plan_assigned",
      entityType: "organization",
      entityId: organizationId,
      before: { planCode: existing.planCode, status: existing.status },
      after: { planCode: plan.planCode, status },
      metadata: { organizationCode, planCode: plan.planCode, mode: status, noCharge: true },
    });
    return { ok: true };
  }

  const [createdSub] = await db
    .insert(orgSubscriptions)
    .values({
      organizationId,
      planCode: plan.planCode,
      billingCycle: "monthly",
      status,
      trialStartedAt,
      trialEndsAt,
      currentPeriodStartsAt,
      currentPeriodEndsAt,
    })
    .returning({ id: orgSubscriptions.id });

  await recordLifecycleEvent({
    organizationId,
    subscriptionId: createdSub?.id ?? null,
    eventType: args.startTrial ? "trial_started" : "activated",
    actorKind: "admin",
    actorUserId: appUserId,
    payload: {
      planCode: plan.planCode,
      status,
      operatorAssigned: true,
      noCharge: true,
    },
  });

  await recordAuditEvent({
    actorUserId: appUserId,
    action: "platform.subscription.plan_assigned",
    entityType: "organization",
    entityId: organizationId,
    before: { planCode: null, status: null },
    after: { planCode: plan.planCode, status },
    metadata: {
      organizationCode,
      planCode: plan.planCode,
      mode: status,
      noCharge: true,
      created: true,
    },
  });
  return { ok: true };
}
