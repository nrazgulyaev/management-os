/**
 * Platform-admin feature-flags cabinet — write side.
 *
 * Three super-admin actions invoked from /platform/feature-flags:
 *   - toggleFlagKillSwitchAction — flip is_active (the kill switch)
 *   - bumpFlagRolloutAction       — set rollout_percent (0..100)
 *   - createFeatureFlagAction     — "+ New flag" form
 *
 * Every action:
 *   1. Re-checks the caller is super_admin (defense-in-depth — the
 *      (platform-app) layout already gates, but server actions can be
 *      invoked from anywhere).
 *   2. Emits an audit_events row with action prefix `platform.*` so it
 *      surfaces automatically in /platform/audit.
 *
 * getDb() may return null (demo mode) — guarded everywhere.
 */

"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { featureFlags } from "@/lib/db/schema/subscriptions";
import { recordAuditEvent } from "@/features/audit/services";
import { requireSuperAdmin as requireSuperAdminCtx } from "@/features/auth/require-super-admin";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const LIFECYCLE_STATUSES = ["internal", "beta", "ga", "archived"] as const;
type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];

async function requireSuperAdminUserId(): Promise<string | null> {
  const ctx = await requireSuperAdminCtx();
  // Demo mode resolves super-admin without an appUser — no audit actor.
  return ctx.appUser?.id ?? null;
}

const FLAG_CODE_RE = /^[a-z0-9][a-z0-9_.-]*$/;

// ============================================================================
// Action 1 — Kill-switch toggle (flip is_active)
// ============================================================================

export async function toggleFlagKillSwitchAction(
  flagCode: string,
): Promise<ActionResult> {
  try {
    const actorUserId = await requireSuperAdminUserId();
    const db = getDb();
    if (!db) return { ok: false, error: "Database not configured" };

    const [flag] = await db
      .select({ id: featureFlags.id, isActive: featureFlags.isActive })
      .from(featureFlags)
      .where(eq(featureFlags.flagCode, flagCode))
      .limit(1);
    if (!flag) return { ok: false, error: `Flag ${flagCode} not found` };

    const next = !flag.isActive;
    await db
      .update(featureFlags)
      .set({ isActive: next, updatedAt: new Date() })
      .where(eq(featureFlags.id, flag.id));

    await recordAuditEvent({
      actorUserId,
      action: next
        ? "platform.feature_flag.activated"
        : "platform.feature_flag.killed",
      entityType: "feature_flag",
      entityId: flag.id,
      before: { isActive: flag.isActive },
      after: { isActive: next },
      metadata: { flagCode },
    });

    revalidatePath("/platform/feature-flags");
    revalidatePath("/platform/audit");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "toggle failed" };
  }
}

// ============================================================================
// Action 2 — Rollout bump (set rollout_percent)
// ============================================================================

export async function bumpFlagRolloutAction(
  flagCode: string,
  rolloutPercent: number,
): Promise<ActionResult> {
  if (
    !Number.isInteger(rolloutPercent) ||
    rolloutPercent < 0 ||
    rolloutPercent > 100
  ) {
    return { ok: false, error: "rolloutPercent must be an integer 0..100" };
  }
  try {
    const actorUserId = await requireSuperAdminUserId();
    const db = getDb();
    if (!db) return { ok: false, error: "Database not configured" };

    const [flag] = await db
      .select({
        id: featureFlags.id,
        rolloutPercent: featureFlags.rolloutPercent,
      })
      .from(featureFlags)
      .where(eq(featureFlags.flagCode, flagCode))
      .limit(1);
    if (!flag) return { ok: false, error: `Flag ${flagCode} not found` };

    if (flag.rolloutPercent === rolloutPercent) {
      return { ok: true };
    }

    await db
      .update(featureFlags)
      .set({ rolloutPercent, updatedAt: new Date() })
      .where(eq(featureFlags.id, flag.id));

    await recordAuditEvent({
      actorUserId,
      action: "platform.feature_flag.rollout_changed",
      entityType: "feature_flag",
      entityId: flag.id,
      before: { rolloutPercent: flag.rolloutPercent },
      after: { rolloutPercent },
      metadata: { flagCode },
    });

    revalidatePath("/platform/feature-flags");
    revalidatePath("/platform/audit");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "bump failed" };
  }
}

// ============================================================================
// Action 3 — Create flag ("+ New flag" form)
// ============================================================================

export interface CreateFeatureFlagInput {
  flagCode: string;
  displayName: string;
  category: string;
  description?: string;
  owner?: string;
  lifecycleStatus: string;
  rolloutPercent: number;
}

export async function createFeatureFlagAction(
  input: CreateFeatureFlagInput,
): Promise<ActionResult> {
  const flagCode = input.flagCode.trim();
  const displayName = input.displayName.trim();
  const category = input.category.trim();

  if (!flagCode) return { ok: false, error: "Flag code is required" };
  if (!FLAG_CODE_RE.test(flagCode)) {
    return {
      ok: false,
      error: "Flag code must be lowercase: a-z, 0-9, dot, dash, underscore",
    };
  }
  if (!displayName) return { ok: false, error: "Display name is required" };
  if (!category) return { ok: false, error: "Category is required" };
  if (!LIFECYCLE_STATUSES.includes(input.lifecycleStatus as LifecycleStatus)) {
    return { ok: false, error: "Invalid lifecycle status" };
  }
  if (
    !Number.isInteger(input.rolloutPercent) ||
    input.rolloutPercent < 0 ||
    input.rolloutPercent > 100
  ) {
    return { ok: false, error: "Rollout % must be an integer 0..100" };
  }

  try {
    const actorUserId = await requireSuperAdminUserId();
    const db = getDb();
    if (!db) return { ok: false, error: "Database not configured" };

    const [existing] = await db
      .select({ id: featureFlags.id })
      .from(featureFlags)
      .where(eq(featureFlags.flagCode, flagCode))
      .limit(1);
    if (existing) {
      return { ok: false, error: `Flag code "${flagCode}" already exists` };
    }

    const [created] = await db
      .insert(featureFlags)
      .values({
        flagCode,
        displayName,
        category,
        description: input.description?.trim() || null,
        owner: input.owner?.trim() || null,
        lifecycleStatus: input.lifecycleStatus,
        rolloutPercent: input.rolloutPercent,
        isActive: true,
      })
      .returning({ id: featureFlags.id });

    await recordAuditEvent({
      actorUserId,
      action: "platform.feature_flag.created",
      entityType: "feature_flag",
      entityId: created?.id ?? null,
      after: {
        flagCode,
        displayName,
        category,
        lifecycleStatus: input.lifecycleStatus,
        rolloutPercent: input.rolloutPercent,
        owner: input.owner?.trim() || null,
      },
      metadata: { flagCode },
    });

    revalidatePath("/platform/feature-flags");
    revalidatePath("/platform/audit");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "create failed" };
  }
}
