import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import type { getDb } from "@/lib/db/client";
import { contractGroups } from "@/lib/db/schema/sales";

type Db = NonNullable<ReturnType<typeof getDb>>;

/**
 * Advances a contract group into the `in_payment` collection phase once cash
 * starts (or finishes) arriving against its milestones.
 *
 * Both milestone-payment entry points (operator desk + milestone-actions)
 * call this after recording a payment so the group leaves `fully_signed` and
 * becomes eligible for the AJB / complete control (which gates on
 * `in_payment` | `fully_signed` with all milestones paid).
 *
 * Idempotent + tenancy-safe: it only flips a group that is currently
 * `fully_signed` (or the legacy `partial_signed`) AND belongs to the supplied
 * org. A group already `in_payment`, `completed`, `cancelled` or `breached` is
 * left untouched.
 */
export async function advanceGroupToInPayment(
  db: Db,
  contractGroupId: string,
  organizationId: string,
): Promise<void> {
  const now = new Date();
  await db
    .update(contractGroups)
    .set({ status: "in_payment", updatedAt: now })
    .where(
      and(
        eq(contractGroups.id, contractGroupId),
        eq(contractGroups.organizationId, organizationId),
        inArray(contractGroups.status, ["fully_signed", "partial_signed"]),
      ),
    );
}
