import "server-only";

import { and, asc, desc, eq, lte, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  contractMilestones,
  contractGroups,
  type ContractMilestone,
} from "@/lib/db/schema/sales";
import { contacts } from "@/lib/db/schema/contacts";
import type { ContractMilestoneRow, MilestoneStatus } from "@/lib/development/types/payments";

export type { ContractMilestoneRow } from "@/lib/development/types/payments";

function rowToMilestone(m: ContractMilestone): ContractMilestoneRow {
  return {
    id: m.id,
    contractGroupId: m.contractGroupId,
    sourceMilestoneId: m.sourceMilestoneId,
    sequence: m.sequence,
    name: m.name,
    triggerType: m.triggerType,
    triggerValue: m.triggerValue !== null ? Number(m.triggerValue) : null,
    collectionPercent: Number(m.collectionPercent),
    expectedAmountUsdMinor: m.expectedAmountUsdMinor,
    expectedAmountIdrMinor: m.expectedAmountIdrMinor,
    fxRateExpected: Number(m.fxRateExpected),
    expectedDueDate: m.expectedDueDate,
    preInvoiceDate: m.preInvoiceDate,
    status: m.status as MilestoneStatus,
    preInvoicedAt: m.preInvoicedAt ? m.preInvoicedAt.toISOString() : null,
    invoicedAt: m.invoicedAt ? m.invoicedAt.toISOString() : null,
    paidAmountUsdMinor: m.paidAmountUsdMinor,
    paidAt: m.paidAt ? m.paidAt.toISOString() : null,
    overdueAt: m.overdueAt ? m.overdueAt.toISOString() : null,
    lateFeeAccrualUsdMinor: m.lateFeeAccrualUsdMinor,
    notes: m.notes,
  };
}

export async function getContractMilestones(
  contractGroupId: string,
): Promise<ContractMilestoneRow[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(contractMilestones)
    .where(eq(contractMilestones.contractGroupId, contractGroupId))
    .orderBy(asc(contractMilestones.sequence));
  return rows.map(rowToMilestone);
}

export interface MilestoneFilters {
  status?: MilestoneStatus | MilestoneStatus[];
  dueOnOrBefore?: Date;
  preInvoiceOnOrBefore?: Date;
  projectId?: string;
}

export async function getUpcomingMilestones(
  filters: MilestoneFilters = {},
): Promise<
  (ContractMilestoneRow & {
    projectId: string;
    villaId: string;
    contactFullName: string;
  })[]
> {
  const db = getDb();
  if (!db) return [];

  const conds = [];
  if (filters.status) {
    const statuses = Array.isArray(filters.status)
      ? filters.status
      : [filters.status];
    conds.push(inArray(contractMilestones.status, statuses));
  }
  if (filters.dueOnOrBefore) {
    conds.push(lte(contractMilestones.expectedDueDate, filters.dueOnOrBefore.toISOString().slice(0, 10)));
  }
  if (filters.preInvoiceOnOrBefore) {
    conds.push(lte(contractMilestones.preInvoiceDate, filters.preInvoiceOnOrBefore.toISOString().slice(0, 10)));
  }
  if (filters.projectId) {
    conds.push(eq(contractGroups.projectId, filters.projectId));
  }

  const rows = await db
    .select({
      milestone: contractMilestones,
      projectId: contractGroups.projectId,
      villaId: contractGroups.villaId,
      contactFullName: contacts.fullName,
    })
    .from(contractMilestones)
    .innerJoin(
      contractGroups,
      eq(contractGroups.id, contractMilestones.contractGroupId),
    )
    .innerJoin(contacts, eq(contacts.id, contractGroups.contactId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(contractMilestones.expectedDueDate));

  return rows.map((r) => ({
    ...rowToMilestone(r.milestone),
    projectId: r.projectId,
    villaId: r.villaId,
    contactFullName: r.contactFullName,
  }));
}

export async function getOverdueMilestones() {
  return getUpcomingMilestones({
    status: ["overdue", "invoiced", "partially_paid"],
    dueOnOrBefore: new Date(),
  });
}

/** For the dashboard: pre-invoices to fire today. */
export async function getMilestonesAwaitingPreInvoice(asOf: Date = new Date()) {
  return getUpcomingMilestones({
    status: ["pending"],
    preInvoiceOnOrBefore: asOf,
  });
}

export async function getMilestonesAwaitingStandardInvoice(
  asOf: Date = new Date(),
) {
  return getUpcomingMilestones({
    status: ["pending", "pre_invoiced"],
    dueOnOrBefore: asOf,
  });
}

export async function getMilestonesNowOverdue(
  asOf: Date = new Date(),
): Promise<ContractMilestoneRow[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(contractMilestones)
    .where(
      and(
        inArray(contractMilestones.status, ["invoiced", "partially_paid"]),
        lte(contractMilestones.expectedDueDate, asOf.toISOString().slice(0, 10)),
      ),
    )
    .orderBy(asc(contractMilestones.expectedDueDate));
  return rows.map(rowToMilestone);
}

export async function getMilestonesCurrentlyOverdueForCron(): Promise<
  ContractMilestoneRow[]
> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(contractMilestones)
    .where(eq(contractMilestones.status, "overdue"))
    .orderBy(asc(contractMilestones.expectedDueDate));
  return rows.map(rowToMilestone);
}

export async function getMilestoneById(
  id: string,
): Promise<ContractMilestoneRow | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(contractMilestones)
    .where(eq(contractMilestones.id, id))
    .limit(1);
  return row ? rowToMilestone(row) : null;
}

/** Last-modified-first listing for the workspace. */
export async function getRecentMilestones(limit = 50): Promise<ContractMilestoneRow[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(contractMilestones)
    .orderBy(desc(contractMilestones.updatedAt))
    .limit(limit);
  return rows.map(rowToMilestone);
}
