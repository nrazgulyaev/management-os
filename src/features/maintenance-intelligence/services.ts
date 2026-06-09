import "server-only";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  maintenanceTemplates,
  villaMaintenancePlans,
  maintenanceWindowSuggestions,
  maintenanceRiskEvents,
  type MaintenanceTemplate,
  type VillaMaintenancePlan,
} from "@/lib/db/schema/maintenance-intelligence";
import { villas, projects as projectsTable } from "@/lib/db/schema/projects";
import { requireOrgId } from "@/features/auth/require-org";

export interface MaintenanceTemplateRow {
  id: string;
  key: string;
  name: string;
  category: string;
  defaultFrequency: string;
  defaultIntervalDays: number | null;
  defaultDurationMinutes: number;
  defaultPriority: string;
  canBeDoneWhileOccupied: boolean;
  guestDisruptionLevel: string;
  requiresVillaEmpty: boolean;
  requiresOwnerVisibility: boolean;
  checklistTemplateId: string | null;
  description: string | null;
  status: string;
}

function mapTemplate(r: MaintenanceTemplate): MaintenanceTemplateRow {
  return {
    id: r.id,
    key: r.key,
    name: r.name,
    category: r.category,
    defaultFrequency: r.defaultFrequency,
    defaultIntervalDays: r.defaultIntervalDays,
    defaultDurationMinutes: r.defaultDurationMinutes,
    defaultPriority: r.defaultPriority,
    canBeDoneWhileOccupied: r.canBeDoneWhileOccupied,
    guestDisruptionLevel: r.guestDisruptionLevel,
    requiresVillaEmpty: r.requiresVillaEmpty,
    requiresOwnerVisibility: r.requiresOwnerVisibility,
    checklistTemplateId: r.checklistTemplateId,
    description: r.description,
    status: r.status,
  };
}

export async function listMaintenanceTemplates(opts?: {
  category?: string;
  status?: string;
}): Promise<MaintenanceTemplateRow[]> {
  const db = getDb();
  if (!db) return [];
  const filters = [];
  if (opts?.category)
    filters.push(eq(maintenanceTemplates.category, opts.category));
  if (opts?.status) filters.push(eq(maintenanceTemplates.status, opts.status));
  const rows = await db
    .select()
    .from(maintenanceTemplates)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(maintenanceTemplates.category), asc(maintenanceTemplates.name));
  return rows.map(mapTemplate);
}

export async function getMaintenanceTemplateById(
  id: string,
): Promise<MaintenanceTemplateRow | null> {
  const db = getDb();
  if (!db) return null;
  const [r] = await db
    .select()
    .from(maintenanceTemplates)
    .where(eq(maintenanceTemplates.id, id))
    .limit(1);
  return r ? mapTemplate(r) : null;
}

// -----------------------------------------------------------------------------
// Plans
// -----------------------------------------------------------------------------

export interface VillaMaintenancePlanRow {
  id: string;
  villaId: string;
  villaCode: string | null;
  projectId: string | null;
  projectName: string | null;
  templateId: string;
  templateName: string | null;
  templateCategory: string | null;
  planName: string;
  frequency: string;
  intervalDays: number | null;
  durationMinutes: number;
  priority: string;
  canBeDoneWhileOccupied: boolean;
  guestDisruptionLevel: string;
  requiresVillaEmpty: boolean;
  preferredWeekdays: unknown;
  avoidWeekdays: unknown;
  preferredTimeWindowStart: string | null;
  preferredTimeWindowEnd: string | null;
  lastCompletedAt: string | null;
  nextDueAt: string | null;
  lastGeneratedTaskId: string | null;
  status: string;
  createdAt: string;
}

