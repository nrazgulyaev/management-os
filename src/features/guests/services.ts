import "server-only";

import { asc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { guests } from "@/lib/db/schema/bookings";
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
  const rows = await db.select().from(guests).orderBy(asc(guests.fullName));
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
