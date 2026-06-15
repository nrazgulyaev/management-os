import "server-only";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { reservations } from "@/lib/db/schema/sales";
import { projects } from "@/lib/db/schema/projects";
import { requireOrgId } from "@/features/auth/require-org";
import { getContractGroups } from "./contracts";
import { getReservations } from "./reservations";
import type { ReservationListItem } from "@/lib/development/types/reservations";
import type { ContractGroupListItem } from "@/lib/development/types/contracts";

/**
 * Aggregates a single contact's reservations + contract groups for the
 * lead detail "Reservation & Contract" tab.
 */
export interface LeadSalesSnapshot {
  contactId: string;
  reservations: ReservationListItem[];
  contractGroups: ContractGroupListItem[];
}

export async function getLeadSalesSnapshot(
  contactId: string,
): Promise<LeadSalesSnapshot> {
  const db = getDb();
  if (!db) {
    return { contactId, reservations: [], contractGroups: [] };
  }

  // Reservations for this contact (any project).
  const all = await getReservations();
  const myReservations = all.filter((r) => r.contactId === contactId);

  // Contract groups for this contact.
  const myGroups = await getContractGroups({ contactId });

  return {
    contactId,
    reservations: myReservations,
    contractGroups: myGroups,
  };
}

/** Quick existence check used to decide between empty state and "Create reservation" CTA. */
export async function hasActiveReservation(
  contactId: string,
): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  // reservations has NO own organization_id — anchor org via projects.
  const organizationId = await requireOrgId();
  const rows = await db
    .select({ id: reservations.id })
    .from(reservations)
    .innerJoin(projects, eq(projects.id, reservations.projectId))
    .where(
      and(
        eq(reservations.contactId, contactId),
        eq(projects.organizationId, organizationId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
