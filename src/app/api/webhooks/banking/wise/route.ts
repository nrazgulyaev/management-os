import { type NextRequest } from "next/server";
import { handleBankingWebhook } from "@/lib/banking/webhook-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Wise webhooks use RSA-SHA256 signing — the verifier needs Wise's
 * environment-specific public key (published as a static PEM). The
 * Wise provider currently fail-closes, so this endpoint will reject
 * inbound webhooks until the public-key plumbing lands. Cron sync
 * is the primary inbound path.
 */
export async function POST(request: NextRequest) {
  return handleBankingWebhook(request, {
    provider: "wise",
    signatureHeader: "x-signature-sha256",
    secretFromEnv: () => process.env.WISE_WEBHOOK_PUBLIC_KEY ?? null,
  });
}
