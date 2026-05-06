import { type NextRequest } from "next/server";
import {
  handleChannelWebhook,
  PICK_PROPERTY_ID,
} from "@/lib/channel-manager/webhook-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return handleChannelWebhook(request, {
    channel: "airbnb",
    signatureHeader: "x-airbnb-signature",
    pickExternalPropertyId: PICK_PROPERTY_ID.airbnb,
  });
}
