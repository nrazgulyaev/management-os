import "server-only";

import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { crmTasks } from "@/lib/db/schema/crm-tasks";
import { appUsers } from "@/lib/db/schema/identity";
import { getCurrentUserContext } from "@/features/auth/permissions";
import {
  endOfTodayUtc,
  type CrmTaskSubjectType,
  type CrmTaskView,
} from "./types";

/**
 * CRM tasks — read layer. Every query is org-scoped against the caller's
 * resolved org (TENANT-1). Returns empty arrays in demo mode / when the DB
 * is not configured (getDb() may be null) so panels render their empty state
 * instead of throwing.
 */

type Row = typeof crmTasks.$inferSelect;

function toView(row: Row, assigneeName: string | null, creatorName: string | null): CrmTaskView {
  const now = Date.now();
  const due = row.dueAt ? new Date(row.dueAt).getTime() : null;
  const open = row.status === "open";
  return {
    id: row.id,
    subjectType: row.subjectType as CrmTaskSubjectType,
    subjectId: row.subjectId,
    title: row.title,
    body: row.body,
    dueAt: row.dueAt ? new Date(row.dueAt).toISOString() : null,
    priority: (row.priority as CrmTaskView["priority"]) ?? "normal",
    status: open ? "open" : "done",
    assigneeUserId: row.assigneeUserId,
    assigneeName,
    completedAt: row.completedAt ? new Date(row.completedAt).toISOString() : null,
    createdByName: creatorName,
    createdAt: new Date(row.createdAt).toISOString(),
    overdue: open && due !== null && due < now,
    dueToday: open && due !== null && due <= endOfTodayUtc().getTime(),
  };
}

/**
 * All tasks for one CRM record (the <RecordTasks> panel). Open first
 * (by due date, soonest first), then completed (most-recently first).
 */
export async function listTasksForSubject(
  subjectType: CrmTaskSubjectType,
  subjectId: string,
): Promise<CrmTaskView[]> {
  const db = getDb();
  if (!db) return [];

  const ctx = await getCurrentUserContext();
  const orgId = ctx.appUser?.organizationId;
  if (!orgId && ctx.mode !== "demo") return [];

  const rows = await db
    .select({
      task: crmTasks,
      assigneeName: appUsers.fullName,
    })
    .from(crmTasks)
    .leftJoin(appUsers, eq(appUsers.id, crmTasks.assigneeUserId))
    .where(
      and(
        orgId ? eq(crmTasks.organizationId, orgId) : undefined,
        eq(crmTasks.subjectType, subjectType),
        eq(crmTasks.subjectId, subjectId),
      ),
    )
    .orderBy(asc(crmTasks.dueAt), desc(crmTasks.createdAt));

  // Creator names: resolve in a second cheap pass to avoid a double self-join.
  const creatorIds = Array.from(
    new Set(rows.map((r) => r.task.createdByAppUserId).filter((x): x is string => !!x)),
  );
  const creatorNames = await resolveNames(creatorIds);

  const views = rows.map((r) =>
    toView(r.task, r.assigneeName ?? null, r.task.createdByAppUserId ? creatorNames.get(r.task.createdByAppUserId) ?? null : null),
  );

  // Open before done; within each, soonest due first.
  return views.sort((a, b) => {
    if (a.status !== b.status) return a.status === "open" ? -1 : 1;
    const ad = a.dueAt ? Date.parse(a.dueAt) : Number.MAX_SAFE_INTEGER;
    const bd = b.dueAt ? Date.parse(b.dueAt) : Number.MAX_SAFE_INTEGER;
    return ad - bd;
  });
}

async function resolveNames(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const db = getDb();
  if (!db) return out;
  const rows = await db
    .select({ id: appUsers.id, fullName: appUsers.fullName })
    .from(appUsers)
    .where(inArray(appUsers.id, ids));
  for (const r of rows) out.set(r.id, r.fullName);
  return out;
}

export interface MyTasksView {
  overdue: CrmTaskView[];
  today: CrmTaskView[];
  upcoming: CrmTaskView[];
  total: number;
}

/**
 * "My tasks" — the current user's OPEN tasks, bucketed into overdue /
 * due-today / upcoming. If the caller has no app_user (demo / anonymous),
 * returns empty buckets.
 */
export async function listMyOpenTasks(): Promise<MyTasksView> {
  const empty: MyTasksView = { overdue: [], today: [], upcoming: [], total: 0 };
  const db = getDb();
  if (!db) return empty;

  const ctx = await getCurrentUserContext();
  const orgId = ctx.appUser?.organizationId;
  const userId = ctx.appUser?.id;
  if (!orgId || !userId) return empty;

  const rows = await db
    .select({ task: crmTasks, assigneeName: appUsers.fullName })
    .from(crmTasks)
    .leftJoin(appUsers, eq(appUsers.id, crmTasks.assigneeUserId))
    .where(
      and(
        eq(crmTasks.organizationId, orgId),
        eq(crmTasks.assigneeUserId, userId),
        eq(crmTasks.status, "open"),
      ),
    )
    .orderBy(asc(crmTasks.dueAt), desc(crmTasks.createdAt));

  const eod = endOfTodayUtc().getTime();
  const now = Date.now();
  const overdue: CrmTaskView[] = [];
  const today: CrmTaskView[] = [];
  const upcoming: CrmTaskView[] = [];

  for (const r of rows) {
    const v = toView(r.task, r.assigneeName ?? null, null);
    const due = v.dueAt ? Date.parse(v.dueAt) : null;
    if (due !== null && due < now) overdue.push(v);
    else if (due !== null && due <= eod) today.push(v);
    else upcoming.push(v);
  }

  return {
    overdue,
    today,
    upcoming,
    total: overdue.length + today.length + upcoming.length,
  };
}

/**
 * Org-wide due-today feed (all assignees + unassigned). Used by the
 * "Team queue" tab on /dashboard/tasks for managers.
 */
export async function listOrgDueTasks(limit = 100): Promise<CrmTaskView[]> {
  const db = getDb();
  if (!db) return [];

  const ctx = await getCurrentUserContext();
  const orgId = ctx.appUser?.organizationId;
  if (!orgId) return [];

  const eod = endOfTodayUtc();
  const rows = await db
    .select({ task: crmTasks, assigneeName: appUsers.fullName })
    .from(crmTasks)
    .leftJoin(appUsers, eq(appUsers.id, crmTasks.assigneeUserId))
    .where(
      and(
        eq(crmTasks.organizationId, orgId),
        eq(crmTasks.status, "open"),
        lte(crmTasks.dueAt, eod),
      ),
    )
    .orderBy(asc(crmTasks.dueAt))
    .limit(limit);

  return rows.map((r) => toView(r.task, r.assigneeName ?? null, null));
}

/**
 * Lightweight assignable-users list for the create/reassign pickers.
 * Internal users only, name-ordered. Org-scoped.
 */
export async function listAssignableUsers(): Promise<
  { id: string; name: string }[]
> {
  const db = getDb();
  if (!db) return [];
  const ctx = await getCurrentUserContext();
  const orgId = ctx.appUser?.organizationId;
  if (!orgId) return [];

  const rows = await db
    .select({ id: appUsers.id, name: appUsers.fullName, status: appUsers.status })
    .from(appUsers)
    .where(eq(appUsers.organizationId, orgId))
    .orderBy(asc(appUsers.fullName));

  return rows
    .filter((r) => r.status === "active" || r.status === "invited")
    .map((r) => ({ id: r.id, name: r.name }));
}
