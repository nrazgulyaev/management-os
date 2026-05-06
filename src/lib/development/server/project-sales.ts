import "server-only";

import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { contactRoles, contacts } from "@/lib/db/schema/contacts";
import { villas } from "@/lib/db/schema/projects";
import {
  contractGroups,
  contractMilestones,
  invoices,
  reservations,
} from "@/lib/db/schema/sales";
import type { ProjectSalesData } from "@/components/development/sales/project-sales-unified";
import { getProjectContractGroups } from "./contracts";
import { getReservations } from "./reservations";

const HORIZON_DAYS = 30;

function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "string" ? Number(v) : v;
}

function toIso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  return typeof d === "string" ? d : d.toISOString();
}

/**
 * Aggregates project-scoped Sales data for the unified Sales tab on
 * `app/(development-app)/development-os/projects/[slug]/page.tsx`.
 *
 * Returns the shape `<ProjectSalesUnified data=...>` expects.
 */
export async function getProjectSalesData(
  projectId: string,
): Promise<ProjectSalesData> {
  const db = getDb();
  const empty: ProjectSalesData = {
    projectId,
    metrics: {
      activeLeads: 0,
      activeReservations: 0,
      signedContractGroups: 0,
      totalContractedUsdMinor: 0n,
      upcomingMilestones30d: { count: 0, totalUsdMinor: 0n },
      overdueInvoices: { count: 0, totalUsdMinor: 0n },
    },
    reservations: [],
    contractGroups: [],
    upcomingMilestones: [],
    recentInvoices: [],
  };
  if (!db) return empty;

  const now = new Date();
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + HORIZON_DAYS);

  const [activeLeadsRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(contactRoles)
    .where(
      and(
        eq(contactRoles.role, "lead"),
        eq(contactRoles.scopeProjectId, projectId),
        sql`${contactRoles.endedAt} is null`,
      ),
    );

  const [reservationsActiveRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(reservations)
    .where(
      and(
        eq(reservations.projectId, projectId),
        sql`${reservations.status} in ('pending_payment','active')`,
      ),
    );

  const [signedRow] = await db
    .select({
      c: sql<number>`count(*)::int`,
      total: sql<string>`coalesce(sum(${contractGroups.totalContractValueUsdMinor})::numeric, 0)`,
    })
    .from(contractGroups)
    .where(
      and(
        eq(contractGroups.projectId, projectId),
        sql`${contractGroups.status} in ('fully_signed','in_payment','completed')`,
      ),
    );

  const [milestoneRow] = await db
    .select({
      c: sql<number>`count(*)::int`,
      total: sql<string>`coalesce(sum(${contractMilestones.expectedAmountUsdMinor})::numeric, 0)`,
    })
    .from(contractMilestones)
    .innerJoin(
      contractGroups,
      eq(contractGroups.id, contractMilestones.contractGroupId),
    )
    .where(
      and(
        eq(contractGroups.projectId, projectId),
        sql`${contractMilestones.status} in ('pending','pre_invoiced','invoiced')`,
        gte(contractMilestones.expectedDueDate, now.toISOString().slice(0, 10)),
        lte(
          contractMilestones.expectedDueDate,
          horizon.toISOString().slice(0, 10),
        ),
      ),
    );

  const [overdueRow] = await db
    .select({
      c: sql<number>`count(*)::int`,
      total: sql<string>`coalesce(sum(${invoices.amountUsdMinor})::numeric, 0)`,
    })
    .from(invoices)
    .innerJoin(
      contractGroups,
      eq(contractGroups.id, invoices.contractGroupId),
    )
    .where(
      and(
        eq(contractGroups.projectId, projectId),
        eq(invoices.status, "overdue"),
      ),
    );

  // Section data (limited).
  const reservationsList = await getReservations({ projectId });
  const visibleReservations = reservationsList
    .filter(
      (r) =>
        r.status === "pending_payment" ||
        r.status === "active" ||
        r.status === "expired" ||
        r.status === "converted_to_contract",
    )
    .slice(0, 10);

  const groupsList = (await getProjectContractGroups(projectId)).slice(0, 10);

  // Upcoming milestones with buyer + unit code.
  const upcoming = await db
    .select({
      milestone: contractMilestones,
      contactFullName: contacts.fullName,
      villaCode: villas.unitCode,
    })
    .from(contractMilestones)
    .innerJoin(
      contractGroups,
      eq(contractGroups.id, contractMilestones.contractGroupId),
    )
    .innerJoin(contacts, eq(contacts.id, contractGroups.contactId))
    .innerJoin(villas, eq(villas.id, contractGroups.villaId))
    .where(
      and(
        eq(contractGroups.projectId, projectId),
        sql`${contractMilestones.status} in ('pending','pre_invoiced','invoiced','overdue')`,
        gte(contractMilestones.expectedDueDate, now.toISOString().slice(0, 10)),
        lte(
          contractMilestones.expectedDueDate,
          horizon.toISOString().slice(0, 10),
        ),
      ),
    )
    .orderBy(asc(contractMilestones.expectedDueDate))
    .limit(15);

  // Recent invoices for the project.
  const recentInvoiceRows = await db
    .select({
      inv: invoices,
      contactFullName: contacts.fullName,
      contactEmail: contacts.email,
      villaCode: villas.unitCode,
    })
    .from(invoices)
    .innerJoin(
      contractGroups,
      eq(contractGroups.id, invoices.contractGroupId),
    )
    .innerJoin(contacts, eq(contacts.id, invoices.contactId))
    .innerJoin(villas, eq(villas.id, contractGroups.villaId))
    .where(eq(contractGroups.projectId, projectId))
    .orderBy(desc(invoices.issuedAt))
    .limit(10);

  return {
    projectId,
    metrics: {
      activeLeads: Number(activeLeadsRow?.c ?? 0),
      activeReservations: Number(reservationsActiveRow?.c ?? 0),
      signedContractGroups: Number(signedRow?.c ?? 0),
      totalContractedUsdMinor: BigInt(
        Math.round(Number(signedRow?.total ?? 0)),
      ),
      upcomingMilestones30d: {
        count: Number(milestoneRow?.c ?? 0),
        totalUsdMinor: BigInt(Math.round(Number(milestoneRow?.total ?? 0))),
      },
      overdueInvoices: {
        count: Number(overdueRow?.c ?? 0),
        totalUsdMinor: BigInt(Math.round(Number(overdueRow?.total ?? 0))),
      },
    },
    reservations: visibleReservations,
    contractGroups: groupsList,
    upcomingMilestones: upcoming.map((u) => ({
      id: u.milestone.id,
      contractGroupId: u.milestone.contractGroupId,
      sourceMilestoneId: u.milestone.sourceMilestoneId,
      sequence: u.milestone.sequence,
      name: u.milestone.name,
      triggerType: u.milestone.triggerType,
      triggerValue: u.milestone.triggerValue ? num(u.milestone.triggerValue) : null,
      collectionPercent: num(u.milestone.collectionPercent),
      expectedAmountUsdMinor: u.milestone.expectedAmountUsdMinor,
      expectedAmountIdrMinor: u.milestone.expectedAmountIdrMinor,
      fxRateExpected: num(u.milestone.fxRateExpected),
      expectedDueDate: u.milestone.expectedDueDate,
      preInvoiceDate: u.milestone.preInvoiceDate,
      status: u.milestone.status as "pending",
      preInvoicedAt: toIso(u.milestone.preInvoicedAt),
      invoicedAt: toIso(u.milestone.invoicedAt),
      paidAmountUsdMinor: u.milestone.paidAmountUsdMinor,
      paidAt: toIso(u.milestone.paidAt),
      overdueAt: toIso(u.milestone.overdueAt),
      lateFeeAccrualUsdMinor: u.milestone.lateFeeAccrualUsdMinor,
      notes: u.milestone.notes,
      contactFullName: u.contactFullName,
      villaCode: u.villaCode,
    })),
    recentInvoices: recentInvoiceRows.map((r) => ({
      id: r.inv.id,
      contractMilestoneId: r.inv.contractMilestoneId,
      contractGroupId: r.inv.contractGroupId,
      contactId: r.inv.contactId,
      contactFullName: r.contactFullName,
      contactEmail: r.contactEmail,
      villaCode: r.villaCode,
      projectName: "",
      projectSlug: "",
      invoiceNumber: r.inv.invoiceNumber,
      invoiceType: r.inv.invoiceType as "standard_invoice",
      issuedAt: toIso(r.inv.issuedAt) ?? new Date().toISOString(),
      dueDate: r.inv.dueDate,
      amountUsdMinor: r.inv.amountUsdMinor,
      amountIdrMinor: r.inv.amountIdrMinor,
      fxRate: num(r.inv.fxRate),
      currency: r.inv.currency,
      language: r.inv.language as "en",
      documentId: r.inv.documentId,
      status: r.inv.status as "draft",
      sentAt: toIso(r.inv.sentAt),
      sentTo: r.inv.sentTo,
      paidAt: toIso(r.inv.paidAt),
      voidedAt: toIso(r.inv.voidedAt),
      voidedReason: r.inv.voidedReason,
    })),
  };
}
