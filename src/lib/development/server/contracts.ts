import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { contacts } from "@/lib/db/schema/contacts";
import { projects, villas } from "@/lib/db/schema/projects";
import {
  contractGroups,
  contractMilestones,
  contractTemplateComponents,
  contractTemplates,
  contracts,
  reservations,
  salesSchemeMilestones,
  salesSchemes,
  type Contract,
  type ContractGroup,
} from "@/lib/db/schema/sales";
import type {
  ContractGroupDetail,
  ContractGroupListItem,
  ContractRow,
  ContractTemplateData,
  ContractTemplateComponentData,
  SalesSchemeData,
  SalesSchemeMilestoneData,
} from "@/lib/development/types/contracts";
import type { ContractMilestoneRow } from "@/lib/development/types/payments";

export type {
  ContractGroupDetail,
  ContractGroupListItem,
  ContractRow,
  ContractTemplateData,
  SalesSchemeData,
} from "@/lib/development/types/contracts";

function toIsoOrNull(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (typeof d === "string") return d;
  return d.toISOString();
}

/** Drizzle returns `numeric` columns as string; coerce to number. */
function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "string" ? Number(v) : v;
}
function numOrNull(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  return typeof v === "string" ? Number(v) : v;
}

interface ListJoin {
  group: ContractGroup;
  contactFullName: string;
  villaCode: string;
  villaName: string | null;
  projectName: string;
  projectSlug: string;
  templateName: string;
  schemeName: string | null;
}

function joinToListItem(r: ListJoin): ContractGroupListItem {
  return {
    id: r.group.id,
    contactId: r.group.contactId,
    contactFullName: r.contactFullName,
    villaId: r.group.villaId,
    villaCode: r.villaCode,
    villaName: r.villaName,
    projectId: r.group.projectId,
    projectName: r.projectName,
    projectSlug: r.projectSlug,
    templateId: r.group.templateId,
    templateName: r.templateName,
    salesSchemeName: r.schemeName,
    reservationId: r.group.reservationId,
    groupType: r.group.groupType as ContractGroupListItem["groupType"],
    status: r.group.status as ContractGroupListItem["status"],
    totalContractValueUsdMinor: r.group.totalContractValueUsdMinor,
    totalContractValueIdrMinor: r.group.totalContractValueIdrMinor,
    fxRateAtSigning: num(r.group.fxRateAtSigning),
    marketPriceAtSigningUsdMinor: r.group.marketPriceAtSigningUsdMinor,
    contractDate: r.group.contractDate,
    firstSignedAt: toIsoOrNull(r.group.firstSignedAt),
    fullySignedAt: toIsoOrNull(r.group.fullySignedAt),
    completedAt: toIsoOrNull(r.group.completedAt),
    cancelledAt: toIsoOrNull(r.group.cancelledAt),
    cancelledReason: r.group.cancelledReason,
    notes: r.group.notes,
    createdAt: toIsoOrNull(r.group.createdAt) ?? new Date().toISOString(),
  };
}

function contractToRow(c: Contract): ContractRow {
  return {
    id: c.id,
    contractGroupId: c.contractGroupId,
    sequence: c.sequence,
    componentType: c.componentType as ContractRow["componentType"],
    componentName: c.componentName,
    amountUsdMinor: c.amountUsdMinor,
    amountIdrMinor: c.amountIdrMinor,
    fxRate: num(c.fxRate),
    taxRate: num(c.taxRate),
    taxBearer: c.taxBearer as ContractRow["taxBearer"],
    taxAmountUsdMinor: c.taxAmountUsdMinor,
    netReceivedBySellerUsdMinor: c.netReceivedBySellerUsdMinor,
    status: c.status as ContractRow["status"],
    signedAt: toIsoOrNull(c.signedAt),
    signedDocumentId: c.signedDocumentId,
    generatedDraftDocumentId: c.generatedDraftDocumentId,
    notes: c.notes,
  };
}

export interface ContractFilters {
  projectId?: string;
  contactId?: string;
  status?: ContractGroupListItem["status"];
}

