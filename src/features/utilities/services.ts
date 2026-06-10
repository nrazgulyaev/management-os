import "server-only";

import { and, asc, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  utilityAccounts,
  utilityReadings,
  utilityPaymentReminders,
} from "@/lib/db/schema/maintenance-intelligence";
import { villas, projects as projectsTable } from "@/lib/db/schema/projects";
import { requireOrgId } from "@/features/auth/require-org";

export interface UtilityAccountRow {
  id: string;
  villaId: string | null;
  villaCode: string | null;
  projectId: string | null;
  projectName: string | null;
  utilityType: string;
  providerName: string | null;
  accountNumber: string | null;
  tokenMeter: boolean;
  billingCycleDay: number | null;
  currency: string;
  averageMonthlyCostMinor: number | null;
  lowBalanceThresholdMinor: number | null;
  criticalBalanceThresholdMinor: number | null;
  status: string;
  notes: string | null;
  createdAt: string;
}

export async function listUtilityAccounts(opts?: {
  villaId?: string;
  utilityType?: string;
  status?: string;
}): Promise<UtilityAccountRow[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const filters = [eq(utilityAccounts.organizationId, organizationId)];
  if (opts?.villaId) filters.push(eq(utilityAccounts.villaId, opts.villaId));
  if (opts?.utilityType)
    filters.push(eq(utilityAccounts.utilityType, opts.utilityType));
  if (opts?.status) filters.push(eq(utilityAccounts.status, opts.status));
  const rows = await db
    .select({
      a: utilityAccounts,
      villaCode: villas.unitCode,
      projectName: projectsTable.name,
    })
    .from(utilityAccounts)
    .leftJoin(villas, eq(villas.id, utilityAccounts.villaId))
    .leftJoin(projectsTable, eq(projectsTable.id, utilityAccounts.projectId))
    .where(and(...filters))
    .orderBy(asc(utilityAccounts.utilityType), asc(villas.unitCode));
  return rows.map((r) => ({
    id: r.a.id,
    villaId: r.a.villaId,
    villaCode: r.villaCode ?? null,
    projectId: r.a.projectId,
    projectName: r.projectName ?? null,
    utilityType: r.a.utilityType,
    providerName: r.a.providerName,
    accountNumber: r.a.accountNumber,
    tokenMeter: r.a.tokenMeter,
    billingCycleDay: r.a.billingCycleDay,
    currency: r.a.currency,
    averageMonthlyCostMinor: r.a.averageMonthlyCostMinor,
    lowBalanceThresholdMinor: r.a.lowBalanceThresholdMinor,
    criticalBalanceThresholdMinor: r.a.criticalBalanceThresholdMinor,
    status: r.a.status,
    notes: r.a.notes,
    createdAt: r.a.createdAt.toISOString(),
  }));
}

