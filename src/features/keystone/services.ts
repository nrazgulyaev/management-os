import "server-only";

import { sql, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  onboardingProgress,
  roleAccessOverrides,
} from "@/lib/db/schema/keystone-setup";
import { villas, projects } from "@/lib/db/schema/projects";
import { appUsers } from "@/lib/db/schema/identity";
import { requireOrgId } from "@/features/auth/require-org";
import { cellKey, type OverrideMap } from "./matrix";

/** Live counts that drive the wizard's step completion + "empty system". */
export interface SetupCounts {
  villas: number;
  projects: number;
  teamMembers: number;
  /**
   * Number of persisted role/cabinet access overrides for the org. Drives
   * step-4 ("Configure roles & access") completion: any override means the
   * founder has visited the matrix and tuned at least one cell away from the
   * role default. role_access_overrides carries organization_id directly.
   */
  roleOverrides: number;
}

export async function getSetupCounts(): Promise<SetupCounts> {
  const db = getDb();
  if (!db) return { villas: 0, projects: 0, teamMembers: 0, roleOverrides: 0 };
  // TENANCY: scope every count to the caller's org. Unscoped, a fresh
  // tenant counts ALL orgs' villas/projects/team, so isEmptySystem()
  // returns false and the dashboard skips the zero-state. If the org
  // can't be resolved, return zeros (the dashboard caller treats that
  // as "empty" and shows the guided zero-state instead of leaking).
  let organizationId: string;
  try {
    organizationId = await requireOrgId();
  } catch {
    return { villas: 0, projects: 0, teamMembers: 0, roleOverrides: 0 };
  }
  const countExpr = sql<number>`count(*)::int`;
  const [vRows, pRows, tRows, rRows] = await Promise.all([
    // villas has no organization_id — scope via its project.
    db
      .select({ n: countExpr })
      .from(villas)
      .innerJoin(projects, eq(projects.id, villas.projectId))
      .where(eq(projects.organizationId, organizationId)),
    db
      .select({ n: countExpr })
      .from(projects)
      .where(eq(projects.organizationId, organizationId)),
    db
      .select({ n: countExpr })
      .from(appUsers)
      .where(eq(appUsers.organizationId, organizationId)),
    // role_access_overrides has its own organization_id (keystone-setup).
    db
      .select({ n: countExpr })
      .from(roleAccessOverrides)
      .where(eq(roleAccessOverrides.organizationId, organizationId)),
  ]);
  return {
    villas: vRows[0]?.n ?? 0,
    projects: pRows[0]?.n ?? 0,
    teamMembers: tRows[0]?.n ?? 0,
    roleOverrides: rRows[0]?.n ?? 0,
  };
}

export interface OnboardingProgressRow {
  currentStep: number;
  dismissed: boolean;
  completedAt: Date | null;
}

export async function getOnboardingProgress(
  organizationId: string,
): Promise<OnboardingProgressRow> {
  const db = getDb();
  if (!db) return { currentStep: 0, dismissed: false, completedAt: null };
  const [row] = await db
    .select({
      currentStep: onboardingProgress.currentStep,
      dismissed: onboardingProgress.dismissed,
      completedAt: onboardingProgress.completedAt,
    })
    .from(onboardingProgress)
    .where(eq(onboardingProgress.organizationId, organizationId))
    .limit(1);
  return row ?? { currentStep: 0, dismissed: false, completedAt: null };
}

/** All persisted matrix overrides for an org, as a lookup map. */
export async function getRoleAccessOverrides(
  organizationId: string,
): Promise<OverrideMap> {
  const map: OverrideMap = new Map();
  const db = getDb();
  if (!db) return map;
  const rows = await db
    .select({
      cabinet: roleAccessOverrides.cabinet,
      roleKey: roleAccessOverrides.roleKey,
      canAccess: roleAccessOverrides.canAccess,
    })
    .from(roleAccessOverrides)
    .where(eq(roleAccessOverrides.organizationId, organizationId));
  for (const r of rows) {
    map.set(cellKey(r.cabinet, r.roleKey as Parameters<typeof cellKey>[1]), r.canAccess);
  }
  return map;
}
