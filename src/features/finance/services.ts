import "server-only";

import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import {
  expenseLines,
  feeLines,
  managementFeeRules,
  ownerStatements,
  payoutBatches,
  payoutLines,
  reserveMovements,
  revenueLines,
  statementLines,
  statementPeriods,
  taxLines,
} from "@/lib/db/schema/finance";
import { villas, projects } from "@/lib/db/schema/projects";
import { owners } from "@/lib/db/schema/ownership";
import type { WithSource } from "@/features/types";
import type { OwnerStatementState } from "@/features/owner-statements/state-machine";

// -----------------------------------------------------------------------------
// Common row shapes
// -----------------------------------------------------------------------------

export interface RevenueLineRow {
  id: string;
  bookingId: string | null;
  villaId: string | null;
  villaCode: string | null;
  projectId: string | null;
  projectName: string | null;
  ownerId: string | null;
  revenueType: string;
  description: string;
  amountMinor: bigint;
  currency: string;
  serviceDate: string | null;
  status: "draft" | "posted" | "voided" | "reversed";
  /** Where the row originated (manual / booking / import / adjustment). */
  origin: string;
}

export interface FeeLineRow {
  id: string;
  bookingId: string | null;
  villaId: string | null;
  villaCode: string | null;
  feeType: string;
  description: string;
  amountMinor: bigint;
  currency: string;
  feeDate: string | null;
  status: "draft" | "posted" | "voided" | "reversed";
}

export interface ExpenseLineRow {
  id: string;
  villaId: string | null;
  villaCode: string | null;
  projectId: string | null;
  projectName: string | null;
  expenseType: string;
  description: string;
  amountMinor: bigint;
  currency: string;
  expenseDate: string;
  allocationScope: string;
  capitalized: boolean;
  ownerChargeable: boolean;
  status: "draft" | "posted" | "voided" | "reversed";
}

export interface TaxLineRow {
  id: string;
  villaId: string | null;
  taxType: string;
  description: string;
  amountMinor: bigint;
  currency: string;
  taxDate: string;
  ownerVisible: boolean;
  status: string;
}

export interface ReserveMovementRow {
  id: string;
  villaId: string | null;
  projectId: string | null;
  reserveType: string;
  movementType: "contribution" | "release" | "adjustment";
  description: string;
  amountMinor: bigint;
  currency: string;
  movementDate: string;
  status: string;
}

export interface ManagementFeeRuleRow {
  id: string;
  ruleName: string;
  feeModel: string;
  feePercent: number | null;
  fixedAmountMinor: bigint | null;
  currency: string | null;
  startsOn: string;
  endsOn: string | null;
  status: string;
  villaId: string | null;
  projectId: string | null;
}

export interface PeriodRow {
  id: string;
  periodStart: string;
  periodEnd: string;
  label: string;
  status: "open" | "closing" | "closed" | "locked";
  closedAt: string | null;
  lockedAt: string | null;
}

export interface OwnerStatementRow {
  id: string;
  ownerId: string;
  ownerName: string;
  villaId: string | null;
  villaCode: string | null;
  projectId: string | null;
  projectName: string | null;
  periodId: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  statementCode: string;
  managementModel: "individual" | "pooled" | "hybrid";
  currency: string;
  grossRevenueMinor: bigint;
  totalFeesMinor: bigint;
  totalExpensesMinor: bigint;
  totalTaxesMinor: bigint;
  totalReservesMinor: bigint;
  managementFeeMinor: bigint;
  netPayoutMinor: bigint;
  occupancyRate: number | null;
  adrMinor: bigint | null;
  revparMinor: bigint | null;
  status: "draft" | "issued" | "approved" | "paid" | "voided";
  /** Owner-side lifecycle state (FC-OWNER-STATEMENTS) — drives the Mgmt list's owner column. */
  ownerState: OwnerStatementState;
  issuedAt: string | null;
  createdAt: string;
}

export interface StatementLineRow {
  id: string;
  statementId: string;
  lineType: "revenue" | "fee" | "expense" | "tax" | "reserve" | "management_fee" | "payout" | "adjustment";
  category: string;
  description: string;
  amountMinor: bigint;
  currency: string;
  ownerVisible: boolean;
  sortOrder: number;
  sourceTable: string | null;
  sourceId: string | null;
}

