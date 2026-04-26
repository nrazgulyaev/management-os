import "server-only";

import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  checklistTemplateItems,
  checklistTemplates,
  damageReports,
  maintenanceTickets,
  operationTaskTypes,
  operationTasks,
  preventiveSchedules,
  serviceRequests,
  taskChecklistItems,
  taskChecklists,
} from "@/lib/db/schema/operations";
import { villas, projects as projectsTable } from "@/lib/db/schema/projects";
import { appUsers } from "@/lib/db/schema/identity";
import { getCurrentAppUser } from "@/features/auth/current-user";
import type { WithSource } from "@/features/types";
import { todayYmd } from "./scheduling";

// -----------------------------------------------------------------------------
// Row types — narrow DB inserts/selects into UI-friendly shapes.
// -----------------------------------------------------------------------------

export interface OperationTaskRow {
  id: string;
  taskCode: string;
  title: string;
  description: string | null;
  category: string;
  priority: string;
  status: string;
  /** task.source ("manual" | "booking" | "guest" | "preventive" | ...) — renamed
   * to avoid collision with WithSource<T>.source ("db" | "mock"). */
  taskSource: string;
  villaId: string | null;
  villaCode: string | null;
  projectId: string | null;
  projectName: string | null;
  assignedTo: string | null;
  assignedToName: string | null;
  scheduledFor: string | null;
  dueAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  approvedAt: string | null;
  estimatedMinutes: number | null;
  actualMinutes: number | null;
  internalNotes: string | null;
  ownerVisible: boolean;
  guestVisible: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceTicketRow {
  id: string;
  ticketCode: string;
  title: string;
  description: string | null;
  issueCategory: string;
  severity: string;
  status: string;
  villaId: string | null;
  villaCode: string | null;
  projectId: string | null;
  ownerChargeable: boolean;
  estimatedCostMinor: bigint | null;
  actualCostMinor: bigint | null;
  currency: string | null;
  reportedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
}

export interface PreventiveScheduleRow {
  id: string;
  name: string;
  category: string;
  frequency: string;
  intervalDays: number | null;
  nextDueOn: string;
  lastGeneratedOn: string | null;
  priority: string;
  status: string;
  villaId: string | null;
  villaCode: string | null;
  projectId: string | null;
  projectName: string | null;
  checklistTemplateId: string | null;
  assignedTo: string | null;
  assignedToName: string | null;
}

export interface ServiceRequestRow {
  id: string;
  requestCode: string;
  title: string;
  message: string | null;
  requestType: string;
  status: string;
  priority: string;
  preferredTime: string | null;
  villaId: string | null;
  villaCode: string | null;
  bookingId: string | null;
  guestId: string | null;
  taskId: string | null;
  createdAt: string;
}

export interface DamageReportRow {
  id: string;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  villaId: string | null;
  villaCode: string | null;
  estimatedCostMinor: bigint | null;
  actualCostMinor: bigint | null;
  currency: string | null;
  ownerChargeable: boolean;
  guestChargeable: boolean;
  createdAt: string;
}

export interface ChecklistTemplateRow {
  id: string;
  key: string;
  name: string;
  category: string;
  description: string | null;
  villaType: string | null;
  itemCount: number;
}

export interface TaskChecklistItemRow {
  id: string;
  section: string;
  label: string;
  itemType: string;
  isRequired: boolean;
  sortOrder: number;
  status: string;
  valueText: string | null;
  valueNumber: string | null;
  photoRequired: boolean;
  notes: string | null;
}

export interface TaskChecklistRow {
  id: string;
  taskId: string;
  templateId: string | null;
  status: string;
  completedAt: string | null;
  approvedAt: string | null;
  items: TaskChecklistItemRow[];
}

// -----------------------------------------------------------------------------
// Operation tasks
// -----------------------------------------------------------------------------

export interface ListOperationTaskFilters {
  status?: string | string[];
  category?: string | string[];
  villaId?: string;
  projectId?: string;
  assignedTo?: string;
  scheduledFor?: string;
  scheduledOnOrBefore?: string;
  priority?: string;
  limit?: number;
}

export async function listOperationTasks(
  filters: ListOperationTaskFilters = {},
): Promise<WithSource<OperationTaskRow>[]> {
  const db = getDb();
  if (!db) return [];
  const where = buildTaskFilter(filters);

  const rows = await db
    .select({
      t: operationTasks,
      villaCode: villas.unitCode,
      projectName: projectsTable.name,
      assignedName: appUsers.fullName,
    })
    .from(operationTasks)
    .leftJoin(villas, eq(villas.id, operationTasks.villaId))
    .leftJoin(projectsTable, eq(projectsTable.id, operationTasks.projectId))
    .leftJoin(appUsers, eq(appUsers.id, operationTasks.assignedTo))
    .where(where)
    .orderBy(asc(operationTasks.scheduledFor), desc(operationTasks.priority), desc(operationTasks.createdAt))
    .limit(filters.limit ?? 200);

  return rows.map((r) => ({ source: "db" as const, ...mapTaskRow(r) }));
}

export async function getOperationTaskById(id: string): Promise<WithSource<OperationTaskRow> | null> {
  const db = getDb();
  if (!db) return null;
  const [r] = await db
    .select({
      t: operationTasks,
      villaCode: villas.unitCode,
      projectName: projectsTable.name,
      assignedName: appUsers.fullName,
    })
    .from(operationTasks)
    .leftJoin(villas, eq(villas.id, operationTasks.villaId))
    .leftJoin(projectsTable, eq(projectsTable.id, operationTasks.projectId))
    .leftJoin(appUsers, eq(appUsers.id, operationTasks.assignedTo))
    .where(eq(operationTasks.id, id))
    .limit(1);
  if (!r) return null;
  return { source: "db" as const, ...mapTaskRow(r) };
}

export async function listTodayTasks(): Promise<WithSource<OperationTaskRow>[]> {
  return listOperationTasks({ scheduledOnOrBefore: todayYmd() });
}

/**
 * Tasks assigned to the currently authenticated app_user. Returns [] when
 * there's no DB or no signed-in app_user.
 */
export async function listTasksForCurrentStaff(): Promise<WithSource<OperationTaskRow>[]> {
  const me = await getCurrentAppUser();
  if (!me) return [];
  return listOperationTasks({ assignedTo: me.id });
}

// -----------------------------------------------------------------------------
// Maintenance tickets
// -----------------------------------------------------------------------------

export async function listMaintenanceTickets(opts?: {
  status?: string;
  villaId?: string;
  limit?: number;
}): Promise<WithSource<MaintenanceTicketRow>[]> {
  const db = getDb();
  if (!db) return [];
  const filters = [];
  if (opts?.status) filters.push(eq(maintenanceTickets.status, opts.status));
  if (opts?.villaId) filters.push(eq(maintenanceTickets.villaId, opts.villaId));

  const rows = await db
    .select({ m: maintenanceTickets, villaCode: villas.unitCode })
    .from(maintenanceTickets)
    .leftJoin(villas, eq(villas.id, maintenanceTickets.villaId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(maintenanceTickets.reportedAt))
    .limit(opts?.limit ?? 200);

  return rows.map((r) => ({
    source: "db" as const,
    id: r.m.id,
    ticketCode: r.m.ticketCode,
    title: r.m.title,
    description: r.m.description,
    issueCategory: r.m.issueCategory,
    severity: r.m.severity,
    status: r.m.status,
    villaId: r.m.villaId,
    villaCode: r.villaCode ?? null,
    projectId: r.m.projectId,
    ownerChargeable: r.m.ownerChargeable,
    estimatedCostMinor: r.m.estimatedCostMinor,
    actualCostMinor: r.m.actualCostMinor,
    currency: r.m.currency,
    reportedAt: r.m.reportedAt.toISOString(),
    resolvedAt: r.m.resolvedAt?.toISOString() ?? null,
    closedAt: r.m.closedAt?.toISOString() ?? null,
  }));
}

export async function getMaintenanceTicketById(
  id: string,
): Promise<WithSource<MaintenanceTicketRow> | null> {
  const db = getDb();
  if (!db) return null;
  const [r] = await db
    .select({ m: maintenanceTickets, villaCode: villas.unitCode })
    .from(maintenanceTickets)
    .leftJoin(villas, eq(villas.id, maintenanceTickets.villaId))
    .where(eq(maintenanceTickets.id, id))
    .limit(1);
  if (!r) return null;
  return {
    source: "db" as const,
    id: r.m.id,
    ticketCode: r.m.ticketCode,
    title: r.m.title,
    description: r.m.description,
    issueCategory: r.m.issueCategory,
    severity: r.m.severity,
    status: r.m.status,
    villaId: r.m.villaId,
    villaCode: r.villaCode ?? null,
    projectId: r.m.projectId,
    ownerChargeable: r.m.ownerChargeable,
    estimatedCostMinor: r.m.estimatedCostMinor,
    actualCostMinor: r.m.actualCostMinor,
    currency: r.m.currency,
    reportedAt: r.m.reportedAt.toISOString(),
    resolvedAt: r.m.resolvedAt?.toISOString() ?? null,
    closedAt: r.m.closedAt?.toISOString() ?? null,
  };
}

// -----------------------------------------------------------------------------
// Preventive schedules
// -----------------------------------------------------------------------------

export async function listPreventiveSchedules(opts?: {
  dueOnOrBefore?: string;
  status?: string;
  limit?: number;
}): Promise<WithSource<PreventiveScheduleRow>[]> {
  const db = getDb();
  if (!db) return [];
  const filters = [];
  if (opts?.dueOnOrBefore) filters.push(lte(preventiveSchedules.nextDueOn, opts.dueOnOrBefore));
  if (opts?.status) filters.push(eq(preventiveSchedules.status, opts.status));

  const rows = await db
    .select({
      s: preventiveSchedules,
      villaCode: villas.unitCode,
      projectName: projectsTable.name,
      assignedName: appUsers.fullName,
    })
    .from(preventiveSchedules)
    .leftJoin(villas, eq(villas.id, preventiveSchedules.villaId))
    .leftJoin(projectsTable, eq(projectsTable.id, preventiveSchedules.projectId))
    .leftJoin(appUsers, eq(appUsers.id, preventiveSchedules.assignedTo))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(preventiveSchedules.nextDueOn))
    .limit(opts?.limit ?? 200);

  return rows.map((r) => ({
    source: "db" as const,
    id: r.s.id,
    name: r.s.name,
    category: r.s.category,
    frequency: r.s.frequency,
    intervalDays: r.s.intervalDays,
    nextDueOn: r.s.nextDueOn,
    lastGeneratedOn: r.s.lastGeneratedOn,
    priority: r.s.priority,
    status: r.s.status,
    villaId: r.s.villaId,
    villaCode: r.villaCode ?? null,
    projectId: r.s.projectId,
    projectName: r.projectName ?? null,
    checklistTemplateId: r.s.checklistTemplateId,
    assignedTo: r.s.assignedTo,
    assignedToName: r.assignedName ?? null,
  }));
}

// -----------------------------------------------------------------------------
// Service requests + damage reports
// -----------------------------------------------------------------------------

export async function listServiceRequests(opts?: {
  status?: string;
  villaId?: string;
  limit?: number;
}): Promise<WithSource<ServiceRequestRow>[]> {
  const db = getDb();
  if (!db) return [];
  const filters = [];
  if (opts?.status) filters.push(eq(serviceRequests.status, opts.status));
  if (opts?.villaId) filters.push(eq(serviceRequests.villaId, opts.villaId));

  const rows = await db
    .select({ s: serviceRequests, villaCode: villas.unitCode })
    .from(serviceRequests)
    .leftJoin(villas, eq(villas.id, serviceRequests.villaId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(serviceRequests.createdAt))
    .limit(opts?.limit ?? 200);

  return rows.map((r) => ({
    source: "db" as const,
    id: r.s.id,
    requestCode: r.s.requestCode,
    title: r.s.title,
    message: r.s.message,
    requestType: r.s.requestType,
    status: r.s.status,
    priority: r.s.priority,
    preferredTime: r.s.preferredTime?.toISOString() ?? null,
    villaId: r.s.villaId,
    villaCode: r.villaCode ?? null,
    bookingId: r.s.bookingId,
    guestId: r.s.guestId,
    taskId: r.s.taskId,
    createdAt: r.s.createdAt.toISOString(),
  }));
}

export async function listDamageReports(opts?: {
  status?: string;
  villaId?: string;
  limit?: number;
}): Promise<WithSource<DamageReportRow>[]> {
  const db = getDb();
  if (!db) return [];
  const filters = [];
  if (opts?.status) filters.push(eq(damageReports.status, opts.status));
  if (opts?.villaId) filters.push(eq(damageReports.villaId, opts.villaId));

  const rows = await db
    .select({ d: damageReports, villaCode: villas.unitCode })
    .from(damageReports)
    .leftJoin(villas, eq(villas.id, damageReports.villaId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(damageReports.createdAt))
    .limit(opts?.limit ?? 200);

  return rows.map((r) => ({
    source: "db" as const,
    id: r.d.id,
    title: r.d.title,
    description: r.d.description,
    severity: r.d.severity,
    status: r.d.status,
    villaId: r.d.villaId,
    villaCode: r.villaCode ?? null,
    estimatedCostMinor: r.d.estimatedCostMinor,
    actualCostMinor: r.d.actualCostMinor,
    currency: r.d.currency,
    ownerChargeable: r.d.ownerChargeable,
    guestChargeable: r.d.guestChargeable,
    createdAt: r.d.createdAt.toISOString(),
  }));
}

// -----------------------------------------------------------------------------
// Checklist queries
// -----------------------------------------------------------------------------

export async function listChecklistTemplates(): Promise<WithSource<ChecklistTemplateRow>[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({
      t: checklistTemplates,
      itemCount: sql<number>`count(${checklistTemplateItems.id})`.as("item_count"),
    })
    .from(checklistTemplates)
    .leftJoin(checklistTemplateItems, eq(checklistTemplateItems.templateId, checklistTemplates.id))
    .where(eq(checklistTemplates.status, "active"))
    .groupBy(checklistTemplates.id)
    .orderBy(asc(checklistTemplates.name));

  return rows.map((r) => ({
    source: "db" as const,
    id: r.t.id,
    key: r.t.key,
    name: r.t.name,
    category: r.t.category,
    description: r.t.description,
    villaType: r.t.villaType,
    itemCount: Number(r.itemCount ?? 0),
  }));
}

export async function getTaskChecklist(taskId: string): Promise<TaskChecklistRow | null> {
  const db = getDb();
  if (!db) return null;
  const [c] = await db
    .select()
    .from(taskChecklists)
    .where(eq(taskChecklists.taskId, taskId))
    .orderBy(desc(taskChecklists.createdAt))
    .limit(1);
  if (!c) return null;
  const items = await db
    .select()
    .from(taskChecklistItems)
    .where(eq(taskChecklistItems.checklistId, c.id))
    .orderBy(asc(taskChecklistItems.sortOrder));
  return {
    id: c.id,
    taskId: c.taskId,
    templateId: c.templateId,
    status: c.status,
    completedAt: c.completedAt?.toISOString() ?? null,
    approvedAt: c.approvedAt?.toISOString() ?? null,
    items: items.map((i) => ({
      id: i.id,
      section: i.section,
      label: i.label,
      itemType: i.itemType,
      isRequired: i.isRequired,
      sortOrder: i.sortOrder,
      status: i.status,
      valueText: i.valueText,
      valueNumber: i.valueNumber === null ? null : String(i.valueNumber),
      photoRequired: i.photoRequired,
      notes: i.notes,
    })),
  };
}

// -----------------------------------------------------------------------------
// Operations metrics — quick aggregate counts for the dashboard
// -----------------------------------------------------------------------------

export interface OperationsMetrics {
  open: number;
  inProgress: number;
  needsReview: number;
  urgent: number;
  dueToday: number;
  housekeeping: number;
  maintenance: number;
  pendingMaintenanceTickets: number;
  newServiceRequests: number;
  preventiveDue: number;
}

export async function getOperationsMetrics(): Promise<OperationsMetrics> {
  const db = getDb();
  const empty: OperationsMetrics = {
    open: 0,
    inProgress: 0,
    needsReview: 0,
    urgent: 0,
    dueToday: 0,
    housekeeping: 0,
    maintenance: 0,
    pendingMaintenanceTickets: 0,
    newServiceRequests: 0,
    preventiveDue: 0,
  };
  if (!db) return empty;

  const today = todayYmd();
  const [taskAgg] = await db
    .select({
      open: sql<number>`count(*) filter (where ${operationTasks.status} = 'open')`.as("open"),
      inProgress: sql<number>`count(*) filter (where ${operationTasks.status} = 'in_progress')`.as(
        "in_progress",
      ),
      needsReview: sql<number>`count(*) filter (where ${operationTasks.status} = 'needs_review')`.as(
        "needs_review",
      ),
      urgent: sql<number>`count(*) filter (where ${operationTasks.priority} = 'urgent' and ${operationTasks.status} not in ('completed','approved','cancelled'))`.as(
        "urgent",
      ),
      dueToday: sql<number>`count(*) filter (where ${operationTasks.scheduledFor} = ${today}::date and ${operationTasks.status} not in ('completed','approved','cancelled'))`.as(
        "due_today",
      ),
      housekeeping: sql<number>`count(*) filter (where ${operationTasks.category} = 'housekeeping' and ${operationTasks.status} not in ('completed','approved','cancelled'))`.as(
        "housekeeping",
      ),
      maintenance: sql<number>`count(*) filter (where ${operationTasks.category} = 'maintenance' and ${operationTasks.status} not in ('completed','approved','cancelled'))`.as(
        "maintenance",
      ),
    })
    .from(operationTasks);

  const [mtAgg] = await db
    .select({
      pending: sql<number>`count(*) filter (where ${maintenanceTickets.status} not in ('resolved','closed','cancelled'))`.as(
        "pending",
      ),
    })
    .from(maintenanceTickets);

  const [srAgg] = await db
    .select({
      newCount: sql<number>`count(*) filter (where ${serviceRequests.status} = 'new')`.as(
        "new_count",
      ),
    })
    .from(serviceRequests);

  const [prevAgg] = await db
    .select({
      due: sql<number>`count(*) filter (where ${preventiveSchedules.nextDueOn} <= ${today}::date and ${preventiveSchedules.status} = 'active')`.as(
        "due",
      ),
    })
    .from(preventiveSchedules);

  return {
    open: Number(taskAgg?.open ?? 0),
    inProgress: Number(taskAgg?.inProgress ?? 0),
    needsReview: Number(taskAgg?.needsReview ?? 0),
    urgent: Number(taskAgg?.urgent ?? 0),
    dueToday: Number(taskAgg?.dueToday ?? 0),
    housekeeping: Number(taskAgg?.housekeeping ?? 0),
    maintenance: Number(taskAgg?.maintenance ?? 0),
    pendingMaintenanceTickets: Number(mtAgg?.pending ?? 0),
    newServiceRequests: Number(srAgg?.newCount ?? 0),
    preventiveDue: Number(prevAgg?.due ?? 0),
  };
}

// -----------------------------------------------------------------------------
// Day-counter helpers used by the action layer to mint task codes.
// -----------------------------------------------------------------------------

export async function nextDailyCounter(prefix: "OPS" | "MNT" | "SR"): Promise<number> {
  const db = getDb();
  if (!db) return 1;
  const today = todayYmd();
  const ymd = today.replace(/-/g, "");
  const pattern = `${prefix}-${ymd}-%`;
  if (prefix === "OPS") {
    const [r] = await db
      .select({ count: sql<number>`count(*)` })
      .from(operationTasks)
      .where(sql`${operationTasks.taskCode} like ${pattern}`);
    return Number(r?.count ?? 0) + 1;
  }
  if (prefix === "MNT") {
    const [r] = await db
      .select({ count: sql<number>`count(*)` })
      .from(maintenanceTickets)
      .where(sql`${maintenanceTickets.ticketCode} like ${pattern}`);
    return Number(r?.count ?? 0) + 1;
  }
  const [r] = await db
    .select({ count: sql<number>`count(*)` })
    .from(serviceRequests)
    .where(sql`${serviceRequests.requestCode} like ${pattern}`);
  return Number(r?.count ?? 0) + 1;
}

// -----------------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------------

function buildTaskFilter(f: ListOperationTaskFilters) {
  const filters = [];
  if (Array.isArray(f.status)) {
    if (f.status.length) filters.push(inArray(operationTasks.status, f.status));
  } else if (f.status) {
    filters.push(eq(operationTasks.status, f.status));
  }
  if (Array.isArray(f.category)) {
    if (f.category.length) filters.push(inArray(operationTasks.category, f.category));
  } else if (f.category) {
    filters.push(eq(operationTasks.category, f.category));
  }
  if (f.villaId) filters.push(eq(operationTasks.villaId, f.villaId));
  if (f.projectId) filters.push(eq(operationTasks.projectId, f.projectId));
  if (f.assignedTo) filters.push(eq(operationTasks.assignedTo, f.assignedTo));
  if (f.priority) filters.push(eq(operationTasks.priority, f.priority));
  if (f.scheduledFor) filters.push(eq(operationTasks.scheduledFor, f.scheduledFor));
  if (f.scheduledOnOrBefore)
    filters.push(
      or(
        lte(operationTasks.scheduledFor, f.scheduledOnOrBefore),
        isNull(operationTasks.scheduledFor),
      ),
    );
  return filters.length ? and(...filters) : undefined;
}

function mapTaskRow(r: {
  t: typeof operationTasks.$inferSelect;
  villaCode: string | null;
  projectName: string | null;
  assignedName: string | null;
}): OperationTaskRow {
  return {
    id: r.t.id,
    taskCode: r.t.taskCode,
    title: r.t.title,
    description: r.t.description,
    category: r.t.category,
    priority: r.t.priority,
    status: r.t.status,
    taskSource: r.t.source,
    villaId: r.t.villaId,
    villaCode: r.villaCode ?? null,
    projectId: r.t.projectId,
    projectName: r.projectName ?? null,
    assignedTo: r.t.assignedTo,
    assignedToName: r.assignedName ?? null,
    scheduledFor: r.t.scheduledFor,
    dueAt: r.t.dueAt?.toISOString() ?? null,
    startedAt: r.t.startedAt?.toISOString() ?? null,
    completedAt: r.t.completedAt?.toISOString() ?? null,
    approvedAt: r.t.approvedAt?.toISOString() ?? null,
    estimatedMinutes: r.t.estimatedMinutes,
    actualMinutes: r.t.actualMinutes,
    internalNotes: r.t.internalNotes,
    ownerVisible: r.t.ownerVisible,
    guestVisible: r.t.guestVisible,
    createdAt: r.t.createdAt.toISOString(),
    updatedAt: r.t.updatedAt.toISOString(),
  };
}

// Eslint hint: `operationTaskTypes` import is intentionally surfaced for
// downstream callers (server actions). Touching it here keeps the import
// alive without a side-effect.
export const __taskTypesTable = operationTaskTypes;
