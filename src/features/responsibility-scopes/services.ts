import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { userResponsibilityScopes } from "@/lib/db/schema/availability";
import { appUsers } from "@/lib/db/schema/identity";
import { villas, projects as projectsTable } from "@/lib/db/schema/projects";
import { requireOrgId } from "@/features/auth/require-org";

/**
 * V9A — fine-grained responsibility scoping. A scope row narrows a
 * user's actionable surface to a project / villa / category. The pure
 * matcher in `matchesScope` is exported for tests and future task-
 * routing code.
 */

export interface ResponsibilityScopeRow {
  id: string;
  userId: string;
  userFullName: string | null;
  roleKey: string | null;
  projectId: string | null;
  projectName: string | null;
  villaId: string | null;
  villaCode: string | null;
  taskCategory: string | null;
  scopeType: string;
  status: string;
  createdAt: string;
}

export async function listResponsibilityScopes(opts?: {
  userId?: string;
  projectId?: string;
  villaId?: string;
  scopeType?: string;
  status?: string;
}): Promise<ResponsibilityScopeRow[]> {
  const db = getDb();
  if (!db) return [];
  // TENANCY: user_responsibility_scopes has a NOT NULL organization_id — always
  // scope the list to the caller's org so a tenant never sees foreign scopes.
  const organizationId = await requireOrgId();
  const filters = [eq(userResponsibilityScopes.organizationId, organizationId)];
  if (opts?.userId) filters.push(eq(userResponsibilityScopes.userId, opts.userId));
  if (opts?.projectId)
    filters.push(eq(userResponsibilityScopes.projectId, opts.projectId));
  if (opts?.villaId)
    filters.push(eq(userResponsibilityScopes.villaId, opts.villaId));
  if (opts?.scopeType)
    filters.push(eq(userResponsibilityScopes.scopeType, opts.scopeType));
  if (opts?.status)
    filters.push(eq(userResponsibilityScopes.status, opts.status));
  const rows = await db
    .select({
      s: userResponsibilityScopes,
      userFullName: appUsers.fullName,
      projectName: projectsTable.name,
      villaCode: villas.unitCode,
    })
    .from(userResponsibilityScopes)
    .leftJoin(appUsers, eq(appUsers.id, userResponsibilityScopes.userId))
    .leftJoin(projectsTable, eq(projectsTable.id, userResponsibilityScopes.projectId))
    .leftJoin(villas, eq(villas.id, userResponsibilityScopes.villaId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(appUsers.fullName));
  return rows.map((r) => ({
    id: r.s.id,
    userId: r.s.userId,
    userFullName: r.userFullName ?? null,
    roleKey: r.s.roleKey,
    projectId: r.s.projectId,
    projectName: r.projectName ?? null,
    villaId: r.s.villaId,
    villaCode: r.villaCode ?? null,
    taskCategory: r.s.taskCategory,
    scopeType: r.s.scopeType,
    status: r.s.status,
    createdAt: r.s.createdAt.toISOString(),
  }));
}

// Pure helpers re-exported for convenience; canonical home is `./match.ts`.
export {
  matchesScope,
  userHasScopeForTask,
  type ScopeLike,
  type TaskCandidate,
} from "./match";