export interface PayoutBatchRow {
  id: string;
  batchCode: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  status: "draft" | "approved" | "paid" | "cancelled";
  totalAmountMinor: bigint;
  lineCount: number;
  approvedAt: string | null;
  paidAt: string | null;
}

export interface PayoutLineRow {
  id: string;
  payoutBatchId: string | null;
  ownerId: string;
  ownerName: string;
  amountMinor: bigint;
  currency: string;
  status: "pending" | "approved" | "paid" | "failed" | "cancelled";
  reference: string | null;
  scheduledFor: string | null;
  paidAt: string | null;
  statementId: string | null;
}

// -----------------------------------------------------------------------------
// Read services
// -----------------------------------------------------------------------------

const empty: WithSource<never>[] = [];

export async function listRevenueLines(opts?: {
  villaId?: string;
  periodStart?: string;
  periodEnd?: string;
}): Promise<WithSource<RevenueLineRow>[]> {
  const db = getDb();
  if (!db) return empty as unknown as WithSource<RevenueLineRow>[];

  // TENANCY-FINANCE — revenue_lines has no organization_id. Anchor org via the
  // row's villa (→ its project) or its own project_id, requiring COALESCE = org.
  // Rows with neither anchor cannot be scoped and are excluded.
  const organizationId = await requireOrgId();
  const villaProject = alias(projects, "villa_project_rev");

  const filters = [eq(revenueLines.status, "posted")];
  if (opts?.villaId) filters.push(eq(revenueLines.villaId, opts.villaId));
  if (opts?.periodStart) filters.push(gte(revenueLines.serviceDate, opts.periodStart));
  if (opts?.periodEnd) filters.push(lte(revenueLines.serviceDate, opts.periodEnd));
  filters.push(
    sql`COALESCE(${villaProject.organizationId}, ${projects.organizationId}) = ${organizationId}`,
  );

  const rows = await db
    .select({
      r: revenueLines,
      villaCode: villas.unitCode,
      projectName: projects.name,
    })
    .from(revenueLines)
    .leftJoin(villas, eq(villas.id, revenueLines.villaId))
    .leftJoin(villaProject, eq(villaProject.id, villas.projectId))
    .leftJoin(projects, eq(projects.id, revenueLines.projectId))
    .where(and(...filters))
    .orderBy(desc(revenueLines.serviceDate), desc(revenueLines.createdAt));

  return rows.map((row) => ({
    source: "db" as const,
    id: row.r.id,
    bookingId: row.r.bookingId,
    villaId: row.r.villaId,
    villaCode: row.villaCode ?? null,
    projectId: row.r.projectId,
    projectName: row.projectName ?? null,
    ownerId: row.r.ownerId,
    revenueType: row.r.revenueType,
    description: row.r.description,
    amountMinor: BigInt(row.r.amountMinor),
    currency: row.r.currency,
    serviceDate: row.r.serviceDate,
    status: row.r.status as RevenueLineRow["status"],
    origin: row.r.source,
  }));
}

export async function listFeeLines(opts?: { villaId?: string }): Promise<WithSource<FeeLineRow>[]> {
  const db = getDb();
  if (!db) return [];
  // TENANCY-FINANCE — fee_lines has no organization_id. Anchor org via the
  // row's villa (→ its project) or its own project_id; exclude rows with
  // neither anchor.
  const organizationId = await requireOrgId();
  const villaProject = alias(projects, "villa_project_fee");
  const feeProject = alias(projects, "fee_project");
  const filters = [eq(feeLines.status, "posted")];
  if (opts?.villaId) filters.push(eq(feeLines.villaId, opts.villaId));
  filters.push(
    sql`COALESCE(${villaProject.organizationId}, ${feeProject.organizationId}) = ${organizationId}`,
  );
  const rows = await db
    .select({ f: feeLines, villaCode: villas.unitCode })
    .from(feeLines)
    .leftJoin(villas, eq(villas.id, feeLines.villaId))
    .leftJoin(villaProject, eq(villaProject.id, villas.projectId))
    .leftJoin(feeProject, eq(feeProject.id, feeLines.projectId))
    .where(and(...filters))
    .orderBy(desc(feeLines.feeDate));
  return rows.map((row) => ({
    source: "db" as const,
    id: row.f.id,
    bookingId: row.f.bookingId,
    villaId: row.f.villaId,
    villaCode: row.villaCode ?? null,
    feeType: row.f.feeType,
    description: row.f.description,
    amountMinor: BigInt(row.f.amountMinor),
    currency: row.f.currency,
    feeDate: row.f.feeDate,
    status: row.f.status as FeeLineRow["status"],
  }));
}

