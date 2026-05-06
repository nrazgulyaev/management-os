import "server-only";

import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { organizations } from "@/lib/db/schema/saas";

export async function listOrganizations() {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(organizations)
    .orderBy(desc(organizations.isActive), organizations.name);
}

export async function getOrganizationByCode(code: string) {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(organizations)
    .where(eq(organizations.organizationCode, code))
    .limit(1);
  return rows[0] ?? null;
}

export async function getOrganizationById(id: string) {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, id))
    .limit(1);
  return rows[0] ?? null;
}
