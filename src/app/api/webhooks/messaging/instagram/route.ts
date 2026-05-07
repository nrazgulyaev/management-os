import { type NextRequest } from "next/server";
import { handleMessagingWebhook } from "@/lib/messaging/webhook-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleMessagingWebhook(request, {
    channel: "instagram",
    signatureHeader: "x-hub-signature-256",
    metaVerifyToken: process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ?? undefined,
  });
}

export async function POST(request: NextRequest) {
  return handleMessagingWebhook(request, {
    channel: "instagram",
    signatureHeader: "x-hub-signature-256",
  });
}
