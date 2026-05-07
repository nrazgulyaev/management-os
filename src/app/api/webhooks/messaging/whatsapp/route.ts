import { type NextRequest } from "next/server";
import { handleMessagingWebhook } from "@/lib/messaging/webhook-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  // Meta verify-token handshake (set in app dashboard at register time).
  return handleMessagingWebhook(request, {
    channel: "whatsapp",
    signatureHeader: "x-hub-signature-256",
    metaVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? undefined,
  });
}

export async function POST(request: NextRequest) {
  return handleMessagingWebhook(request, {
    channel: "whatsapp",
    signatureHeader: "x-hub-signature-256",
  });
}