export async function listExpenseLines(opts?: {
  villaId?: string;
  projectId?: string;
}): Promise<WithSource<ExpenseLineRow>[]> {
  const db = getDb();
  if (!db) return [];
  // TENANCY-FINANCE — expense_lines has no organization_id. Anchor org via the
  // row's villa (→ its project) or its own project_id, mirroring
  // getManagementPnl. Payroll-generated lines with no villa/project anchor are
  // excluded here (the P&L's payroll_run org branch is out of scope for this
  // list view — see concerns).
  const organizationId = await requireOrgId();
  const villaProject = alias(projects, "villa_project_exp");
  const filters = [eq(expenseLines.status, "posted")];
  if (opts?.villaId) filters.push(eq(expenseLines.villaId, opts.villaId));
  if (opts?.projectId) filters.push(eq(expenseLines.projectId, opts.projectId));
  filters.push(
    sql`COALESCE(${villaProject.organizationId}, ${projects.organizationId}) = ${organizationId}`,
  );
  const rows = await db
    .select({ e: expenseLines, villaCode: villas.unitCode, projectName: projects.name })
    .from(expenseLines)
    .leftJoin(villas, eq(villas.id, expenseLines.villaId))
    .leftJoin(villaProject, eq(villaProject.id, villas.projectId))
    .leftJoin(projects, eq(projects.id, expenseLines.projectId))
    .where(and(...filters))
    .orderBy(desc(expenseLines.expenseDate));
  return rows.map((row) => ({
    source: "db" as const,
    id: row.e.id,
    villaId: row.e.villaId,
    villaCode: row.villaCode ?? null,
    projectId: row.e.projectId,
    projectName: row.projectName ?? null,
    expenseType: row.e.expenseType,
    description: row.e.description,
    amountMinor: BigInt(row.e.amountMinor),
    currency: row.e.currency,
    expenseDate: row.e.expenseDate,
    allocationScope: row.e.allocationScope,
    capitalized: row.e.capitalized,
    ownerChargeable: row.e.ownerChargeable,
    status: row.e.status as ExpenseLineRow["status"],
  }));
}

export async function listTaxLines(): Promise<WithSource<TaxLineRow>[]> {
  const db = getDb();
  if (!db) return [];
  // TENANCY-FINANCE — tax_lines has no organization_id. Anchor org via the
  // row's villa (→ its project) or its own project_id. Rows with neither anchor
  // (NULL villa AND NULL project) cannot be scoped and are excluded — those
  // would need an organization_id column (migration gap, see concerns).
  const organizationId = await requireOrgId();
  const villaProject = alias(projects, "villa_project_tax");
  const taxProject = alias(projects, "tax_project");
  const rows = await db
    .select({ t: taxLines })
    .from(taxLines)
    .leftJoin(villas, eq(villas.id, taxLines.villaId))
    .leftJoin(villaProject, eq(villaProject.id, villas.projectId))
    .leftJoin(taxProject, eq(taxProject.id, taxLines.projectId))
    .where(
      and(
        eq(taxLines.status, "posted"),
        sql`COALESCE(${villaProject.organizationId}, ${taxProject.organizationId}) = ${organizationId}`,
      ),
    )
    .orderBy(desc(taxLines.taxDate));
  return rows.map(({ t: r }) => ({
    source: "db" as const,
    id: r.id,
    villaId: r.villaId,
    taxType: r.taxType,
    description: r.description,
    amountMinor: BigInt(r.amountMinor),
    currency: r.currency,
    taxDate: r.taxDate,
    ownerVisible: r.ownerVisible,
    status: r.status,
  }));
}

