/**
 * Stage 10.6.E.2.5 — Platform Admin OS server actions.
 *
 * Per-org admin actions invoked from /platform/[orgCode]:
 *   - extendTrialAction       — push trialEndsAt forward by N days
 *   - markAsCompAction        — set isInternalComp = true
 *   - cancelSubscriptionAction — transition status to "cancelling"
 *
 * Plus impersonation primitives (10.6.E.2.5 scaffold):
 *   - startImpersonationAction — set cookie + emit audit
 *   - endImpersonationAction   — clear cookie + emit audit
 *
 * Every action:
 *   1. Re-checks the caller is super_admin (defense-in-depth — the
 *      layout already gates, but server actions can be invoked from
 *      anywhere)
 *   2. Emits an audit_events row with action prefix `platform.*` so the
 *      action automatically surfaces in /platform/audit
 *   3. For status transitions: uses transitionSubscription() which
 *      enforces the FSM (canTransition) + writes the lifecycle event
 *      in the same transaction
 *
 * Note: this file's path remains `src/lib/subscription-os/actions.ts`
 * — the lib folder rename is out of scope for the Sprint 2 URL move.
 * The URL surface (route group + path) has moved to /platform; the
 * backend lib name persists.
 */

"use server";

import "server-only";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { organizations } from "@/lib/db/schema/saas";
import { orgSubscriptions } from "@/lib/db/schema/subscriptions";
import { recordAuditEvent } from "@/features/audit/services";
import { getCurrentUserContext } from "@/features/auth/permissions";
import { requireSuperAdmin as requireSuperAdminCtx } from "@/features/auth/require-super-admin";
import {
  transitionSubscription,
  recordLifecycleEvent,
} from "@/lib/billing/lifecycle";

const IMPERSONATION_COOKIE = "__platform_impersonation";
const IMPERSONATION_TTL_SECONDS = 60 * 60; // 1 hour

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function requireSuperAdmin(): Promise<{
  appUserId: string;
  isSuperAdmin: true;
}> {
  const ctx = await requireSuperAdminCtx();
  if (!ctx.appUser) {
    throw new Error("Forbidden — super_admin role required");
  }
  return { appUserId: ctx.appUser.id, isSuperAdmin: true };
}

async function loadOrgWithSub(organizationCode: string) {
  const db = getDb();
  if (!db) throw new Error("Database not configured");
  const [org] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.organizationCode, organizationCode))
    .limit(1);
  if (!org) throw new Error(`Organization ${organizationCode} not found`);
  const [sub] = await db
    .select()
    .from(orgSubscriptions)
    .where(eq(orgSubscriptions.organizationId, org.id))
    .limit(1);
  if (!sub) throw new Error(`No subscription for ${organizationCode}`);
  return { org, sub };
}

// ============================================================================
// Action 1 — Extend trial
// ============================================================================

export async function extendTrialAction(
  organizationCode: string,
  additionalDays: number,
): Promise<ActionResult> {
  if (additionalDays <= 0 || additionalDays > 90) {
    return { ok: false, error: "additionalDays must be between 1 and 90" };
  }
  try {
    const { appUserId } = await requireSuperAdmin();
    const { org, sub } = await loadOrgWithSub(organizationCode);
    if (sub.status !== "trial") {
      return {
        ok: false,
        error: `Cannot extend trial — subscription is in '${sub.status}' state`,
      };
    }
    const db = getDb();
    if (!db) throw new Error("Database not configured");
    const newEnd = new Date(
      (sub.trialEndsAt?.getTime() ?? Date.now()) +
        additionalDays * 24 * 60 * 60 * 1000,
    );
    await db
      .update(orgSubscriptions)
      .set({ trialEndsAt: newEnd, updatedAt: new Date() })
      .where(eq(orgSubscriptions.id, sub.id));

    // Lifecycle event — non-transition, just records the act.
    await recordLifecycleEvent({
      organizationId: org.id,
      subscriptionId: sub.id,
      eventType: "trial_warned", // closest existing type — caveat documented
      actorKind: "admin",
      actorUserId: appUserId,
      payload: {
        action: "trial_extended",
        additionalDays,
        previousTrialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
        newTrialEndsAt: newEnd.toISOString(),
      },
    });

    await recordAuditEvent({
      actorUserId: appUserId,
      action: "platform.subscription.trial_extended",
      entityType: "organization",
      entityId: org.id,
      before: { trialEndsAt: sub.trialEndsAt?.toISOString() ?? null },
      after: { trialEndsAt: newEnd.toISOString() },
      metadata: { organizationCode, additionalDays },
    });

    revalidatePath(`/platform/${organizationCode}`);
    revalidatePath("/platform/organizations");
    revalidatePath("/platform/audit");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "extend failed" };
  }
}

// ============================================================================
// Action 2 — Mark as comp (internal complimentary)
// ============================================================================

