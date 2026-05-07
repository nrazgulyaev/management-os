import { type NextRequest } from "next/server";
import { handlePaymentWebhook } from "@/lib/payment-processors/webhook-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return handlePaymentWebhook(request, {
    provider: "wise_payments",
    signatureHeader: "x-signature-sha256",
    secretFromEnv: () => process.env.WISE_PAYMENTS_WEBHOOK_PUBLIC_KEY ?? null,
  });
}
