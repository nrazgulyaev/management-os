import "server-only";

import { asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { appUsers, roles, userRoles } from "@/lib/db/schema/identity";
import { getCurrentUserContext } from "./permissions";
import type { WithSource } from "@/features/types";

export interface AppUserRow {
  id: string;
  email: string;
  fullName: string;
  status: string;
  authLinked: boolean;
  roles: string[];
  createdAt: string;
}

const fallback: WithSource<AppUserRow>[] = [
  {
    source: "mock",
    id: "demo",
    email: "demo@arconique.com",
    fullName: "Demo · Director",
    status: "active",
    authLinked: false,
    roles: ["director"],
    createdAt: new Date().toISOString(),
  },
];

export async function listAppUsers(): Promise<WithSource<AppUserRow>[]> {
  const db = getDb();
  if (!db) return fallback;

  // IDOR fix (defect 1): org-scope the directory to the caller's org. The
  // previous query selected every tenant's app_users + user_roles.
  const ctx = await getCurrentUserContext();
  const orgId = ctx.appUser?.organizationId ?? null;
  if (!orgId) return [];

  const usersRows = await db
    .select()
    .from(appUsers)
    .where(eq(appUsers.organizationId, orgId))
    .orderBy(asc(appUsers.fullName));
  if (usersRows.length === 0) return [];

  const userIds = usersRows.map((u) => u.id);
  const allRoles = await db
    .select({
      userId: userRoles.userId,
      key: roles.key,
    })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(inArray(userRoles.userId, userIds));

  const byUser = new Map<string, string[]>();
  for (const r of allRoles) {
    const arr = byUser.get(r.userId) ?? [];
    if (!arr.includes(r.key)) arr.push(r.key);
    byUser.set(r.userId, arr);
  }

  return usersRows.map((u) => ({
    source: "db",
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    status: u.status,
    authLinked: Boolean(u.authUserId),
    roles: byUser.get(u.id) ?? [],
    createdAt: u.createdAt.toISOString(),
  }));
}
