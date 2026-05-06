import { type NextRequest } from "next/server";
import {
  handleChannelWebhook,
  PICK_PROPERTY_ID,
} from "@/lib/channel-manager/webhook-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return handleChannelWebhook(request, {
    channel: "vrbo",
    // VRBO shares Expedia infrastructure but uses its own header.
    signatureHeader: "x-vrbo-signature",
    pickExternalPropertyId: PICK_PROPERTY_ID.vrbo,
  });
}
