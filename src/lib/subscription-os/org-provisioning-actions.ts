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
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { organizations } from "@/lib/db/schema/saas";
import {
  orgSubscriptions,
  subscriptionPlans,
} from "@/lib/db/schema/subscriptions";
import { recordAuditEvent } from "@/features/audit/services";
import { requireSuperAdmin as requireSuperAdminCtx } from "@/features/auth/require-super-admin";
import { recordLifecycleEvent } from "@/lib/billing/lifecycle";
import { createOrganization } from "@/lib/development/server/organizations/organization-actions";

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
