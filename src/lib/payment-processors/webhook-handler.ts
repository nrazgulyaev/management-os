import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import type { PaymentProviderName } from "@/lib/db/schema/payment-processors";
import { selectPaymentProvider } from "./select-provider";

/**
 * Stage 6.P3.G — Payment-processor webhook handler envelope.
 *
 * Same pattern as the banking handler. Critical difference: payment
 * webhooks MUST verify signatures — DryRun fails closed by design,
 * so without real credentials this endpoint will reject every
 * inbound webhook (correct: a misconfigured environment should not
 * silently accept signed payloads on a financial surface).
 */
export interface PaymentWebhookConfig {
  provider: PaymentProviderName;
  /** Header carrying the signature payload. */
  signatureHeader: string;
  secretFromEnv?: () => string | null;
}

export async function handlePaymentWebhook(
  request: NextRequest,
  config: PaymentWebhookConfig,
) {
  const rawBody = await request.text();
  const signature = request.headers.get(config.signatureHeader) ?? "";
  const secret = config.secretFromEnv?.() ?? "";

  // P3.G bootstrap: env-only credentials. Real per-org wiring lands
  // alongside the connection-management UI.
  const provider = selectPaymentProvider(config.provider, null);

  const verified = provider.verifyWebhook(rawBody, signature, secret);
  if (!verified) {
    return NextResponse.json(
      { ok: false, error: "signature_verification_failed" },
      { status: 401 },
    );
  }

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }
  const event = provider.parseWebhook(parsed);
  return NextResponse.json({
    ok: true,
    eventType: event?.eventType ?? "unknown",
    externalIntentId: event?.externalIntentId ?? null,
    lifecycleState: event?.lifecycleState ?? null,
  });
}
