import "server-only";

import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { executiveDigests } from "@/lib/db/schema/executive";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Digests whose period overlaps `[start, end]`, newest first. Used by
 * the time-range executive rollups to surface the digests covering a
 * quarter / year-to-date window.
 */
export async function listDigestsInRange(start: Date, end: Date) {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(executiveDigests)
    .where(
      and(
        gte(executiveDigests.periodEnd, isoDate(start)),
        lte(executiveDigests.periodStart, isoDate(end)),
      ),
    )
    .orderBy(desc(executiveDigests.periodEnd));
}

export async function listDigests(limit = 24) {
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(executiveDigests)
    .orderBy(desc(executiveDigests.periodEnd))
    .limit(limit);
}

export async function getDigestByCode(code: string) {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(executiveDigests)
    .where(eq(executiveDigests.digestCode, code))
    .limit(1);
  return rows[0] ?? null;
}