export async function listReserveMovements(): Promise<WithSource<ReserveMovementRow>[]> {
  const db = getDb();
  if (!db) return [];
  // TENANCY-FINANCE — reserve_movements has no organization_id. Anchor org via
  // the row's villa (→ its project) or its own project_id; rows with neither
  // anchor are excluded.
  const organizationId = await requireOrgId();
  const villaProject = alias(projects, "villa_project_resmov");
  const resProject = alias(projects, "res_project");
  const rows = await db
    .select({ m: reserveMovements })
    .from(reserveMovements)
    .leftJoin(villas, eq(villas.id, reserveMovements.villaId))
    .leftJoin(villaProject, eq(villaProject.id, villas.projectId))
    .leftJoin(resProject, eq(resProject.id, reserveMovements.projectId))
    .where(
      and(
        eq(reserveMovements.status, "posted"),
        sql`COALESCE(${villaProject.organizationId}, ${resProject.organizationId}) = ${organizationId}`,
      ),
    )
    .orderBy(desc(reserveMovements.movementDate));
  return rows.map(({ m: r }) => ({
    source: "db" as const,
    id: r.id,
    villaId: r.villaId,
    projectId: r.projectId,
    reserveType: r.reserveType,
    movementType: r.movementType as ReserveMovementRow["movementType"],
    description: r.description,
    amountMinor: BigInt(r.amountMinor),
    currency: r.currency,
    movementDate: r.movementDate,
    status: r.status,
  }));
}

export async function listManagementFeeRules(): Promise<WithSource<ManagementFeeRuleRow>[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.select().from(managementFeeRules).orderBy(desc(managementFeeRules.startsOn));
  return rows.map((r) => ({
    source: "db" as const,
    id: r.id,
    ruleName: r.ruleName,
    feeModel: r.feeModel,
    feePercent: r.feePercent === null ? null : Number(r.feePercent),
    fixedAmountMinor: r.fixedAmountMinor === null ? null : BigInt(r.fixedAmountMinor),
    currency: r.currency,
    startsOn: r.startsOn,
    endsOn: r.endsOn,
    status: r.status,
    villaId: r.villaId,
    projectId: r.projectId,
  }));
}

export async function listStatementPeriods(): Promise<WithSource<PeriodRow>[]> {
  const db = getDb();
  if (!db) return [];
  // TENANCY-FINANCE — statement_periods is a shared dimension with no
  // organization_id. Lowest-risk scoping: restrict to periods that have at
  // least one owner_statements row for the caller's org, so an empty tenant
  // returns 0 rows instead of every period.
  const organizationId = await requireOrgId();
  const rows = await db
    .select()
    .from(statementPeriods)
    .where(
      inArray(
        statementPeriods.id,
        db
          .select({ id: ownerStatements.periodId })
          .from(ownerStatements)
          .where(eq(ownerStatements.organizationId, organizationId)),
      ),
    )
    .orderBy(desc(statementPeriods.periodStart));
  return rows.map((r) => ({
    source: "db" as const,
    id: r.id,
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    label: r.label,
    status: r.status as PeriodRow["status"],
    closedAt: r.closedAt?.toISOString() ?? null,
    lockedAt: r.lockedAt?.toISOString() ?? null,
  }));
}

export async function getStatementPeriodById(id: string): Promise<WithSource<PeriodRow> | null> {
  const db = getDb();
  if (!db) return null;
  const [r] = await db.select().from(statementPeriods).where(eq(statementPeriods.id, id)).limit(1);
  if (!r) return null;
  return {
    source: "db" as const,
    id: r.id,
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    label: r.label,
    status: r.status as PeriodRow["status"],
    closedAt: r.closedAt?.toISOString() ?? null,
    lockedAt: r.lockedAt?.toISOString() ?? null,
  };
}