export async function getContractGroups(
  filters: ContractFilters = {},
): Promise<ContractGroupListItem[]> {
  const db = getDb();
  if (!db) return [];
  const conds = [];
  if (filters.projectId) conds.push(eq(contractGroups.projectId, filters.projectId));
  if (filters.contactId) conds.push(eq(contractGroups.contactId, filters.contactId));
  if (filters.status) conds.push(eq(contractGroups.status, filters.status));

  const rows = await db
    .select({
      group: contractGroups,
      contactFullName: contacts.fullName,
      villaCode: villas.unitCode,
      villaName: villas.name,
      projectName: projects.name,
      projectSlug: projects.slug,
      templateName: contractTemplates.name,
      schemeName: salesSchemes.name,
    })
    .from(contractGroups)
    .innerJoin(contacts, eq(contacts.id, contractGroups.contactId))
    .innerJoin(villas, eq(villas.id, contractGroups.villaId))
    .innerJoin(projects, eq(projects.id, contractGroups.projectId))
    .innerJoin(
      contractTemplates,
      eq(contractTemplates.id, contractGroups.templateId),
    )
    .leftJoin(salesSchemes, eq(salesSchemes.id, contractGroups.salesSchemeId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(contractGroups.createdAt));

  return rows.map(joinToListItem);
}

export async function getProjectContractGroups(
  projectId: string,
): Promise<ContractGroupListItem[]> {
  return getContractGroups({ projectId });
}

export async function getContractGroupById(
  id: string,
): Promise<ContractGroupDetail | null> {
  const db = getDb();
  if (!db) return null;
  const groupRows = await db
    .select({
      group: contractGroups,
      contactFullName: contacts.fullName,
      villaCode: villas.unitCode,
      villaName: villas.name,
      projectName: projects.name,
      projectSlug: projects.slug,
      templateName: contractTemplates.name,
      schemeName: salesSchemes.name,
    })
    .from(contractGroups)
    .innerJoin(contacts, eq(contacts.id, contractGroups.contactId))
    .innerJoin(villas, eq(villas.id, contractGroups.villaId))
    .innerJoin(projects, eq(projects.id, contractGroups.projectId))
    .innerJoin(
      contractTemplates,
      eq(contractTemplates.id, contractGroups.templateId),
    )
    .leftJoin(salesSchemes, eq(salesSchemes.id, contractGroups.salesSchemeId))
    .where(eq(contractGroups.id, id))
    .limit(1);

  const head = groupRows[0];
  if (!head) return null;

  const childContracts = await db
    .select()
    .from(contracts)
    .where(eq(contracts.contractGroupId, id))
    .orderBy(asc(contracts.sequence));

  const milestoneRows = await db
    .select()
    .from(contractMilestones)
    .where(eq(contractMilestones.contractGroupId, id))
    .orderBy(asc(contractMilestones.sequence));

  const milestones: ContractMilestoneRow[] = milestoneRows.map((m) => ({
    id: m.id,
    contractGroupId: m.contractGroupId,
    sourceMilestoneId: m.sourceMilestoneId,
    sequence: m.sequence,
    name: m.name,
    triggerType: m.triggerType,
    triggerValue: numOrNull(m.triggerValue),
    collectionPercent: num(m.collectionPercent),
    expectedAmountUsdMinor: m.expectedAmountUsdMinor,
    expectedAmountIdrMinor: m.expectedAmountIdrMinor,
    fxRateExpected: num(m.fxRateExpected),
    expectedDueDate: m.expectedDueDate,
    preInvoiceDate: m.preInvoiceDate,
    status: m.status as ContractMilestoneRow["status"],
    preInvoicedAt: toIsoOrNull(m.preInvoicedAt),
    invoicedAt: toIsoOrNull(m.invoicedAt),
    paidAmountUsdMinor: m.paidAmountUsdMinor,
    paidAt: toIsoOrNull(m.paidAt),
    overdueAt: toIsoOrNull(m.overdueAt),
    lateFeeAccrualUsdMinor: m.lateFeeAccrualUsdMinor,
    notes: m.notes,
  }));

  return {
    ...joinToListItem(head),
    contracts: childContracts.map(contractToRow),
    milestones,
    salesSchemeId: head.group.salesSchemeId,
    salesSchemeName: head.schemeName,
    discountAppliedId: head.group.discountAppliedId,
  };
}

export async function getContractTemplates(): Promise<ContractTemplateData[]> {
  const db = getDb();
  if (!db) return [];
  const tpls = await db
    .select()
    .from(contractTemplates)
    .where(eq(contractTemplates.isActive, true))
    .orderBy(asc(contractTemplates.name));
  if (tpls.length === 0) return [];

  const allComponents = await db
    .select()
    .from(contractTemplateComponents)
    .orderBy(asc(contractTemplateComponents.sequence));
  const byTemplate = new Map<string, ContractTemplateComponentData[]>();
  for (const c of allComponents) {
    const list = byTemplate.get(c.templateId) ?? [];
    list.push({
      id: c.id,
      templateId: c.templateId,
      sequence: c.sequence,
      componentType: c.componentType as ContractTemplateComponentData["componentType"],
      componentName: c.componentName,
      defaultAmountFormula: c.defaultAmountFormula as ContractTemplateComponentData["defaultAmountFormula"],
      defaultPercentValue: numOrNull(c.defaultPercentValue),
      defaultFlatAmountUsdMinor: c.defaultFlatAmountUsdMinor,
      defaultTaxRate: num(c.defaultTaxRate),
      defaultTaxBearer: c.defaultTaxBearer as ContractTemplateComponentData["defaultTaxBearer"],
      defaultSplitPercent: numOrNull(c.defaultSplitPercent),
      description: c.description,
    });
    byTemplate.set(c.templateId, list);
  }

  return tpls.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    applicableTo: t.applicableTo as ContractTemplateData["applicableTo"],
    isActive: t.isActive,
    components: byTemplate.get(t.id) ?? [],
  }));
}

