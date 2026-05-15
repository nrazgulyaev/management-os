"use server";
import "server-only";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import {
  appUserRoles,
  cabinetPreferences,
} from "@/lib/db/schema/role-cabinets";
import { requireOrgId } from "@/features/auth/require-org";
import {
  ALL_ROLE_KEYS,
  isValidRoleAssignment,
  type RoleKey,
} from "./role-helpers";

const grantSchema = z.object({
  userId: z.string().uuid(),
  roleKey: z.enum([...ALL_ROLE_KEYS] as [RoleKey, ...RoleKey[]]),
  scope: z.enum(["company_wide", "project_specific"]),
  scopedProjectId: z.string().uuid().optional(),
  isPrimary: z.boolean().default(false),
  grantedBy: z.string().uuid().optional(),
});

export async function grantUserRole(input: z.input<typeof grantSchema>) {
  const parsed = grantSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message };
  }
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };

  const existing = await db
    .select({
      roleKey: appUserRoles.roleKey,
      isPrimary: appUserRoles.isPrimary,
    })
    .from(appUserRoles)
    .where(
      and(
        eq(appUserRoles.userId, parsed.data.userId),
        eq(appUserRoles.isActive, true),
      ),
    );
  const verdict = isValidRoleAssignment({
    existingActiveRoles: existing.map((e) => ({
      roleKey: e.roleKey as RoleKey,
      isPrimary: e.isPrimary,
    })),
    newRoleKey: parsed.data.roleKey,
    newIsPrimary: parsed.data.isPrimary,
  });
  if (!verdict.ok) {
    return { ok: false as const, error: verdict.reason };
  }

  await db.insert(appUserRoles).values({
    userId: parsed.data.userId,
    roleKey: parsed.data.roleKey,
    scope: parsed.data.scope,
    scopedProjectId: parsed.data.scopedProjectId ?? null,
    isPrimary: parsed.data.isPrimary,
    grantedBy: parsed.data.grantedBy ?? null,
  });
  return { ok: true as const };
}

export async function revokeUserRole(args: {
  roleId: string;
  revokedBy?: string;
  reason?: string;
}) {
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  await db
    .update(appUserRoles)
    .set({
      isActive: false,
      isPrimary: false,
      revokedAt: new Date(),
      revokedBy: args.revokedBy ?? null,
      revocationReason: args.reason ?? null,
    })
    .where(eq(appUserRoles.id, args.roleId));
  return { ok: true as const };
}

const prefsSchema = z.object({
  userId: z.string().uuid(),
  defaultCabinetKey: z.string().nullable().optional(),
  cabinetWidgetPreferences: z.record(z.unknown()).optional(),
  preferredLanguage: z.string().optional(),
  preferredTheme: z.string().optional(),
  notificationPreferences: z.record(z.unknown()).optional(),
});

export async function saveCabinetPreferences(input: z.input<typeof prefsSchema>) {
  const parsed = prefsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message };
  }
  const db = getDb();
  if (!db) return { ok: false as const, error: "DB not configured" };
  // HF-5: cabinet_preferences is multi-tenant (migration 0072).
  const organizationId = await requireOrgId();
  await db
    .insert(cabinetPreferences)
    .values({
      organizationId,
      userId: parsed.data.userId,
      defaultCabinetKey: parsed.data.defaultCabinetKey ?? null,
      cabinetWidgetPreferences: parsed.data.cabinetWidgetPreferences ?? {},
      preferredLanguage: parsed.data.preferredLanguage ?? null,
      preferredTheme: parsed.data.preferredTheme ?? null,
      notificationPreferences: parsed.data.notificationPreferences ?? {},
    })
    .onConflictDoUpdate({
      target: cabinetPreferences.userId,
      set: {
        defaultCabinetKey: parsed.data.defaultCabinetKey ?? null,
        cabinetWidgetPreferences: parsed.data.cabinetWidgetPreferences ?? {},
        preferredLanguage: parsed.data.preferredLanguage ?? null,
        preferredTheme: parsed.data.preferredTheme ?? null,
        notificationPreferences: parsed.data.notificationPreferences ?? {},
      },
    });
  return { ok: true as const };
}
