import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { buildV1Route } from "@/lib/development/server/api/v1-route-handler";

export const dynamic = "force-dynamic";

export const GET = buildV1Route({
  scope: "investors:read",
  endpointName: "v1.investors.list",
  handler: async ({ req, auth }) => {
    const db = getDb();
    if (!db) return { status: 503, body: { error: "DB unavailable" } };
    const url = new URL(req.url);
    const limitRaw = Number(url.searchParams.get("limit") ?? "50");
    const limit = Math.min(Math.max(1, isNaN(limitRaw) ? 50 : limitRaw), 200);

    const rows = (await db.execute(
      sql`
        SELECT id, investor_code, investor_type, legal_name, primary_currency,
               status, onboarded_at, contact_email
          FROM investors
         WHERE organization_id = ${auth.organizationId}
      ORDER BY onboarded_at DESC
         LIMIT ${limit}
      `,
    )) as unknown as Array<Record<string, unknown>>;

    return {
      status: 200,
      body: { data: rows, meta: { count: rows.length, limit } },
    };
  },
});
