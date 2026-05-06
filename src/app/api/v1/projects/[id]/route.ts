import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { buildV1Route } from "@/lib/development/server/api/v1-route-handler";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET = buildV1Route({
  scope: "projects:read",
  endpointName: "v1.projects.get",
  handler: async ({ req, auth }) => {
    const url = new URL(req.url);
    const id = url.pathname.split("/").filter(Boolean).pop() ?? "";
    if (!UUID_RE.test(id)) {
      return { status: 400, body: { error: "Invalid project id" } };
    }
    const db = getDb();
    if (!db) return { status: 503, body: { error: "DB unavailable" } };

    const projectRows = (await db.execute(
      sql`SELECT * FROM projects WHERE id = ${id} AND organization_id = ${auth.organizationId} LIMIT 1`,
    )) as unknown as Array<Record<string, unknown>>;
    const project = projectRows[0];
    if (!project) {
      return { status: 404, body: { error: "Project not found" } };
    }

    const villaRows = (await db.execute(
      sql`SELECT id, slug, unit_code, name, status, bedrooms, built_area_sqm
            FROM villas
           WHERE project_id = ${id}
             AND organization_id = ${auth.organizationId}
        ORDER BY unit_code`,
    )) as unknown as Array<Record<string, unknown>>;

    return {
      status: 200,
      body: {
        data: { project, villas: villaRows },
      },
    };
  },
});