function mapPlan(
  r: VillaMaintenancePlan,
  template: { name: string | null; category: string | null },
  villaCode: string | null,
  projectName: string | null,
): VillaMaintenancePlanRow {
  return {
    id: r.id,
    villaId: r.villaId,
    villaCode,
    projectId: r.projectId,
    projectName,
    templateId: r.templateId,
    templateName: template.name,
    templateCategory: template.category,
    planName: r.planName,
    frequency: r.frequency,
    intervalDays: r.intervalDays,
    durationMinutes: r.durationMinutes,
    priority: r.priority,
    canBeDoneWhileOccupied: r.canBeDoneWhileOccupied,
    guestDisruptionLevel: r.guestDisruptionLevel,
    requiresVillaEmpty: r.requiresVillaEmpty,
    preferredWeekdays: r.preferredWeekdays,
    avoidWeekdays: r.avoidWeekdays,
    preferredTimeWindowStart: r.preferredTimeWindowStart as unknown as string | null,
    preferredTimeWindowEnd: r.preferredTimeWindowEnd as unknown as string | null,
    lastCompletedAt: r.lastCompletedAt?.toISOString() ?? null,
    nextDueAt: r.nextDueAt?.toISOString() ?? null,
    lastGeneratedTaskId: r.lastGeneratedTaskId,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function listVillaMaintenancePlans(opts?: {
  villaId?: string;
  projectId?: string;
  status?: string;
  category?: string;
  dueBefore?: Date;
}): Promise<VillaMaintenancePlanRow[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const filters = [eq(villaMaintenancePlans.organizationId, organizationId)];
  if (opts?.villaId) filters.push(eq(villaMaintenancePlans.villaId, opts.villaId));
  if (opts?.projectId)
    filters.push(eq(villaMaintenancePlans.projectId, opts.projectId));
  if (opts?.status) filters.push(eq(villaMaintenancePlans.status, opts.status));
  if (opts?.category)
    filters.push(eq(maintenanceTemplates.category, opts.category));
  if (opts?.dueBefore)
    filters.push(sql`${villaMaintenancePlans.nextDueAt} <= ${opts.dueBefore}`);
  const rows = await db
    .select({
      p: villaMaintenancePlans,
      tName: maintenanceTemplates.name,
      tCategory: maintenanceTemplates.category,
      villaCode: villas.unitCode,
      projectName: projectsTable.name,
    })
    .from(villaMaintenancePlans)
    .leftJoin(
      maintenanceTemplates,
      eq(maintenanceTemplates.id, villaMaintenancePlans.templateId),
    )
    .leftJoin(villas, eq(villas.id, villaMaintenancePlans.villaId))
    .leftJoin(projectsTable, eq(projectsTable.id, villaMaintenancePlans.projectId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(villaMaintenancePlans.nextDueAt));
  return rows.map((r) =>
    mapPlan(
      r.p,
      { name: r.tName ?? null, category: r.tCategory ?? null },
      r.villaCode ?? null,
      r.projectName ?? null,
    ),
  );
}

export async function getVillaMaintenancePlanById(
  id: string,
): Promise<VillaMaintenancePlanRow | null> {
  const db = getDb();
  if (!db) return null;
  const organizationId = await requireOrgId();
  const [r] = await db
    .select({
      p: villaMaintenancePlans,
      tName: maintenanceTemplates.name,
      tCategory: maintenanceTemplates.category,
      villaCode: villas.unitCode,
      projectName: projectsTable.name,
    })
    .from(villaMaintenancePlans)
    .leftJoin(
      maintenanceTemplates,
      eq(maintenanceTemplates.id, villaMaintenancePlans.templateId),
    )
    .leftJoin(villas, eq(villas.id, villaMaintenancePlans.villaId))
    .leftJoin(projectsTable, eq(projectsTable.id, villaMaintenancePlans.projectId))
    .where(
      and(
        eq(villaMaintenancePlans.id, id),
        eq(villaMaintenancePlans.organizationId, organizationId),
      ),
    )
    .limit(1);
  return r
    ? mapPlan(
        r.p,
        { name: r.tName ?? null, category: r.tCategory ?? null },
        r.villaCode ?? null,
        r.projectName ?? null,
      )
    : null;
}

// -----------------------------------------------------------------------------
// Suggestions
// -----------------------------------------------------------------------------

export async function listSuggestionsForPlan(planId: string) {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(maintenanceWindowSuggestions)
    .where(eq(maintenanceWindowSuggestions.villaMaintenancePlanId, planId))
    .orderBy(desc(maintenanceWindowSuggestions.score));
  return rows.map((r) => ({
    id: r.id,
    planId: r.villaMaintenancePlanId,
    villaId: r.villaId,
    suggestedStart: r.suggestedStart.toISOString(),
    suggestedEnd: r.suggestedEnd.toISOString(),
    score: Number(r.score),
    reason: r.reason,
    conflictCount: r.conflictCount,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function listOpenSuggestions(limit = 100) {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({
      s: maintenanceWindowSuggestions,
      villaCode: villas.unitCode,
      planName: villaMaintenancePlans.planName,
      category: maintenanceTemplates.category,
    })
    .from(maintenanceWindowSuggestions)
    .leftJoin(villas, eq(villas.id, maintenanceWindowSuggestions.villaId))
    .leftJoin(
      villaMaintenancePlans,
      eq(villaMaintenancePlans.id, maintenanceWindowSuggestions.villaMaintenancePlanId),
    )
    .leftJoin(
      maintenanceTemplates,
      eq(maintenanceTemplates.id, villaMaintenancePlans.templateId),
    )
    .where(eq(maintenanceWindowSuggestions.status, "suggested"))
    .orderBy(desc(maintenanceWindowSuggestions.score))
    .limit(limit);
  return rows.map((r) => ({
    id: r.s.id,
    planId: r.s.villaMaintenancePlanId,
    villaId: r.s.villaId,
    villaCode: r.villaCode ?? null,
    planName: r.planName ?? null,
    category: r.category ?? null,
    suggestedStart: r.s.suggestedStart.toISOString(),
    suggestedEnd: r.s.suggestedEnd.toISOString(),
    score: Number(r.s.score),
    reason: r.s.reason,
    conflictCount: r.s.conflictCount,
    status: r.s.status,
  }));
}

// -----------------------------------------------------------------------------
// Risk events
// -----------------------------------------------------------------------------

export async function listMaintenanceRiskEvents(opts?: {
  status?: string | string[];
  severity?: string;
  riskType?: string;
  villaId?: string;
  limit?: number;
}) {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const filters = [eq(maintenanceRiskEvents.organizationId, organizationId)];
  if (opts?.status) {
    if (Array.isArray(opts.status))
      filters.push(inArray(maintenanceRiskEvents.status, opts.status));
    else filters.push(eq(maintenanceRiskEvents.status, opts.status));
  }
  if (opts?.severity)
    filters.push(eq(maintenanceRiskEvents.severity, opts.severity));
  if (opts?.riskType)
    filters.push(eq(maintenanceRiskEvents.riskType, opts.riskType));
  if (opts?.villaId)
    filters.push(eq(maintenanceRiskEvents.villaId, opts.villaId));
  const rows = await db
    .select({
      r: maintenanceRiskEvents,
      villaCode: villas.unitCode,
      projectName: projectsTable.name,
    })
    .from(maintenanceRiskEvents)
    .leftJoin(villas, eq(villas.id, maintenanceRiskEvents.villaId))
    .leftJoin(projectsTable, eq(projectsTable.id, maintenanceRiskEvents.projectId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(maintenanceRiskEvents.createdAt))
    .limit(opts?.limit ?? 200);
  return rows.map((r) => ({
    id: r.r.id,
    villaId: r.r.villaId,
    villaCode: r.villaCode ?? null,
    projectId: r.r.projectId,
    projectName: r.projectName ?? null,
    riskType: r.r.riskType,
    severity: r.r.severity,
    title: r.r.title,
    description: r.r.description,
    sourceType: r.r.sourceType,
    sourceId: r.r.sourceId,
    status: r.r.status,
    createdAt: r.r.createdAt.toISOString(),
    resolvedAt: r.r.resolvedAt?.toISOString() ?? null,
  }));
}

// suppress unused warnings
export const _drizzle = { isNull, sql };
