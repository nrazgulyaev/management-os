/**
 * P1 (superadmin-plans-console) — Plans & pricing editor server actions.
 *
 * Two mutations invoked from /platform/plans:
 *   - createPlanAction — insert a new row into subscription_plans
 *   - updatePlanAction — edit an existing plan's pricing / metadata
 *
 * No real PSP is wired (Indonesia rails deferred) — these mutate the
 * plan CATALOG only. Pricing is captured in MINOR units (bigint) and
 * applied to subscriptions via the existing org_subscriptions join; no
 * money is charged here.
 *
 * Every action mirrors the sibling pattern in
 * `src/lib/subscription-os/actions.ts`:
 *   1. Re-checks super_admin (defense-in-depth — layout already gates)
 *   2. Emits a `platform.plan.*` audit row so it surfaces in /platform/audit
 *   3. Guards getDb() === null
 */

"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { subscriptionPlans } from "@/lib/db/schema/subscriptions";
import { recordAuditEvent } from "@/features/audit/services";
import { requireSuperAdmin as requireSuperAdminCtx } from "@/features/auth/require-super-admin";

export interface PlanActionResult {
  ok: boolean;
  error?: string;
}

export interface PlanFormInput {
  planCode: string;
  displayName: string;
  description?: string;
  tierRank: number;
  monthlyPriceMinor: bigint;
  annualPriceMinor?: bigint | null;
  currency: string;
  trialPeriodDays: number;
  isActive: boolean;
  isInternal: boolean;
  isPublic: boolean;
  sortOrder: number;
}

async function requireSuperAdmin(): Promise<{ appUserId: string }> {
  const ctx = await requireSuperAdminCtx();
  if (!ctx.appUser) {
    throw new Error("Forbidden — super_admin role required");
  }
  return { appUserId: ctx.appUser.id };
}

const PLAN_CODE_RE = /^[a-z0-9][a-z0-9_-]{1,48}$/;

function validate(input: PlanFormInput): string | null {
  if (!input.planCode || !PLAN_CODE_RE.test(input.planCode)) {
    return "Plan code must be lowercase letters / numbers / dashes (2–49 chars).";
  }
  if (!input.displayName.trim()) return "Display name is required.";
  if (!Number.isInteger(input.tierRank) || input.tierRank < 0) {
    return "Tier rank must be a non-negative integer.";
  }
  if (input.monthlyPriceMinor < 0n) return "Monthly price cannot be negative.";
  if (input.annualPriceMinor != null && input.annualPriceMinor < 0n) {
    return "Annual price cannot be negative.";
  }
  if (!Number.isInteger(input.trialPeriodDays) || input.trialPeriodDays < 0 || input.trialPeriodDays > 365) {
    return "Trial period must be between 0 and 365 days.";
  }
  if (!input.currency || input.currency.trim().length !== 3) {
    return "Currency must be a 3-letter code (e.g. USD, IDR).";
  }
  return null;
}

function revalidatePlansSurfaces() {
  revalidatePath("/platform");
  revalidatePath("/platform/plans");
  revalidatePath("/platform/revenue");
  revalidatePath("/platform/audit");
}

// ============================================================================
// Create plan
// ============================================================================

export async function createPlanAction(
  input: PlanFormInput,
): Promise<PlanActionResult> {
  const invalid = validate(input);
  if (invalid) return { ok: false, error: invalid };
  try {
    const { appUserId } = await requireSuperAdmin();
    const db = getDb();
    if (!db) return { ok: false, error: "Database not configured" };

    const [existing] = await db
      .select({ id: subscriptionPlans.id })
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.planCode, input.planCode))
      .limit(1);
    if (existing) {
      return { ok: false, error: `Plan code "${input.planCode}" already exists.` };
    }

    const [created] = await db
      .insert(subscriptionPlans)
      .values({
        planCode: input.planCode,
        displayName: input.displayName.trim(),
        description: input.description?.trim() || null,
        tierRank: input.tierRank,
        monthlyPriceMinor: input.monthlyPriceMinor,
        annualPriceMinor: input.annualPriceMinor ?? null,
        currency: input.currency.trim().toUpperCase(),
        trialPeriodDays: input.trialPeriodDays,
        isActive: input.isActive,
        isInternal: input.isInternal,
        isPublic: input.isPublic,
        sortOrder: input.sortOrder,
      })
      .returning({ id: subscriptionPlans.id });

    await recordAuditEvent({
      actorUserId: appUserId,
      action: "platform.plan.created",
      entityType: "subscription_plan",
      entityId: created?.id ?? null,
      after: {
        planCode: input.planCode,
        displayName: input.displayName,
        monthlyPriceMinor: input.monthlyPriceMinor.toString(),
        currency: input.currency,
      },
      metadata: { planCode: input.planCode },
    });

    revalidatePlansSurfaces();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "create failed" };
  }
}

// ============================================================================
// Update plan
// ============================================================================

export async function updatePlanAction(
  planCode: string,
  input: PlanFormInput,
): Promise<PlanActionResult> {
  const invalid = validate(input);
  if (invalid) return { ok: false, error: invalid };
  try {
    const { appUserId } = await requireSuperAdmin();
    const db = getDb();
    if (!db) return { ok: false, error: "Database not configured" };

    const [current] = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.planCode, planCode))
      .limit(1);
    if (!current) {
      return { ok: false, error: `Plan "${planCode}" not found.` };
    }

    // plan_code is the FK target for org_subscriptions + plan_features —
    // editing it would orphan rows, so it's immutable here.
    await db
      .update(subscriptionPlans)
      .set({
        displayName: input.displayName.trim(),
        description: input.description?.trim() || null,
        tierRank: input.tierRank,
        monthlyPriceMinor: input.monthlyPriceMinor,
        annualPriceMinor: input.annualPriceMinor ?? null,
        currency: input.currency.trim().toUpperCase(),
        trialPeriodDays: input.trialPeriodDays,
        isActive: input.isActive,
        isInternal: input.isInternal,
        isPublic: input.isPublic,
        sortOrder: input.sortOrder,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionPlans.planCode, planCode));

    await recordAuditEvent({
      actorUserId: appUserId,
      action: "platform.plan.updated",
      entityType: "subscription_plan",
      entityId: current.id,
      before: {
        displayName: current.displayName,
        monthlyPriceMinor: current.monthlyPriceMinor.toString(),
        currency: current.currency,
        isActive: current.isActive,
      },
      after: {
        displayName: input.displayName,
        monthlyPriceMinor: input.monthlyPriceMinor.toString(),
        currency: input.currency,
        isActive: input.isActive,
      },
      metadata: { planCode },
    });

    revalidatePlansSurfaces();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "update failed" };
  }
}
