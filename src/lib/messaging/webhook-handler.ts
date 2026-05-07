import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { selectMessagingProvider } from "./select-provider";
import { handleIncomingMessage } from "./service";
import { decryptMessagingCredentials } from "./credentials-store";
import { getOrganizationByCode } from "@/lib/development/server/organizations/organization-queries";
import type { MessagingChannel } from "./types";

/**
 * Stage 6.P2.F — Shared messaging-webhook entry point.
 *
 * Each per-channel route is a thin wrapper that:
 *   1. Reads the raw body + signature header (header name varies per
 *      channel — caller supplies the right key).
 *   2. Looks up credentials for the channel + active org. P2.F ships a
 *      single-tenant model (ARCONIQUE_DEFAULT); per-org credential
 *      routing extends in P5/P6 once oauth_connections has channel +
 *      org bindings beyond Stage 6.P0's single-org bootstrap.
 *   3. Verifies the signature via the channel provider.
 *   4. Parses the webhook into IncomingMessage[] and feeds each
 *      through MessagingService.handleIncomingMessage.
 *   5. Returns 200 quickly so the channel doesn't retry.
 *
 * Per security best practice: 401 on signature failure so channels
 * back off; 200 on success even when the parser yields no messages
 * (e.g. status receipts only).
 */

export interface MessagingWebhookConfig {
  channel: MessagingChannel;
  /** HTTP header carrying the signature. */
  signatureHeader: string;
  /** Optional Meta verify-token handshake support. */
  metaVerifyToken?: string;
  /** Optional secret override (e.g. when the secret lives in env). */
  secretFromEnv?: () => string | null;
}

export async function handleMessagingWebhook(
  request: NextRequest,
  config: MessagingWebhookConfig,
): Promise<NextResponse> {
  // Meta-style GET verification handshake. Meta hits the route with
  // ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
  // and expects the challenge echoed back.
  if (request.method === "GET" && config.metaVerifyToken) {
    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === config.metaVerifyToken && challenge) {
      return new NextResponse(challenge, { status: 200 });
    }
    return NextResponse.json(
      { error: "verify token mismatch" },
      { status: 403 },
    );
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json(
      { error: "database unavailable" },
      { status: 503 },
    );
  }
  const rawBody = await request.text();
  const signature = request.headers.get(config.signatureHeader) ?? "";

  // P2.F single-tenant: pin to ARCONIQUE_DEFAULT. Multi-tenant routing
  // (find org by external_property_id / page_id / etc.) lands when
  // P5 wires per-channel credential storage to oauth_connections.
  const org = await getOrganizationByCode("ARCONIQUE_DEFAULT");
  if (!org) {
    return NextResponse.json(
      { error: "no active organization" },
      { status: 503 },
    );
  }

  // Resolve credentials. For P2.F the credential blob is read from
  // env-linked storage in test scenarios; full UI-driven credential
  // persistence flows through credentials-store.
  const secret =
    (config.secretFromEnv && config.secretFromEnv()) ?? "";
  const credentials = await decryptMessagingCredentials(secret);
  const provider = selectMessagingProvider(config.channel, credentials);

  if (!provider.verifyWebhook(rawBody, signature, secret ?? "")) {
    return NextResponse.json(
      { error: "invalid signature" },
      { status: 401 },
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "payload is not JSON" },
      { status: 400 },
    );
  }

  const messages = provider.parseWebhook(payload);
  if (!messages || messages.length === 0) {
    // No new messages — probably a status receipt. Return 200 so the
    // channel doesn't retry; status-sync cron picks it up via
    // provider-specific paths.
    return NextResponse.json({ ok: true, ingested: 0 }, { status: 200 });
  }

  let created = 0;
  let skipped = 0;
  let failed = 0;
  for (const m of messages) {
    try {
      const result = await handleIncomingMessage({
        organizationId: org.id,
        message: m,
      });
      if (result.outcome === "created") created++;
      else if (
        result.outcome === "echo_skipped" ||
        result.outcome === "duplicate_skipped"
      ) {
        skipped++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return NextResponse.json(
    { ok: true, created, skipped, failed },
    { status: 200 },
  );
}
