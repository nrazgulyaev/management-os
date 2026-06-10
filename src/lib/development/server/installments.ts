import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  contractGroups,
  contractMilestones,
} from "@/lib/db/schema/sales";
import { contractGroupRemindPrefs } from "@/lib/db/schema/contract-remind-prefs";
import { contacts } from "@/lib/db/schema/contacts";
import { villas, projects } from "@/lib/db/schema/projects";
import type {
  ContractMilestoneRow,
  MilestoneStatus,
} from "@/lib/development/types/payments";

/**
 * Buyers + installments desk (operator-side).
 *
 * Each contract group is one buyer's installment plan: a `contract_milestones`
 * schedule keyed to a buyer-villa pair. This module reads the plan-level
 * summary for the desk table and the full schedule for the per-buyer drawer.
 * Money is carried as USD MINOR units (bigint cents) end to end.
 */

/** Milestone statuses that count as an outstanding receivable. */
export const OUTSTANDING_STATUSES: MilestoneStatus[] = [
  "pending",
  "pre_invoiced",
  "invoiced",
  "partially_paid",
  "overdue",
];

export interface InstallmentPlanSummary {
  contractGroupId: string;
  buyerName: string;
  villaCode: string;
  projectName: string;
  /** Highest-priority milestone status across the plan (the "stage"). */
  stage: MilestoneStatus | "completed";
  groupStatus: string;
  totalContractValueUsdMinor: bigint;
  expectedTotalUsdMinor: bigint;
  paidTotalUsdMinor: bigint;
  milestoneCount: number;
  paidMilestoneCount: number;
  overdueCount: number;
  /** Outstanding (expected − paid) across non-waived/cancelled milestones. */
  outstandingUsdMinor: bigint;
  autoRemindEnabled: boolean;
  lastRemindedAt: string | null;
}

