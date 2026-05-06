import "server-only";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  appUserRoles,
  cabinetPreferences,
} from "@/lib/db/schema/role-cabinets";
import type { RoleKey } from "./role-helpers";

export async function listUserRoles(userId: string) {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(appUserRoles)
    .where(
      and(eq(appUserRoles.userId, userId), eq(appUserRoles.isActive, true)),
    );
}

export async function getUserPrimaryRole(
  userId: string,
): Promise<RoleKey | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select({ roleKey: appUserRoles.roleKey })
    .from(appUserRoles)
    .where(
      and(
        eq(appUserRoles.userId, userId),
        eq(appUserRoles.isPrimary, true),
        eq(appUserRoles.isActive, true),
      ),
    )
    .limit(1);
  return (rows[0]?.roleKey as RoleKey) ?? null;
}

export async function getCabinetPreferences(userId: string) {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(cabinetPreferences)
    .where(eq(cabinetPreferences.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}
