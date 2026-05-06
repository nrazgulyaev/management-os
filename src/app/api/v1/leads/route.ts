import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { buildV1Route } from "@/lib/development/server/api/v1-route-handler";
import { emitEvent } from "@/lib/development/server/webhooks/event-emitter";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  leadCode: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[A-Z0-9_-]+$/i, "alphanumeric only"),
  contactId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  leadSourceKey: z.string().optional(),
  utmSource: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmMedium: z.string().optional(),
  estimatedValueMinor: z.number().int().nonnegative().optional(),
  currency: z.string().default("IDR"),
  notes: z.string().max(2000).optional(),
});

export const GET = buildV1Route({
  scope: "leads:read",
  endpointName: "v1.leads.list",
  handler: async ({ req, auth }) => {
    const db = getDb();
    if (!db) return { status: 503, body: { error: "DB unavailable" } };
    const url = new URL(req.url);
    const limitRaw = Number(url.searchParams.get("limit") ?? "50");
    const limit = Math.min(Math.max(1, isNaN(limitRaw) ? 50 : limitRaw), 200);
    const status = url.searchParams.get("status");

    const rows = (await db.execute(
      status
        ? sql`
            SELECT id, lead_code, lifecycle_status, project_id, lead_source_key,
                   utm_source, utm_campaign, estimated_value_minor, currency,
                   created_at
              FROM leads
             WHERE organization_id = ${auth.organizationId}
               AND lifecycle_status = ${status}
          ORDER BY created_at DESC
             LIMIT ${limit}
          `
        : sql`
            SELECT id, lead_code, lifecycle_status, project_id, lead_source_key,
                   utm_source, utm_campaign, estimated_value_minor, currency,
                   created_at
              FROM leads
             WHERE organization_id = ${auth.organizationId}
          ORDER BY created_at DESC
             LIMIT ${limit}
          `,
    )) as unknown as Array<Record<string, unknown>>;

    return {
      status: 200,
      body: { data: rows, meta: { count: rows.length, limit } },
    };
  },
});

export const POST = buildV1Route({
  scope: "leads:write",
  endpointName: "v1.leads.create",
  handler: async ({ req, auth }) => {
    const db = getDb();
    if (!db) return { status: 503, body: { error: "DB unavailable" } };
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return { status: 400, body: { error: "JSON body required" } };
    }
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return {
        status: 400,
        body: { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      };
    }
    const d = parsed.data;
    let inserted: Array<Record<string, unknown>>;
    try {
      inserted = (await db.execute(
        sql`
          INSERT INTO leads (
            organization_id, lead_code, contact_id, project_id,
            lead_source_key, utm_source, utm_campaign, utm_medium,
            estimated_value_minor, currency, notes
          ) VALUES (
            ${auth.organizationId}, ${d.leadCode}, ${d.contactId ?? null},
            ${d.projectId ?? null}, ${d.leadSourceKey ?? null},
            ${d.utmSource ?? null}, ${d.utmCampaign ?? null}, ${d.utmMedium ?? null},
            ${d.estimatedValueMinor ?? null}, ${d.currency}, ${d.notes ?? null}
          )
          RETURNING id, lead_code, lifecycle_status, created_at
        `,
      )) as unknown as Array<Record<string, unknown>>;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Insert failed";
      if (msg.includes("duplicate") || msg.includes("unique")) {
        return { status: 409, body: { error: "lead_code already exists" } };
      }
      return { status: 500, body: { error: msg } };
    }
    const row = inserted[0];
    if (row) {
      void emitEvent({
        organizationId: auth.organizationId,
        eventType: "lead.created",
        payload: {
          id: row.id,
          lead_code: row.lead_code,
          lifecycle_status: row.lifecycle_status,
          source: d.leadSourceKey ?? null,
        },
      });
    }
    return { status: 201, body: { data: row } };
  },
});
