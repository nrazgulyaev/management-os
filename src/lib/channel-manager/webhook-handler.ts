import "server-only";

import { eq, and } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import {
  channelConnections,
  type ChannelName,
} from "@/lib/db/schema/channel-manager";
import { handleWebhookForChannel } from "./service";

/**
 * Stage 6.P1.G.2 — Shared webhook route handler.
 *
 * Each per-channel route is a 3-line file that delegates here. This
 * helper:
 *   1. Reads the raw body + signature header (channels vary on the
 *      header name — caller passes the right key).
 *   2. Extracts the external property ID from the payload (channels
 *      vary on which key carries this — caller passes a picker).
 *   3. Resolves the connection by `(channel, externalPropertyId)`.
 *   4. Dispatches to `handleWebhookForChannel` which verifies the
 *      signature + parses + ingests.
 *   5. Returns 200 quickly so the channel doesn't retry.
 *
 * Per the launch prompt's "return 200 OK quickly" constraint, we keep
 * the request-path lean — heavy lifting (e.g. follow-up sync after
 * `inventory.modified`) is queued via the existing job dispatcher
 * rather than inlined here.
 */

export interface ChannelWebhookConfig {
  channel: ChannelName;
  /** HTTP header carrying the HMAC signature (e.g. "X-Booking-Signature"). */
  signatureHeader: string;
  /** Picker that finds the external property ID inside the parsed payload. */
  pickExternalPropertyId: (payload: Record<string, unknown>) => string | null;
}

export async function handleChannelWebhook(
  request: NextRequest,
  config: ChannelWebhookConfig,
): Promise<NextResponse> {
  const db = getDb();
  if (!db) {
    return NextResponse.json(
      { error: "database unavailable" },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get(config.signatureHeader) ?? "";
  if (!signature) {
    return NextResponse.json(
      { error: "missing signature header" },
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

  const externalPropertyId = config.pickExternalPropertyId(payload);
  if (!externalPropertyId) {
    return NextResponse.json(
      { error: "could not locate external property ID in payload" },
      { status: 400 },
    );
  }

  const [connection] = await db
    .select({
      id: channelConnections.id,
      webhookSecret: channelConnections.webhookSecret,
    })
    .from(channelConnections)
    .where(
      and(
        eq(channelConnections.channel, config.channel),
        eq(channelConnections.externalPropertyId, externalPropertyId),
      ),
    )
    .limit(1);
  if (!connection) {
    // 404 (not 401) so the channel knows it's a config issue, not auth.
    return NextResponse.json(
      { error: "no matching channel connection" },
      { status: 404 },
    );
  }
  if (!connection.webhookSecret) {
    return NextResponse.json(
      { error: "connection has no webhook secret configured" },
      { status: 412 },
    );
  }

  const result = await handleWebhookForChannel({
    connectionId: connection.id,
    rawBody,
    signature,
    webhookSecret: connection.webhookSecret,
  });

  if (!result.ok) {
    // 401 for signature failures (per security best practice — channels
    // retry on 5xx but not on 4xx).
    if (result.error === "invalid signature") {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }
    return NextResponse.json(
      { error: result.error ?? "ingestion failed" },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      eventType: result.event?.type,
      outcome: result.outcome,
    },
    { status: 200 },
  );
}

// ---------------------------------------------------------------------------
// Per-channel pickers — pulled out so each route file stays tiny.
// ---------------------------------------------------------------------------

export const PICK_PROPERTY_ID = {
  booking_com: (p: Record<string, unknown>) =>
    pickStr(p, "hotel_id") ?? pickStr(p, "hotelId"),
  airbnb: (p: Record<string, unknown>) =>
    pickStr(p, "listing_id") ?? pickStr(p, "listingId"),
  trip_com: (p: Record<string, unknown>) => pickStr(p, "hotel_id"),
  agoda: (p: Record<string, unknown>) =>
    pickStr(p, "hotel_id") ?? pickStr(p, "property_id"),
  expedia: (p: Record<string, unknown>) => pickStr(p, "hotel_id"),
  vrbo: (p: Record<string, unknown>) =>
    pickStr(p, "property_id") ?? pickStr(p, "hotel_id"),
  hotels_com: (p: Record<string, unknown>) => pickStr(p, "hotel_id"),
} satisfies Record<
  Exclude<ChannelName, "direct">,
  (p: Record<string, unknown>) => string | null
>;

function pickStr(o: Record<string, unknown>, key: string): string | null {
  const v = o[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}
