import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { reservations } from "@/lib/db/schema/sales";
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
  const rows = await db
    .select({ id: reservations.id })
    .from(reservations)
    .where(eq(reservations.contactId, contactId))
    .limit(1);
  return rows.length > 0;
}