export async function listOwnerStatements(opts?: {
  ownerId?: string;
  status?: ("draft" | "issued" | "approved" | "paid" | "voided")[];
}): Promise<WithSource<OwnerStatementRow>[]> {
  const db = getDb();
  if (!db) return [];
  // TENANCY-FINANCE — owner_statements has organization_id. Always scope to the
  // caller's org. Every caller is an authenticated request context (mgmt
  // dashboard, owners CRM, owner-portal via getOwnerStatementById), so resolving
  // requireOrgId() here is safe — there is no cron/unauthenticated caller.
  const organizationId = await requireOrgId();
  const filters = [eq(ownerStatements.organizationId, organizationId)];
  if (opts?.ownerId) filters.push(eq(ownerStatements.ownerId, opts.ownerId));
  if (opts?.status && opts.status.length > 0) {
    filters.push(inArray(ownerStatements.status, opts.status));
  }
  const rows = await db
    .select({
      s: ownerStatements,
      ownerName: owners.displayName,
      villaCode: villas.unitCode,
      projectName: projects.name,
      periodLabel: statementPeriods.label,
      periodStart: statementPeriods.periodStart,
      periodEnd: statementPeriods.periodEnd,
    })
    .from(ownerStatements)
    .innerJoin(owners, eq(owners.id, ownerStatements.ownerId))
    .innerJoin(statementPeriods, eq(statementPeriods.id, ownerStatements.periodId))
    .leftJoin(villas, eq(villas.id, ownerStatements.villaId))
    .leftJoin(projects, eq(projects.id, ownerStatements.projectId))
    .where(and(...filters))
    .orderBy(desc(statementPeriods.periodStart), asc(owners.displayName));

  return rows.map((row) => ({
    source: "db" as const,
    id: row.s.id,
    ownerId: row.s.ownerId,
    ownerName: row.ownerName,
    villaId: row.s.villaId,
    villaCode: row.villaCode ?? null,
    projectId: row.s.projectId,
    projectName: row.projectName ?? null,
    periodId: row.s.periodId,
    periodLabel: row.periodLabel,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    statementCode: row.s.statementCode,
    managementModel: row.s.managementModel as OwnerStatementRow["managementModel"],
    currency: row.s.currency,
    grossRevenueMinor: BigInt(row.s.grossRevenueMinor),
    totalFeesMinor: BigInt(row.s.totalFeesMinor),
    totalExpensesMinor: BigInt(row.s.totalExpensesMinor),
    totalTaxesMinor: BigInt(row.s.totalTaxesMinor),
    totalReservesMinor: BigInt(row.s.totalReservesMinor),
    managementFeeMinor: BigInt(row.s.managementFeeMinor),
    netPayoutMinor: BigInt(row.s.netPayoutMinor),
    occupancyRate: row.s.occupancyRate === null ? null : Number(row.s.occupancyRate),
    adrMinor: row.s.adrMinor === null ? null : BigInt(row.s.adrMinor),
    revparMinor: row.s.revparMinor === null ? null : BigInt(row.s.revparMinor),
    status: row.s.status as OwnerStatementRow["status"],
    ownerState: row.s.ownerState as OwnerStatementState,
    issuedAt: row.s.issuedAt?.toISOString() ?? null,
    createdAt: row.s.createdAt.toISOString(),
  }));
}

