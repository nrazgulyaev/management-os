import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { requireDb } from "@/lib/db/client";
import {
  buyers,
  buyerUnitAssignments,
  buyerProgressReports,
} from "@/lib/db/schema/buyers";
import { villas } from "@/lib/db/schema/projects";
import {
  contractGroups,
  contracts,
  reservations,
} from "@/lib/db/schema/sales";
import { requireOrgId } from "@/features/auth/require-org";

export async function listBuyers(filters?: { kycStatus?: string }) {
  const db = requireDb();
  const organizationId = await requireOrgId();
  const conditions = [eq(buyers.organizationId, organizationId)] as Array<
    ReturnType<typeof eq>
  >;
  if (filters?.kycStatus) {
    conditions.push(eq(buyers.kycStatus, filters.kycStatus));
  }
  return db
    .select()
    .from(buyers)
    .where(and(...conditions))
    .orderBy(desc(buyers.createdAt));
}

export async function getBuyerByCode(buyerCode: string) {
  const db = requireDb();
  const organizationId = await requireOrgId();
  const [buyer] = await db
    .select()
    .from(buyers)
    .where(
      and(
        eq(buyers.buyerCode, buyerCode),
        eq(buyers.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!buyer) return null;
  // SHALLOW→DEEP — join the unit (villa) so the table shows the unit code +
  // villa name and a link, instead of a raw UUID slice. Reservation + child
  // contract refs are resolved to human-readable summaries below.
  const assignmentRows = await db
    .select({
      assignment: buyerUnitAssignments,
      unitCode: villas.unitCode,
      unitName: villas.name,
      unitSlug: villas.slug,
    })
    .from(buyerUnitAssignments)
    .leftJoin(villas, eq(villas.id, buyerUnitAssignments.unitId))
    .where(eq(buyerUnitAssignments.buyerId, buyer.id))
    .orderBy(desc(buyerUnitAssignments.assignedAt));

  // Resolve reservation + contract-group human refs for the linked ids.
  const reservationIds = assignmentRows
    .map((r) => r.assignment.reservationId)
    .filter((v): v is string => !!v);
  const contractIds = assignmentRows
    .map((r) => r.assignment.contractId)
    .filter((v): v is string => !!v);

  const reservationRefs = reservationIds.length
    ? await db
        .select({
          id: reservations.id,
          status: reservations.status,
          unitCode: villas.unitCode,
        })
        .from(reservations)
        .leftJoin(villas, eq(villas.id, reservations.villaId))
        .where(inArray(reservations.id, reservationIds))
    : [];
  const reservationById = new Map(
    reservationRefs.map((r) => [
      r.id,
      `${r.unitCode ?? "unit"} · ${r.status.replace(/_/g, " ")}`,
    ]),
  );

  // A buyer-unit assignment's contractId points at a child contract → group.
  const contractRefs = contractIds.length
    ? await db
        .select({
          id: contracts.id,
          groupId: contracts.contractGroupId,
          groupStatus: contractGroups.status,
        })
        .from(contracts)
        .leftJoin(
          contractGroups,
          eq(contractGroups.id, contracts.contractGroupId),
        )
        .where(inArray(contracts.id, contractIds))
    : [];
  const contractById = new Map(
    contractRefs.map((c) => [
      c.id,
      { groupId: c.groupId, label: (c.groupStatus ?? "contract").replace(/_/g, " ") },
    ]),
  );

  const assignments = assignmentRows.map((r) => ({
    ...r.assignment,
    unitCode: r.unitCode,
    unitName: r.unitName,
    unitSlug: r.unitSlug,
    reservationRef: r.assignment.reservationId
      ? reservationById.get(r.assignment.reservationId) ?? null
      : null,
    contractGroupId: r.assignment.contractId
      ? contractById.get(r.assignment.contractId)?.groupId ?? null
      : null,
    contractRef: r.assignment.contractId
      ? contractById.get(r.assignment.contractId)?.label ?? null
      : null,
  }));

  return { buyer, assignments };
}

export async function listBuyerProgressReports(filters: {
  projectId?: string;
  unitId?: string;
  status?: string;
}) {
  const db = requireDb();
  const organizationId = await requireOrgId();
  const conditions = [
    eq(buyerProgressReports.organizationId, organizationId),
  ] as Array<ReturnType<typeof eq>>;
  if (filters.projectId) {
    conditions.push(eq(buyerProgressReports.projectId, filters.projectId));
  }
  if (filters.unitId) {
    conditions.push(eq(buyerProgressReports.unitId, filters.unitId));
  }
  if (filters.status) {
    conditions.push(eq(buyerProgressReports.status, filters.status));
  }
  return db
    .select()
    .from(buyerProgressReports)
    .where(and(...conditions))
    .orderBy(desc(buyerProgressReports.reportingPeriodEnd));
}

export async function getBuyerProgressReport(id: string) {
  const db = requireDb();
  const organizationId = await requireOrgId();
  const [report] = await db
    .select()
    .from(buyerProgressReports)
    .where(
      and(
        eq(buyerProgressReports.id, id),
        eq(buyerProgressReports.organizationId, organizationId),
      ),
    )
    .limit(1);
  return report ?? null;
}
