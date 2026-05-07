import { type NextRequest } from "next/server";
import { handleBankingWebhook } from "@/lib/banking/webhook-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return handleBankingWebhook(request, {
    provider: "revolut",
    signatureHeader: "revolut-signature",
    timestampHeader: "revolut-request-timestamp",
    secretFromEnv: () => process.env.REVOLUT_WEBHOOK_SECRET ?? null,
  });
}
