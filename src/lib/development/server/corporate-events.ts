import "server-only";

import { eq, sql, and, gte, lte, desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { devCorporateEvents } from "@/lib/db/schema/dev-finance";

export type CorporateEventRow = typeof devCorporateEvents.$inferSelect;

export interface CorporateEventFilters {
  type?: string;
  contactId?: string;
  fromDate?: string;
  toDate?: string;
}

export async function getCorporateEvents(
  filters: CorporateEventFilters = {},
): Promise<CorporateEventRow[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  // dev_corporate_events.organization_id (NOT NULL) was added by migration
  // 0072 but is not yet declared on the Drizzle schema, so anchor org via a
  // raw, table-qualified column predicate.
  const conditions: ReturnType<typeof sql>[] = [
    sql`dev_corporate_events.organization_id = ${organizationId}`,
  ];
  if (filters.type)
    conditions.push(eq(devCorporateEvents.eventType, filters.type));
  if (filters.contactId)
    conditions.push(eq(devCorporateEvents.relatedContactId, filters.contactId));
  if (filters.fromDate)
    conditions.push(gte(devCorporateEvents.eventDate, filters.fromDate));
  if (filters.toDate)
    conditions.push(lte(devCorporateEvents.eventDate, filters.toDate));
  return await db
    .select()
    .from(devCorporateEvents)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(devCorporateEvents.eventDate));
}

export interface CorporateEventsSummary {
  byType: Record<
    string,
    { count: number; totalUsdMinor: string }
  >;
  totalUsdMinor: string;
}

export async function getCorporateEventsSummary(): Promise<CorporateEventsSummary> {
  const db = getDb();
  if (!db) return { byType: {}, totalUsdMinor: "0" };
  const organizationId = await requireOrgId();
  const rows = await db.execute(sql`
    SELECT event_type,
           count(*)::int AS count,
           coalesce(sum(amount_usd_minor), 0)::bigint AS total
    FROM dev_corporate_events
    WHERE organization_id = ${organizationId}
    GROUP BY event_type
  `);
  const byType: Record<string, { count: number; totalUsdMinor: string }> = {};
  let total = 0n;
  for (const r of rows as Record<string, unknown>[]) {
    byType[String(r.event_type)] = {
      count: Number(r.count ?? 0),
      totalUsdMinor: String(r.total ?? "0"),
    };
    total += BigInt(String(r.total ?? "0"));
  }
  return { byType, totalUsdMinor: total.toString() };
}
