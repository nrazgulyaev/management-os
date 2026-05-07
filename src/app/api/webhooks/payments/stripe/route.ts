import { type NextRequest } from "next/server";
import { handlePaymentWebhook } from "@/lib/payment-processors/webhook-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return handlePaymentWebhook(request, {
    provider: "stripe",
    signatureHeader: "stripe-signature",
    secretFromEnv: () => process.env.STRIPE_WEBHOOK_SECRET ?? null,
  });
}