function milestoneToRow(m: typeof contractMilestones.$inferSelect): ContractMilestoneRow {
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

/**
 * Picks the most operationally-urgent milestone status to surface as the
 * plan "stage" in the desk table. Overdue beats anything in flight; a plan
 * with every milestone paid/waived shows as completed.
 */
function deriveStage(statuses: MilestoneStatus[]): MilestoneStatus | "completed" {
  if (statuses.includes("overdue")) return "overdue";
  if (statuses.includes("partially_paid")) return "partially_paid";
  if (statuses.includes("invoiced")) return "invoiced";
  if (statuses.includes("pre_invoiced")) return "pre_invoiced";
  if (statuses.includes("pending")) return "pending";
  if (statuses.length > 0 && statuses.every((s) => s === "paid" || s === "waived" || s === "cancelled")) {
    return "completed";
  }
  return statuses[0] ?? "completed";
}

/**
 * Lists every buyer installment plan with paid-progress + auto-remind state.
 * One row per contract group; milestones are aggregated in JS so the desk
 * stays on a single round-trip plus the prefs lookup.
 */
export async function listInstallmentPlans(
  organizationId?: string,
): Promise<InstallmentPlanSummary[]> {
  const db = getDb();
  if (!db) return [];

  const groupRows = await db
    .select({
      group: contractGroups,
      buyerName: contacts.fullName,
      villaCode: villas.unitCode,
      projectName: projects.name,
    })
    .from(contractGroups)
    .innerJoin(contacts, eq(contacts.id, contractGroups.contactId))
    .innerJoin(villas, eq(villas.id, contractGroups.villaId))
    .innerJoin(projects, eq(projects.id, contractGroups.projectId))
    .where(
      organizationId
        ? eq(contractGroups.organizationId, organizationId)
        : undefined,
    )
    .orderBy(desc(contractGroups.createdAt));

  if (groupRows.length === 0) return [];

  const groupIds = groupRows.map((r) => r.group.id);

  const milestoneRows = await db
    .select()
    .from(contractMilestones)
    .where(inArray(contractMilestones.contractGroupId, groupIds));

  const prefRows = await db
    .select()
    .from(contractGroupRemindPrefs)
    .where(inArray(contractGroupRemindPrefs.contractGroupId, groupIds));

  const prefByGroup = new Map(prefRows.map((p) => [p.contractGroupId, p]));
  const milestonesByGroup = new Map<string, (typeof contractMilestones.$inferSelect)[]>();
  for (const m of milestoneRows) {
    const list = milestonesByGroup.get(m.contractGroupId) ?? [];
    list.push(m);
    milestonesByGroup.set(m.contractGroupId, list);
  }

  return groupRows.map((r) => {
    const ms = milestonesByGroup.get(r.group.id) ?? [];
    const pref = prefByGroup.get(r.group.id);

    let expectedTotal = 0n;
    let paidTotal = 0n;
    let outstanding = 0n;
    let paidCount = 0;
    let overdueCount = 0;
    for (const m of ms) {
      const status = m.status as MilestoneStatus;
      if (status === "waived" || status === "cancelled") continue;
      expectedTotal += m.expectedAmountUsdMinor;
      paidTotal += m.paidAmountUsdMinor;
      const remaining = m.expectedAmountUsdMinor - m.paidAmountUsdMinor;
      if (remaining > 0n) outstanding += remaining;
      if (status === "paid") paidCount += 1;
      if (status === "overdue") overdueCount += 1;
    }

    return {
      contractGroupId: r.group.id,
      buyerName: r.buyerName,
      villaCode: r.villaCode,
      projectName: r.projectName,
      stage: deriveStage(ms.map((m) => m.status as MilestoneStatus)),
      groupStatus: r.group.status,
      totalContractValueUsdMinor: r.group.totalContractValueUsdMinor,
      expectedTotalUsdMinor: expectedTotal,
      paidTotalUsdMinor: paidTotal,
      milestoneCount: ms.length,
      paidMilestoneCount: paidCount,
      overdueCount,
      outstandingUsdMinor: outstanding,
      autoRemindEnabled: pref?.autoRemindEnabled ?? false,
      lastRemindedAt: pref?.lastRemindedAt ? pref.lastRemindedAt.toISOString() : null,
    };
  });
}

export interface InstallmentPlanDetail {
  contractGroupId: string;
  buyerName: string;
  buyerEmail: string | null;
  villaCode: string;
  projectName: string;
  groupStatus: string;
  autoRemindEnabled: boolean;
  lastRemindedAt: string | null;
  milestones: ContractMilestoneRow[];
}

/**
 * Full schedule for one plan — drives the per-buyer drawer.
 *
 * SECURITY: when `organizationId` is supplied the plan load is scoped to it so
 * a foreign contract-group id cannot be read. Callers from authenticated server
 * actions pass their `requireOrgId()`; omitting it preserves the unscoped read
 * for internal/system callers that have no org context.
 */
export async function getInstallmentPlanDetail(
  contractGroupId: string,
  organizationId?: string,
): Promise<InstallmentPlanDetail | null> {
  const db = getDb();
  if (!db) return null;

  const [groupRow] = await db
    .select({
      group: contractGroups,
      buyerName: contacts.fullName,
      buyerEmail: contacts.email,
      villaCode: villas.unitCode,
      projectName: projects.name,
    })
    .from(contractGroups)
    .innerJoin(contacts, eq(contacts.id, contractGroups.contactId))
    .innerJoin(villas, eq(villas.id, contractGroups.villaId))
    .innerJoin(projects, eq(projects.id, contractGroups.projectId))
    .where(
      organizationId
        ? and(
            eq(contractGroups.id, contractGroupId),
            eq(contractGroups.organizationId, organizationId),
          )
        : eq(contractGroups.id, contractGroupId),
    )
    .limit(1);

  if (!groupRow) return null;

  const ms = await db
    .select()
    .from(contractMilestones)
    .where(
      organizationId
        ? and(
            eq(contractMilestones.contractGroupId, contractGroupId),
            eq(contractMilestones.organizationId, organizationId),
          )
        : eq(contractMilestones.contractGroupId, contractGroupId),
    )
    .orderBy(asc(contractMilestones.sequence));

  const [pref] = await db
    .select()
    .from(contractGroupRemindPrefs)
    .where(eq(contractGroupRemindPrefs.contractGroupId, contractGroupId))
    .limit(1);

  return {
    contractGroupId,
    buyerName: groupRow.buyerName,
    buyerEmail: groupRow.buyerEmail ?? null,
    villaCode: groupRow.villaCode,
    projectName: groupRow.projectName,
    groupStatus: groupRow.group.status,
    autoRemindEnabled: pref?.autoRemindEnabled ?? false,
    lastRemindedAt: pref?.lastRemindedAt ? pref.lastRemindedAt.toISOString() : null,
    milestones: ms.map(milestoneToRow),
  };
}

/** Outstanding milestones for one plan — used to scope reminders. */
export async function getOutstandingMilestonesForPlan(
  contractGroupId: string,
  organizationId?: string,
): Promise<ContractMilestoneRow[]> {
  const db = getDb();
  if (!db) return [];
  const conds = [
    eq(contractMilestones.contractGroupId, contractGroupId),
    inArray(contractMilestones.status, OUTSTANDING_STATUSES),
  ];
  if (organizationId) {
    conds.push(eq(contractMilestones.organizationId, organizationId));
  }
  const rows = await db
    .select()
    .from(contractMilestones)
    .where(and(...conds))
    .orderBy(asc(contractMilestones.sequence));
  return rows.map(milestoneToRow);
}
