"use server";

/**
 * Keystone first-run setup — server actions.
 *
 *   saveOnboardingProgressAction — persist the wizard's current step.
 *   finishOnboardingAction        — mark the wizard dismissed / complete.
 *   saveRoleAccessMatrixAction    — upsert/delete cabinet × role overrides.
 *
 * All three are gated to org admins and audit-logged. They only mutate
 * org-scoped setup state — no money, no PSP.
 */

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import {
  onboardingProgress,
  roleAccessOverrides,
} from "@/lib/db/schema/keystone-setup";
import { requirePermission, AuthorizationError } from "@/features/auth/permissions";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { recordAuditEvent } from "@/features/audit/services";
import { getCabinetAccess } from "./access";
import {
  MATRIX_CABINETS,
  MATRIX_ROLES,
  defaultAccess,
  cellKey,
} from "./matrix";
import type { VisibleCabinetAccess } from "./matrix";
import type { RoleKey } from "@/features/auth/permission-matrix";

export type KeystoneResult =
  | { ok: true }
  | { ok: false; error: string };

const CABINET_KEYS = new Set(MATRIX_CABINETS.map((c) => c.key));
const ROLE_KEYS = new Set<string>(MATRIX_ROLES);

// ---------------------------------------------------------------------------
// Cabinet-access snapshot (for client surfaces — mobile tabbar / palette)
// ---------------------------------------------------------------------------

/**
 * Returns the set of matrix cabinet keys the current user can see, mirroring
 * the sidebar's server-side gating so client-rendered nav surfaces (the mobile
 * tabbar's "More" sheet + the ⌘K command palette) hide the same cabinets a
 * role was un-ticked for. Demo / super-admin short-circuit to `allAccess`.
 *
 * Read-only and never throws — a resolve failure returns `allAccess: true`
 * (fail-open, exactly like the sidebar's catch) so a transient DB hiccup never
 * blanks the whole nav.
 */
export async function getVisibleCabinetKeysAction(): Promise<VisibleCabinetAccess> {
  try {
    const access = await getCabinetAccess();
    if (access.allAccess) return { allAccess: true, visibleKeys: [] };
    const visibleKeys = MATRIX_CABINETS.map((c) => c.key).filter((k) =>
      access.canSee(k),
    );
    return { allAccess: false, visibleKeys };
  } catch {
    return { allAccess: true, visibleKeys: [] };
  }
}

// ---------------------------------------------------------------------------
// Onboarding wizard progress
// ---------------------------------------------------------------------------

const progressSchema = z.object({
  // 0 = welcome, 1..3 = wizard steps.
  step: z.number().int().min(0).max(3),
});

export async function saveOnboardingProgressAction(
  input: z.input<typeof progressSchema>,
): Promise<KeystoneResult> {
  try {
    await requirePermission("users.write");
  } catch {
    return { ok: false, error: "Not authorised. Org-admin access required." };
  }
  const parsed = progressSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid step." };

  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not signed in." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const now = new Date();
  await db
    .insert(onboardingProgress)
    .values({
      organizationId: me.organizationId,
      currentStep: parsed.data.step,
      updatedBy: me.id,
    })
    .onConflictDoUpdate({
      target: onboardingProgress.organizationId,
      set: { currentStep: parsed.data.step, updatedBy: me.id, updatedAt: now },
    });

  revalidatePath("/dashboard/setup");
  return { ok: true };
}

const finishSchema = z.object({
  // "complete" = finished all steps; "skip" = dismissed early.
  mode: z.enum(["complete", "skip"]).default("complete"),
});

