import { type NextRequest } from "next/server";
import { handleMessagingWebhook } from "@/lib/messaging/webhook-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Gmail Pub/Sub push endpoint.
 *
 * Stage 6.P2.E shipped Gmail with a fail-closed `verifyWebhook` because
 * Pub/Sub push verification ideally uses Google-issued OIDC JWTs in the
 * `Authorization: Bearer` header. Until that verifier lands the route
 * delegates to the unified handler — `GmailProvider.verifyWebhook`
 * returns false, and the handler will respond 401. Set the route to a
 * private push subscription with an Auth-only audience and the
 * production wiring is straightforward to extend in P2.G.
 */
export async function POST(request: NextRequest) {
  return handleMessagingWebhook(request, {
    channel: "email",
    // Gmail Pub/Sub push uses bearer auth, not a signature header.
    // We pass `authorization` so the handler hands the bearer JWT to
    // GmailProvider.verifyWebhook for OIDC validation when wired up.
    signatureHeader: "authorization",
  });
}