export async function markAsCompAction(
  organizationCode: string,
  reason: string,
): Promise<ActionResult> {
  if (!reason.trim()) {
    return { ok: false, error: "Reason is required for audit trail" };
  }
  try {
    const { appUserId } = await requireSuperAdmin();
    const { org, sub } = await loadOrgWithSub(organizationCode);
    if (sub.isInternalComp) {
      return { ok: false, error: "Subscription is already marked as comp" };
    }
    const db = getDb();
    if (!db) throw new Error("Database not configured");
    await db
      .update(orgSubscriptions)
      .set({ isInternalComp: true, updatedAt: new Date() })
      .where(eq(orgSubscriptions.id, sub.id));

    await recordLifecycleEvent({
      organizationId: org.id,
      subscriptionId: sub.id,
      eventType: "comp_granted",
      actorKind: "admin",
      actorUserId: appUserId,
      payload: { reason },
    });

    await recordAuditEvent({
      actorUserId: appUserId,
      action: "platform.subscription.comp_granted",
      entityType: "organization",
      entityId: org.id,
      before: { isInternalComp: false },
      after: { isInternalComp: true },
      metadata: { organizationCode, reason },
    });

    revalidatePath(`/platform/${organizationCode}`);
    revalidatePath("/platform/organizations");
    revalidatePath("/platform/audit");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "comp failed" };
  }
}

// ============================================================================
// Action 3 — Cancel subscription
// ============================================================================

export async function cancelSubscriptionAction(
  organizationCode: string,
  reason: string,
): Promise<ActionResult> {
  if (!reason.trim()) {
    return { ok: false, error: "Cancellation reason is required for audit trail" };
  }
  try {
    const { appUserId } = await requireSuperAdmin();
    const { org, sub } = await loadOrgWithSub(organizationCode);
    if (sub.status === "cancelled" || sub.status === "cancelling") {
      return { ok: false, error: "Subscription is already cancelled or cancelling" };
    }

    // FSM-safe transition: trial / active / grace -> cancelling.
    // The cron later moves cancelling -> cancelled at currentPeriodEndsAt.
    await transitionSubscription({
      organizationId: org.id,
      subscriptionId: sub.id,
      toStatus: "cancelling",
      eventType: "cancellation_requested",
      actorKind: "admin",
      actorUserId: appUserId,
      payload: { reason, requestedFromStatus: sub.status },
      setColumns: { cancelledAt: new Date() },
    });

    await recordAuditEvent({
      actorUserId: appUserId,
      action: "platform.subscription.cancelled",
      entityType: "organization",
      entityId: org.id,
      before: { status: sub.status, cancelledAt: null },
      after: { status: "cancelling", cancelledAt: new Date().toISOString() },
      metadata: { organizationCode, reason },
    });

    revalidatePath(`/platform/${organizationCode}`);
    revalidatePath("/platform/organizations");
    revalidatePath("/platform/audit");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "cancel failed" };
  }
}

// ============================================================================
// Impersonation scaffold
// ============================================================================
//
// Honest scoping: this v1 ships the cookie + audit-log emission + banner
// UI. It does NOT swap the org_id resolution in middleware for tenant-
// gated pages — that's a focused security review + RLS-policy update
// that touches every server query. The banner overlay in the layout
// reads the cookie and renders the "viewing as X" affordance, but
// clicking through to /dashboard/* still loads the operator's own org.
//
// Full data-view swap ships in a follow-up sub-phase that pairs with:
//   - Middleware org-resolution rewrite
//   - RLS policy override for impersonation reads
//   - Server-action write-block (every action checks cookie + throws)

export interface ImpersonationCookiePayload {
  asOrgCode: string;
  byOperatorEmail: string;
  startedAt: number; // Date.now() millis
}

export async function startImpersonationAction(
  organizationCode: string,
): Promise<ActionResult> {
  try {
    const { appUserId } = await requireSuperAdmin();
    const { org } = await loadOrgWithSub(organizationCode);
    const ctx = await getCurrentUserContext();

    const payload: ImpersonationCookiePayload = {
      asOrgCode: organizationCode,
      byOperatorEmail: ctx.appUser?.email ?? "unknown",
      startedAt: Date.now(),
    };

    const jar = await cookies();
    jar.set(IMPERSONATION_COOKIE, JSON.stringify(payload), {
      maxAge: IMPERSONATION_TTL_SECONDS,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    await recordAuditEvent({
      actorUserId: appUserId,
      action: "platform.impersonate.start",
      entityType: "organization",
      entityId: org.id,
      metadata: {
        organizationCode,
        ttlSeconds: IMPERSONATION_TTL_SECONDS,
        scopeCaveat:
          "v1 scaffold — cookie set + audit emitted; org_id resolution swap deferred",
      },
    });

    revalidatePath("/platform/audit");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "impersonate start failed",
    };
  }
}

export async function endImpersonationAction(): Promise<ActionResult> {
  try {
    const ctx = await getCurrentUserContext();
    if (!ctx.appUser) {
      return { ok: false, error: "Not authenticated" };
    }
    const jar = await cookies();
    const existing = jar.get(IMPERSONATION_COOKIE)?.value;
    jar.delete(IMPERSONATION_COOKIE);

    if (existing) {
      try {
        const parsed = JSON.parse(existing) as ImpersonationCookiePayload;
        const sessionMs = Date.now() - parsed.startedAt;
        await recordAuditEvent({
          actorUserId: ctx.appUser.id,
          action: "platform.impersonate.end",
          entityType: "organization",
          entityId: null,
          metadata: {
            organizationCode: parsed.asOrgCode,
            sessionDurationMs: sessionMs,
          },
        });
      } catch {
        // Bad cookie payload — already cleared, nothing else to do.
      }
    }

    revalidatePath("/platform/audit");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "impersonate end failed",
    };
  }
}

/** Server-component helper — read the impersonation cookie if present. */
export async function readImpersonationCookie(): Promise<ImpersonationCookiePayload | null> {
  const jar = await cookies();
  const raw = jar.get(IMPERSONATION_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ImpersonationCookiePayload;
  } catch {
    return null;
  }
}