export async function finishOnboardingAction(
  input: z.input<typeof finishSchema>,
): Promise<KeystoneResult> {
  try {
    await requirePermission("users.write");
  } catch {
    return { ok: false, error: "Not authorised. Org-admin access required." };
  }
  const parsed = finishSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not signed in." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const now = new Date();
  const completedAt = parsed.data.mode === "complete" ? now : null;
  await db
    .insert(onboardingProgress)
    .values({
      organizationId: me.organizationId,
      currentStep: 3,
      dismissed: true,
      completedAt,
      updatedBy: me.id,
    })
    .onConflictDoUpdate({
      target: onboardingProgress.organizationId,
      set: { dismissed: true, completedAt, updatedBy: me.id, updatedAt: now },
    });

  await recordAuditEvent({
    actorUserId: me.id,
    action: "onboarding.finished",
    entityType: "organization",
    entityId: me.organizationId,
    after: { mode: parsed.data.mode },
  });

  revalidatePath("/dashboard/setup");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Role-access "who-sees-what" matrix
// ---------------------------------------------------------------------------

const matrixCellSchema = z.object({
  cabinet: z.string().min(1).max(64),
  roleKey: z.string().min(1).max(64),
  canAccess: z.boolean(),
});

const matrixSchema = z.object({
  cells: z.array(matrixCellSchema).max(2000),
});

/**
 * Reconciles the submitted cells against the code defaults:
 *   - a cell that DIFFERS from its default is upserted as an override
 *   - a cell that MATCHES its default has any override removed
 * so the table only ever stores genuine deviations.
 */
export async function saveRoleAccessMatrixAction(
  input: z.input<typeof matrixSchema>,
): Promise<KeystoneResult> {
  try {
    // Matrix edits are a privileged operation — same gate as role assignment.
    await requirePermission("roles.assign");
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return { ok: false, error: "Not authorised. Super-admin access required." };
    }
    throw err;
  }
  const parsed = matrixSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid matrix payload." };

  const me = await getCurrentAppUser();
  if (!me) return { ok: false, error: "Not signed in." };
  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const now = new Date();
  const toUpsert: { cabinet: string; roleKey: string; canAccess: boolean }[] = [];
  const toClear: { cabinet: string; roleKey: string }[] = [];

  for (const cell of parsed.data.cells) {
    if (!CABINET_KEYS.has(cell.cabinet) || !ROLE_KEYS.has(cell.roleKey)) continue;
    const def = defaultAccess(cell.cabinet, cell.roleKey as RoleKey);
    if (cell.canAccess === def) {
      toClear.push({ cabinet: cell.cabinet, roleKey: cell.roleKey });
    } else {
      toUpsert.push(cell);
    }
  }

  for (const cell of toUpsert) {
    await db
      .insert(roleAccessOverrides)
      .values({
        organizationId: me.organizationId,
        cabinet: cell.cabinet,
        roleKey: cell.roleKey,
        canAccess: cell.canAccess,
        updatedBy: me.id,
      })
      .onConflictDoUpdate({
        target: [
          roleAccessOverrides.organizationId,
          roleAccessOverrides.cabinet,
          roleAccessOverrides.roleKey,
        ],
        set: { canAccess: cell.canAccess, updatedBy: me.id, updatedAt: now },
      });
  }

  // Remove overrides that have reverted to the code default.
  const clearKeys = toClear.map((c) => cellKey(c.cabinet, c.roleKey as RoleKey));
  if (clearKeys.length > 0) {
    // Drizzle has no tuple-IN; delete per distinct (cabinet,role) pair.
    for (const c of toClear) {
      await db
        .delete(roleAccessOverrides)
        .where(
          and(
            eq(roleAccessOverrides.organizationId, me.organizationId),
            eq(roleAccessOverrides.cabinet, c.cabinet),
            eq(roleAccessOverrides.roleKey, c.roleKey),
          ),
        );
    }
  }

  await recordAuditEvent({
    actorUserId: me.id,
    action: "role_access_matrix.updated",
    entityType: "organization",
    entityId: me.organizationId,
    after: {
      overrides_set: toUpsert.length,
      overrides_cleared: toClear.length,
    },
  });

  revalidatePath("/dashboard/settings/roles/matrix");
  return { ok: true };
}