export async function getOwnerStatementById(
  id: string,
): Promise<WithSource<OwnerStatementRow> | null> {
  const db = getDb();
  if (!db) return null;
  // TENANCY-FINANCE — direct id+org scoped read (was: load every statement via
  // listOwnerStatements() then find()). owner_statements has organization_id, so
  // a foreign id returns null instead of leaking. Every caller (mgmt + owner
  // portal page/pdf) is an authenticated request context.
  const organizationId = await requireOrgId();
  const [row] = await db
    .select({
      s: ownerStatements,
      ownerName: owners.displayName,
      villaCode: villas.unitCode,
      projectName: projects.name,
      periodLabel: statementPeriods.label,
      periodStart: statementPeriods.periodStart,
      periodEnd: statementPeriods.periodEnd,
    })
    .from(ownerStatements)
    .innerJoin(owners, eq(owners.id, ownerStatements.ownerId))
    .innerJoin(statementPeriods, eq(statementPeriods.id, ownerStatements.periodId))
    .leftJoin(villas, eq(villas.id, ownerStatements.villaId))
    .leftJoin(projects, eq(projects.id, ownerStatements.projectId))
    .where(
      and(
        eq(ownerStatements.id, id),
        eq(ownerStatements.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    source: "db" as const,
    id: row.s.id,
    ownerId: row.s.ownerId,
    ownerName: row.ownerName,
    villaId: row.s.villaId,
    villaCode: row.villaCode ?? null,
    projectId: row.s.projectId,
    projectName: row.projectName ?? null,
    periodId: row.s.periodId,
    periodLabel: row.periodLabel,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    statementCode: row.s.statementCode,
    managementModel: row.s.managementModel as OwnerStatementRow["managementModel"],
    currency: row.s.currency,
    grossRevenueMinor: BigInt(row.s.grossRevenueMinor),
    totalFeesMinor: BigInt(row.s.totalFeesMinor),
    totalExpensesMinor: BigInt(row.s.totalExpensesMinor),
    totalTaxesMinor: BigInt(row.s.totalTaxesMinor),
    totalReservesMinor: BigInt(row.s.totalReservesMinor),
    managementFeeMinor: BigInt(row.s.managementFeeMinor),
    netPayoutMinor: BigInt(row.s.netPayoutMinor),
    occupancyRate: row.s.occupancyRate === null ? null : Number(row.s.occupancyRate),
    adrMinor: row.s.adrMinor === null ? null : BigInt(row.s.adrMinor),
    revparMinor: row.s.revparMinor === null ? null : BigInt(row.s.revparMinor),
    status: row.s.status as OwnerStatementRow["status"],
    ownerState: row.s.ownerState as OwnerStatementState,
    issuedAt: row.s.issuedAt?.toISOString() ?? null,
    createdAt: row.s.createdAt.toISOString(),
  };
}

export async function listStatementLines(
  statementId: string,
  opts?: { ownerVisibleOnly?: boolean },
): Promise<StatementLineRow[]> {
  const db = getDb();
  if (!db) return [];
  // TENANCY-FINANCE — statement_lines has no organization_id. Scope via the
  // parent owner_statements row's org so a foreign statementId returns nothing.
  const organizationId = await requireOrgId();
  const filters = [
    eq(statementLines.statementId, statementId),
    eq(ownerStatements.organizationId, organizationId),
  ];
  if (opts?.ownerVisibleOnly) filters.push(eq(statementLines.ownerVisible, true));
  const rows = await db
    .select({ l: statementLines })
    .from(statementLines)
    .innerJoin(ownerStatements, eq(ownerStatements.id, statementLines.statementId))
    .where(and(...filters))
    .orderBy(asc(statementLines.sortOrder));
  return rows.map(({ l: r }) => ({
    id: r.id,
    statementId: r.statementId,
    lineType: r.lineType as StatementLineRow["lineType"],
    category: r.category,
    description: r.description,
    amountMinor: BigInt(r.amountMinor),
    currency: r.currency,
    ownerVisible: r.ownerVisible,
    sortOrder: r.sortOrder,
    sourceTable: r.sourceTable,
    sourceId: r.sourceId,
  }));
}

export async function listPayoutBatches(): Promise<WithSource<PayoutBatchRow>[]> {
  const db = getDb();
  if (!db) return [];
  // TENANCY-FINANCE — payout_batches has a NOT-NULL organization_id.
  const organizationId = await requireOrgId();
  const rows = await db
    .select()
    .from(payoutBatches)
    .where(eq(payoutBatches.organizationId, organizationId))
    .orderBy(desc(payoutBatches.periodStart));
  // Compute totals per batch
  const result: WithSource<PayoutBatchRow>[] = [];
  for (const r of rows) {
    const lines = await db
      .select()
      .from(payoutLines)
      .where(eq(payoutLines.payoutBatchId, r.id));
    const totalAmountMinor = lines.reduce<bigint>((acc, l) => acc + BigInt(l.amountMinor), 0n);
    result.push({
      source: "db" as const,
      id: r.id,
      batchCode: r.batchCode,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      currency: r.currency,
      status: r.status as PayoutBatchRow["status"],
      totalAmountMinor,
      lineCount: lines.length,
      approvedAt: r.approvedAt?.toISOString() ?? null,
      paidAt: r.paidAt?.toISOString() ?? null,
    });
  }
  return result;
}

export async function listPayoutLines(opts?: {
  batchId?: string;
  ownerId?: string;
}): Promise<WithSource<PayoutLineRow>[]> {
  const db = getDb();
  if (!db) return [];
  // TENANCY-FINANCE — payout_lines has a NOT-NULL organization_id; always AND it.
  const organizationId = await requireOrgId();
  const filters = [eq(payoutLines.organizationId, organizationId)];
  if (opts?.batchId) filters.push(eq(payoutLines.payoutBatchId, opts.batchId));
  if (opts?.ownerId) filters.push(eq(payoutLines.ownerId, opts.ownerId));
  const rows = await db
    .select({ p: payoutLines, ownerName: owners.displayName })
    .from(payoutLines)
    .innerJoin(owners, eq(owners.id, payoutLines.ownerId))
    .where(and(...filters))
    .orderBy(desc(payoutLines.createdAt));
  return rows.map((row) => ({
    source: "db" as const,
    id: row.p.id,
    payoutBatchId: row.p.payoutBatchId,
    ownerId: row.p.ownerId,
    ownerName: row.ownerName,
    amountMinor: BigInt(row.p.amountMinor),
    currency: row.p.currency,
    status: row.p.status as PayoutLineRow["status"],
    reference: row.p.reference,
    scheduledFor: row.p.scheduledFor,
    paidAt: row.p.paidAt?.toISOString() ?? null,
    statementId: row.p.statementId,
  }));
}

// -----------------------------------------------------------------------------
// Aggregates for the finance dashboard
// -----------------------------------------------------------------------------

export interface FinanceDashboardSummary {
  currentPeriod: PeriodRow | null;
  grossRevenueMinor: bigint;
  feesMinor: bigint;
  expensesMinor: bigint;
  taxesMinor: bigint;
  reservesContributedMinor: bigint;
  pendingPayoutsMinor: bigint;
  pendingPayoutsCount: number;
  draftStatements: number;
  issuedStatements: number;
  paidStatements: number;
  currency: string;
}

export async function getFinanceSummary(currency = "USD"): Promise<FinanceDashboardSummary | null> {
  const db = getDb();
  if (!db) return null;

  // TENANCY-FINANCE — this aggregate is currently unwired (no live caller), but
  // every leg is org-scoped so it is safe if revived: owner_statements /
  // payout_lines via their organization_id, the revenue/fee/expense/tax/reserve
  // line tables via the villa→project / project COALESCE org anchor (no org
  // column on those). The period dimension is restricted to periods this org has
  // statements for.
  const organizationId = await requireOrgId();

  const [latestPeriod] = await db
    .select()
    .from(statementPeriods)
    .where(
      and(
        inArray(statementPeriods.status, ["open", "closing", "closed", "locked"]),
        inArray(
          statementPeriods.id,
          db
            .select({ id: ownerStatements.periodId })
            .from(ownerStatements)
            .where(eq(ownerStatements.organizationId, organizationId)),
        ),
      ),
    )
    .orderBy(desc(statementPeriods.periodStart))
    .limit(1);

  if (!latestPeriod) {
    return {
      currentPeriod: null,
      grossRevenueMinor: 0n,
      feesMinor: 0n,
      expensesMinor: 0n,
      taxesMinor: 0n,
      reservesContributedMinor: 0n,
      pendingPayoutsMinor: 0n,
      pendingPayoutsCount: 0,
      draftStatements: 0,
      issuedStatements: 0,
      paidStatements: 0,
      currency,
    };
  }

  const start = latestPeriod.periodStart;
  const end = latestPeriod.periodEnd;
  // Polymorphic: any nullable date column will do.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inRange = (col: any) => and(gte(col, start), lte(col, end));

  const sumOf = async <T extends { amountMinor: bigint | string }>(rows: T[]) =>
    rows.reduce<bigint>((acc, r) => acc + BigInt(r.amountMinor), 0n);

  // Per-leg villa→project / project COALESCE org anchor for the line tables.
  const revVillaProject = alias(projects, "fs_rev_villa_project");
  const revProject = alias(projects, "fs_rev_project");
  const rev = await db
    .select({ amountMinor: revenueLines.amountMinor })
    .from(revenueLines)
    .leftJoin(villas, eq(villas.id, revenueLines.villaId))
    .leftJoin(revVillaProject, eq(revVillaProject.id, villas.projectId))
    .leftJoin(revProject, eq(revProject.id, revenueLines.projectId))
    .where(
      and(
        eq(revenueLines.status, "posted"),
        inRange(revenueLines.serviceDate),
        sql`COALESCE(${revVillaProject.organizationId}, ${revProject.organizationId}) = ${organizationId}`,
      ),
    );
  const feeVillaProject = alias(projects, "fs_fee_villa_project");
  const feeProject = alias(projects, "fs_fee_project");
  const fees = await db
    .select({ amountMinor: feeLines.amountMinor })
    .from(feeLines)
    .leftJoin(villas, eq(villas.id, feeLines.villaId))
    .leftJoin(feeVillaProject, eq(feeVillaProject.id, villas.projectId))
    .leftJoin(feeProject, eq(feeProject.id, feeLines.projectId))
    .where(
      and(
        eq(feeLines.status, "posted"),
        inRange(feeLines.feeDate),
        sql`COALESCE(${feeVillaProject.organizationId}, ${feeProject.organizationId}) = ${organizationId}`,
      ),
    );
  const expVillaProject = alias(projects, "fs_exp_villa_project");
  const expProject = alias(projects, "fs_exp_project");
  const exps = await db
    .select({ amountMinor: expenseLines.amountMinor })
    .from(expenseLines)
    .leftJoin(villas, eq(villas.id, expenseLines.villaId))
    .leftJoin(expVillaProject, eq(expVillaProject.id, villas.projectId))
    .leftJoin(expProject, eq(expProject.id, expenseLines.projectId))
    .where(
      and(
        eq(expenseLines.status, "posted"),
        inRange(expenseLines.expenseDate),
        sql`COALESCE(${expVillaProject.organizationId}, ${expProject.organizationId}) = ${organizationId}`,
      ),
    );
  const taxVillaProject = alias(projects, "fs_tax_villa_project");
  const taxProject = alias(projects, "fs_tax_project");
  const taxes = await db
    .select({ amountMinor: taxLines.amountMinor })
    .from(taxLines)
    .leftJoin(villas, eq(villas.id, taxLines.villaId))
    .leftJoin(taxVillaProject, eq(taxVillaProject.id, villas.projectId))
    .leftJoin(taxProject, eq(taxProject.id, taxLines.projectId))
    .where(
      and(
        eq(taxLines.status, "posted"),
        inRange(taxLines.taxDate),
        sql`COALESCE(${taxVillaProject.organizationId}, ${taxProject.organizationId}) = ${organizationId}`,
      ),
    );
  const resVillaProject = alias(projects, "fs_res_villa_project");
  const resProject = alias(projects, "fs_res_project");
  const reservesContrib = await db
    .select({ amountMinor: reserveMovements.amountMinor })
    .from(reserveMovements)
    .leftJoin(villas, eq(villas.id, reserveMovements.villaId))
    .leftJoin(resVillaProject, eq(resVillaProject.id, villas.projectId))
    .leftJoin(resProject, eq(resProject.id, reserveMovements.projectId))
    .where(
      and(
        eq(reserveMovements.status, "posted"),
        eq(reserveMovements.movementType, "contribution"),
        inRange(reserveMovements.movementDate),
        sql`COALESCE(${resVillaProject.organizationId}, ${resProject.organizationId}) = ${organizationId}`,
      ),
    );
  const pendingPayouts = await db
    .select()
    .from(payoutLines)
    .where(
      and(
        eq(payoutLines.organizationId, organizationId),
        inArray(payoutLines.status, ["pending", "approved"]),
      ),
    );
  const statementsCount = await db
    .select()
    .from(ownerStatements)
    .where(eq(ownerStatements.organizationId, organizationId));

  const draftStatements = statementsCount.filter((s) => s.status === "draft").length;
  const issuedStatements = statementsCount.filter((s) => s.status === "issued").length;
  const paidStatements = statementsCount.filter((s) => s.status === "paid").length;

  const pendingPayoutsMinor = pendingPayouts.reduce<bigint>(
    (acc, l) => acc + BigInt(l.amountMinor),
    0n,
  );

  return {
    currentPeriod: {
      id: latestPeriod.id,
      periodStart: latestPeriod.periodStart,
      periodEnd: latestPeriod.periodEnd,
      label: latestPeriod.label,
      status: latestPeriod.status as PeriodRow["status"],
      closedAt: latestPeriod.closedAt?.toISOString() ?? null,
      lockedAt: latestPeriod.lockedAt?.toISOString() ?? null,
    },
    grossRevenueMinor: await sumOf(rev),
    feesMinor: await sumOf(fees),
    expensesMinor: await sumOf(exps),
    taxesMinor: await sumOf(taxes),
    reservesContributedMinor: await sumOf(reservesContrib),
    pendingPayoutsMinor,
    pendingPayoutsCount: pendingPayouts.length,
    draftStatements,
    issuedStatements,
    paidStatements,
    currency,
  };
}
