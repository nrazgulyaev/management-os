import "server-only";

import { and, asc, eq, exists } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { guests, bookings } from "@/lib/db/schema/bookings";
import type { WithSource } from "@/features/types";

export interface GuestRow {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  preferredLanguage: string | null;
  whatsapp: string | null;
  isVip: boolean;
}

const fallback: WithSource<GuestRow>[] = [
  { source: "mock", id: "g1", fullName: "A. Martin", email: "a.martin@example.com", phone: "+33100000000", nationality: "French", preferredLanguage: "en", whatsapp: "+33100000000", isVip: false },
  { source: "mock", id: "g2", fullName: "H. Williams", email: "h.williams@example.com", phone: "+44207100000", nationality: "British", preferredLanguage: "en", whatsapp: "+44207100000", isVip: true },
  { source: "mock", id: "g3", fullName: "Family Nielsen", email: "nielsen@example.com", phone: "+4530000000", nationality: "Danish", preferredLanguage: "en", whatsapp: "+4530000000", isVip: false },
  { source: "mock", id: "g4", fullName: "Mr. Tanaka", email: "tanaka@example.com", phone: "+8190000000", nationality: "Japanese", preferredLanguage: "ja", whatsapp: "+8190000000", isVip: false },
];

export async function listGuests(): Promise<WithSource<GuestRow>[]> {
  const db = getDb();
  if (!db) return fallback;
  // TENANCY: `guests` has no organization_id column (the durable fix is an org
  // column + backfill — tracked). Interim: scope to guests with at least one
  // booking in the caller's org (bookings.organization_id NOT NULL, 0155), so a
  // fresh tenant never sees another org's / demo guests. A guest is hidden
  // until they have a booking in your org (acceptable for the mgmt list +
  // booking guest-picker — you create a fresh guest when there's no match).
  const organizationId = await requireOrgId();
  const rows = await db
    .select()
    .from(guests)
    .where(
      exists(
        db
          .select({ id: bookings.id })
          .from(bookings)
          .where(
            and(
              eq(bookings.guestId, guests.id),
              eq(bookings.organizationId, organizationId),
            ),
          ),
      ),
    )
    .orderBy(asc(guests.fullName));
  return rows.map((r) => ({
    source: "db",
    id: r.id,
    fullName: r.fullName,
    email: r.email,
    phone: r.phone,
    nationality: r.nationality,
    preferredLanguage: r.preferredLanguage,
    whatsapp: r.whatsapp,
    isVip: r.isVip,
  }));
}
