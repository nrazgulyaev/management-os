import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { buildV1Route } from "@/lib/development/server/api/v1-route-handler";

export const dynamic = "force-dynamic";

export const GET = buildV1Route({
  scope: "transactions:read",
  endpointName: "v1.transactions.list",
  handler: async ({ req, auth }) => {
    const db = getDb();
    if (!db) return { status: 503, body: { error: "DB unavailable" } };
    const url = new URL(req.url);
    const limitRaw = Number(url.searchParams.get("limit") ?? "50");
    const limit = Math.min(Math.max(1, isNaN(limitRaw) ? 50 : limitRaw), 200);
    const projectId = url.searchParams.get("project_id");
    const direction = url.searchParams.get("direction");

    const rows = (await db.execute(
      sql`
        SELECT id, transaction_code, direction, project_id, amount_minor,
               currency, amount_usd_minor, transaction_date, description,
               counterparty_name, allocation_type, created_at
          FROM dev_transactions
         WHERE organization_id = ${auth.organizationId}
           AND (${projectId}::uuid IS NULL OR project_id = ${projectId}::uuid)
           AND (${direction}::text IS NULL OR direction = ${direction}::text)
      ORDER BY transaction_date DESC, created_at DESC
         LIMIT ${limit}
      `,
    )) as unknown as Array<Record<string, unknown>>;

    return {
      status: 200,
      body: { data: rows, meta: { count: rows.length, limit } },
    };
  },
});
