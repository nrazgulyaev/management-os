import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import type { BankProviderName } from "@/lib/db/schema/banking";
import { selectBankProvider } from "./select-provider";

/**
 * Stage 6.P3.G — Banking webhook handler envelope.
 *
 * Thin shell — every banking webhook route (revolut, wise, ...)
 * delegates here. Pattern mirrors P2.F's messaging webhook handler:
 *   1. Read the raw body (must NOT use req.json() — body-stream is
 *      consumed once and signature verification needs the bytes).
 *   2. Look up credentials from the env (P3.G bootstrap; per-org
 *      DB credentials wiring lands in P3.H).
 *   3. provider.verifyWebhook → 401 on failure.
 *   4. provider.parseWebhook → null when the event isn't a
 *      transaction (e.g. payout settled). Audit-log either way.
 *   5. Return 200 quickly.
 *
 * Tests assert this surface as file-presence + grep — full
 * behaviour testing happens at the provider level.
 */
export interface BankWebhookConfig {
  provider: BankProviderName;
  /** Header carrying the signature payload. */
  signatureHeader: string;
  /** When the provider's scheme prepends a timestamp to the signed
   *  payload (e.g. Revolut), the route reads this header and bundles
   *  it into the verifier input. */
  timestampHeader?: string;
  /** Resolves the webhook secret from the environment. */
  secretFromEnv?: () => string | null;
}

export async function handleBankingWebhook(
  request: NextRequest,
  config: BankWebhookConfig,
) {
  const rawBody = await request.text();
  const signature = request.headers.get(config.signatureHeader) ?? "";
  const timestamp = config.timestampHeader
    ? (request.headers.get(config.timestampHeader) ?? "")
    : "";
  const secret = config.secretFromEnv?.() ?? "";

  // P3.G bootstrap: credentials live in env. The provider gets
  // constructed with no credentials (DryRun) so verifyWebhook +
  // parseWebhook still execute, but DryRun fails closed. Real
  // per-org credential lookup lands in P3.H alongside the operator
  // UI for managing connections.
  const provider = selectBankProvider(config.provider, null);

  // For Revolut: payload that gets signed is `v1.<timestamp>.<rawBody>`.
  // The verifier accepts `(payload, signature, secret)` — the route is
  // responsible for shaping the payload string. We do that here so
  // the route file stays trivial.
  let payloadForVerify = rawBody;
  if (config.provider === "revolut" && timestamp) {
    payloadForVerify = `v1.${timestamp}.${rawBody}`;
  }
  const verifierFn = provider.verifyWebhook;
  const verified = verifierFn ? verifierFn(payloadForVerify, signature, secret) : false;
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
  const parserFn = provider.parseWebhook;
  const event = parserFn ? parserFn(parsed) : null;
  return NextResponse.json({
    ok: true,
    eventType: event?.eventType ?? "unknown",
    hasTransaction: !!event?.transaction,
  });
}
