import { type NextRequest } from "next/server";
import {
  handleChannelWebhook,
  PICK_PROPERTY_ID,
} from "@/lib/channel-manager/webhook-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return handleChannelWebhook(request, {
    channel: "expedia",
    signatureHeader: "x-expedia-signature",
    pickExternalPropertyId: PICK_PROPERTY_ID.expedia,
  });
}