export async function getUtilityAccountById(
  id: string,
): Promise<UtilityAccountRow | null> {
  const db = getDb();
  if (!db) return null;
  const organizationId = await requireOrgId();
  const [r] = await db
    .select({
      a: utilityAccounts,
      villaCode: villas.unitCode,
      projectName: projectsTable.name,
    })
    .from(utilityAccounts)
    .leftJoin(villas, eq(villas.id, utilityAccounts.villaId))
    .leftJoin(projectsTable, eq(projectsTable.id, utilityAccounts.projectId))
    .where(
      and(
        eq(utilityAccounts.id, id),
        eq(utilityAccounts.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!r) return null;
  return {
    id: r.a.id,
    villaId: r.a.villaId,
    villaCode: r.villaCode ?? null,
    projectId: r.a.projectId,
    projectName: r.projectName ?? null,
    utilityType: r.a.utilityType,
    providerName: r.a.providerName,
    accountNumber: r.a.accountNumber,
    tokenMeter: r.a.tokenMeter,
    billingCycleDay: r.a.billingCycleDay,
    currency: r.a.currency,
    averageMonthlyCostMinor: r.a.averageMonthlyCostMinor,
    lowBalanceThresholdMinor: r.a.lowBalanceThresholdMinor,
    criticalBalanceThresholdMinor: r.a.criticalBalanceThresholdMinor,
    status: r.a.status,
    notes: r.a.notes,
    createdAt: r.a.createdAt.toISOString(),
  };
}

export async function listUtilityReadings(opts?: {
  utilityAccountId?: string;
  limit?: number;
}) {
  const db = getDb();
  if (!db) return [];
  const filters = [];
  if (opts?.utilityAccountId)
    filters.push(eq(utilityReadings.utilityAccountId, opts.utilityAccountId));
  const rows = await db
    .select({
      r: utilityReadings,
      villaCode: villas.unitCode,
      utilityType: utilityAccounts.utilityType,
    })
    .from(utilityReadings)
    .leftJoin(villas, eq(villas.id, utilityReadings.villaId))
    .leftJoin(utilityAccounts, eq(utilityAccounts.id, utilityReadings.utilityAccountId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(utilityReadings.readingAt))
    .limit(opts?.limit ?? 200);
  return rows.map((r) => ({
    id: r.r.id,
    utilityAccountId: r.r.utilityAccountId,
    villaId: r.r.villaId,
    villaCode: r.villaCode ?? null,
    utilityType: r.utilityType ?? null,
    readingType: r.r.readingType,
    readingValue: r.r.readingValue != null ? Number(r.r.readingValue) : null,
    balanceMinor: r.r.balanceMinor,
    currency: r.r.currency,
    readingAt: r.r.readingAt.toISOString(),
    source: r.r.source,
    notes: r.r.notes,
  }));
}

export async function getLatestReadingForAccount(
  utilityAccountId: string,
): Promise<{
  readingAt: string;
  balanceMinor: number | null;
  readingValue: number | null;
} | null> {
  const db = getDb();
  if (!db) return null;
  const [r] = await db
    .select()
    .from(utilityReadings)
    .where(eq(utilityReadings.utilityAccountId, utilityAccountId))
    .orderBy(desc(utilityReadings.readingAt))
    .limit(1);
  if (!r) return null;
  return {
    readingAt: r.readingAt.toISOString(),
    balanceMinor: r.balanceMinor,
    readingValue: r.readingValue != null ? Number(r.readingValue) : null,
  };
}

export interface OrgMeterReadingRow {
  utilityAccountId: string;
  readingAt: string;
  readingValue: number;
}

/**
 * Org-scoped cumulative meter readings (`reading_type = 'meter'`,
 * non-null value) since `sinceMonths` calendar months ago. Powers
 * the per-villa / per-type spike rollups and the account drill-in
 * 12-month usage trend.
 */
export async function listOrgMeterReadings(opts: {
  sinceMonths: number;
}): Promise<OrgMeterReadingRow[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const cutoff = new Date();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - opts.sinceMonths, 1);
  cutoff.setUTCHours(0, 0, 0, 0);
  const rows = await db
    .select({
      utilityAccountId: utilityReadings.utilityAccountId,
      readingAt: utilityReadings.readingAt,
      readingValue: utilityReadings.readingValue,
    })
    .from(utilityReadings)
    .where(
      and(
        eq(utilityReadings.organizationId, organizationId),
        eq(utilityReadings.readingType, "meter"),
        isNotNull(utilityReadings.readingValue),
        gte(utilityReadings.readingAt, cutoff),
      ),
    )
    .orderBy(asc(utilityReadings.readingAt));
  return rows.map((r) => ({
    utilityAccountId: r.utilityAccountId,
    readingAt: r.readingAt.toISOString(),
    readingValue: Number(r.readingValue),
  }));
}

export interface OrgUtilityBillRow {
  utilityAccountId: string;
  /** YYYY-MM-DD */
  dueDate: string;
  amountMinor: number | null;
  currency: string;
  status: string;
}

/**
 * Org-scoped payment reminders (bills) with a due date in the last
 * `sinceMonths` calendar months. Cancelled reminders are excluded —
 * they are not real spend.
 */
export async function listOrgUtilityBills(opts: {
  sinceMonths: number;
}): Promise<OrgUtilityBillRow[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const cutoff = new Date();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - opts.sinceMonths, 1);
  const cutoffYmd = cutoff.toISOString().slice(0, 10);
  const rows = await db
    .select({
      utilityAccountId: utilityPaymentReminders.utilityAccountId,
      dueDate: utilityPaymentReminders.dueDate,
      amountMinor: utilityPaymentReminders.amountMinor,
      currency: utilityPaymentReminders.currency,
      status: utilityPaymentReminders.status,
    })
    .from(utilityPaymentReminders)
    .where(
      and(
        eq(utilityPaymentReminders.organizationId, organizationId),
        gte(utilityPaymentReminders.dueDate, cutoffYmd),
      ),
    )
    .orderBy(asc(utilityPaymentReminders.dueDate));
  return rows
    .filter((r) => r.status !== "cancelled")
    .map((r) => ({
      utilityAccountId: r.utilityAccountId,
      dueDate: r.dueDate as unknown as string,
      amountMinor: r.amountMinor,
      currency: r.currency,
      status: r.status,
    }));
}

export async function listUtilityPaymentReminders(opts?: {
  status?: string | string[];
  utilityAccountId?: string;
  limit?: number;
}) {
  const db = getDb();
  if (!db) return [];
  const filters = [];
  if (opts?.status) {
    if (Array.isArray(opts.status))
      filters.push(inArray(utilityPaymentReminders.status, opts.status));
    else filters.push(eq(utilityPaymentReminders.status, opts.status));
  }
  if (opts?.utilityAccountId)
    filters.push(
      eq(utilityPaymentReminders.utilityAccountId, opts.utilityAccountId),
    );
  const rows = await db
    .select({
      r: utilityPaymentReminders,
      villaCode: villas.unitCode,
      utilityType: utilityAccounts.utilityType,
    })
    .from(utilityPaymentReminders)
    .leftJoin(villas, eq(villas.id, utilityPaymentReminders.villaId))
    .leftJoin(
      utilityAccounts,
      eq(utilityAccounts.id, utilityPaymentReminders.utilityAccountId),
    )
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(utilityPaymentReminders.dueDate))
    .limit(opts?.limit ?? 200);
  return rows.map((r) => ({
    id: r.r.id,
    utilityAccountId: r.r.utilityAccountId,
    villaId: r.r.villaId,
    villaCode: r.villaCode ?? null,
    utilityType: r.utilityType ?? null,
    dueDate: r.r.dueDate as unknown as string,
    amountMinor: r.r.amountMinor,
    currency: r.r.currency,
    status: r.r.status,
    paidAt: r.r.paidAt?.toISOString() ?? null,
    linkedExpenseLineId: r.r.linkedExpenseLineId,
    notes: r.r.notes,
  }));
}
