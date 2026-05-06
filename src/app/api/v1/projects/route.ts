import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { buildV1Route } from "@/lib/development/server/api/v1-route-handler";

export const dynamic = "force-dynamic";

export const GET = buildV1Route({
  scope: "projects:read",
  endpointName: "v1.projects.list",
  handler: async ({ req, auth }) => {
    const db = getDb();
    if (!db) return { status: 503, body: { error: "DB unavailable" } };
    const url = new URL(req.url);
    const limitRaw = Number(url.searchParams.get("limit") ?? "50");
    const limit = Math.min(Math.max(1, isNaN(limitRaw) ? 50 : limitRaw), 200);
    const cursor = url.searchParams.get("cursor");

    const rows = (await db.execute(
      cursor
        ? sql`
            SELECT id, slug, name, location, status, management_status,
                   total_villas, target_handover_date, created_at
              FROM projects
             WHERE organization_id = ${auth.organizationId}
               AND created_at < (SELECT created_at FROM projects WHERE id = ${cursor})
          ORDER BY created_at DESC
             LIMIT ${limit}
          `
        : sql`
            SELECT id, slug, name, location, status, management_status,
                   total_villas, target_handover_date, created_at
              FROM projects
             WHERE organization_id = ${auth.organizationId}
          ORDER BY created_at DESC
             LIMIT ${limit}
          `,
    )) as unknown as Array<Record<string, unknown>>;

    const nextCursor =
      rows.length === limit ? (rows[rows.length - 1]?.id ?? null) : null;

    return {
      status: 200,
      body: {
        data: rows,
        meta: { count: rows.length, limit, next_cursor: nextCursor },
      },
    };
  },
});
