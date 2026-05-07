import { type NextRequest } from "next/server";
import { handleMessagingWebhook } from "@/lib/messaging/webhook-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return handleMessagingWebhook(request, {
    channel: "telegram",
    // Telegram echoes the secret_token registered via setWebhook.
    signatureHeader: "x-telegram-bot-api-secret-token",
  });
}
