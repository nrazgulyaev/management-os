import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { appUsers, roles, userRoles } from "@/lib/db/schema/identity";
import { isDbConfigured } from "@/lib/env";
import { getCurrentAuthUser } from "@/lib/supabase/server";
import {
  hasPermission as hasPermissionImpl,
  type CurrentUserContext,
  type RoleKey,
  INTERNAL_ROLES,
} from "./permission-matrix";

export type { CurrentUserContext, RoleKey };
export { hasPermissionImpl as hasPermission };

export async function getCurrentUserContext(): Promise<CurrentUserContext> {
  if (!isDbConfigured()) {
    return {
      mode: "demo",
      appUser: null,
      roles: [],
      isInternal: true,
      isSuperAdmin: false,
    };
  }

  const auth = await getCurrentAuthUser();
  const db = getDb();
  if (!auth || !db) {
    return {
      mode: "live",
      appUser: null,
      roles: [],
      isInternal: false,
      isSuperAdmin: false,
    };
  }

  const [user] = await db
    .select()
    .from(appUsers)
    .where(eq(appUsers.authUserId, auth.id))
    .limit(1);

  if (!user) {
    return {
      mode: "live",
      appUser: null,
      roles: [],
      isInternal: false,
      isSuperAdmin: false,
    };
  }

  const ur = await db
    .select({ key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, user.id));

  const roleKeys = ur.map((r) => r.key as RoleKey);
  return {
    mode: "live",
    appUser: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      status: user.status,
    },
    roles: roleKeys,
    isInternal: roleKeys.some((r) => INTERNAL_ROLES.includes(r)),
    isSuperAdmin: roleKeys.includes("super_admin"),
  };
}

export class AuthorizationError extends Error {
  readonly code = "UNAUTHORIZED";
  constructor(message = "Not authorised") {
    super(message);
  }
}

export async function requireInternalUser(): Promise<CurrentUserContext> {
  const ctx = await getCurrentUserContext();
  if (ctx.mode === "demo") return ctx;
  if (!ctx.isInternal) throw new AuthorizationError("Internal access required");
  return ctx;
}

export async function requirePermission(permission: string): Promise<CurrentUserContext> {
  const ctx = await getCurrentUserContext();
  if (ctx.mode === "demo") return ctx;
  if (!hasPermissionImpl(ctx, permission)) {
    throw new AuthorizationError(`Missing permission: ${permission}`);
  }
  return ctx;
}

export async function canManageEntity(
  entity:
    | "project"
    | "villa"
    | "owner"
    | "share"
    | "booking"
    | "channel"
    | "guest"
    | "document"
    | "user",
): Promise<boolean> {
  const ctx = await getCurrentUserContext();
  const map: Record<string, string> = {
    project: "projects.write",
    villa: "villas.write",
    owner: "owners.write",
    share: "shares.write",
    booking: "bookings.write",
    channel: "channels.write",
    guest: "guests.write",
    document: "documents.write",
    user: "users.write",
  };
  return hasPermissionImpl(ctx, map[entity]);
}