export async function getSalesSchemes(
  projectId?: string | null,
): Promise<SalesSchemeData[]> {
  const db = getDb();
  if (!db) return [];
  const conds = [eq(salesSchemes.isActive, true)];
  if (projectId) conds.push(eq(salesSchemes.projectId, projectId));
  const schemes = await db
    .select()
    .from(salesSchemes)
    .where(and(...conds))
    .orderBy(asc(salesSchemes.name));
  if (schemes.length === 0) return [];

  const milestones = await db
    .select()
    .from(salesSchemeMilestones)
    .orderBy(asc(salesSchemeMilestones.sequence));
  const byScheme = new Map<string, SalesSchemeMilestoneData[]>();
  for (const m of milestones) {
    const list = byScheme.get(m.salesSchemeId) ?? [];
    list.push({
      id: m.id,
      salesSchemeId: m.salesSchemeId,
      sequence: m.sequence,
      name: m.name,
      triggerType: m.triggerType as SalesSchemeMilestoneData["triggerType"],
      triggerValue: numOrNull(m.triggerValue),
      collectionPercent: num(m.collectionPercent),
      preInvoiceDaysBeforeTrigger: m.preInvoiceDaysBeforeTrigger,
      dueDaysAfterInvoice: m.dueDaysAfterInvoice,
      isFinalPayment: m.isFinalPayment,
      description: m.description,
    });
    byScheme.set(m.salesSchemeId, list);
  }

  return schemes.map((s) => ({
    id: s.id,
    projectId: s.projectId,
    name: s.name,
    description: s.description,
    isActive: s.isActive,
    isLocked: s.isLocked,
    milestones: byScheme.get(s.id) ?? [],
  }));
}

/** Aggregate count for the command center / Sales tab. */
export async function getContractGroupCounts(
  projectId?: string,
): Promise<{ status: string; count: number }[]> {
  const db = getDb();
  if (!db) return [];
  const conds = projectId ? eq(contractGroups.projectId, projectId) : undefined;
  const rows = await db
    .select({
      status: contractGroups.status,
      count: sql<number>`count(*)::int`,
    })
    .from(contractGroups)
    .where(conds)
    .groupBy(contractGroups.status);
  return rows.map((r) => ({ status: r.status, count: Number(r.count) }));
}

/** Reservation lookup used by `convertReservationToContract`. */
export async function getReservationForContract(reservationId: string) {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(reservations)
    .where(eq(reservations.id, reservationId))
    .limit(1);
  return rows[0] ?? null;
}
