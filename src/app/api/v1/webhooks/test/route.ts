import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { webhookSubscriptions } from "@/lib/db/schema/saas";
import { buildV1Route } from "@/lib/development/server/api/v1-route-handler";
import { testFireWebhook } from "@/lib/development/server/webhooks/webhook-actions";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  subscriptionId: z.string().uuid(),
});

export const POST = buildV1Route({
  scope: "webhooks:write",
  endpointName: "v1.webhooks.test",
  handler: async ({ req, auth }) => {
    const db = getDb();
    if (!db) return { status: 503, body: { error: "DB unavailable" } };
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return { status: 400, body: { error: "JSON body required" } };
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return {
        status: 400,
        body: { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      };
    }
    // Confirm the subscription belongs to the API key's org.
    const subRows = await db
      .select({ id: webhookSubscriptions.id })
      .from(webhookSubscriptions)
      .where(
        and(
          eq(webhookSubscriptions.id, parsed.data.subscriptionId),
          eq(webhookSubscriptions.organizationId, auth.organizationId),
        ),
      )
      .limit(1);
    if (subRows.length === 0) {
      return { status: 404, body: { error: "Subscription not found" } };
    }
    const result = await testFireWebhook({
      subscriptionId: parsed.data.subscriptionId,
    });
    if (!result.ok) {
      return { status: 400, body: { error: result.error } };
    }
    return {
      status: 200,
      body: {
        data: {
          delivery_id: result.deliveryId,
          delivery_status: result.result.status,
          http_status: result.result.httpStatusCode,
          duration_ms: result.result.durationMs,
        },
      },
    };
  },
});
