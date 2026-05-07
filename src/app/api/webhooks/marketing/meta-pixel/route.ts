import { type NextRequest, NextResponse } from "next/server";
import { selectMarketingProvider } from "@/lib/marketing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Meta Pixel webhook stub. Meta does NOT push Pixel-traffic webhooks
 * to operators — events flow IN via Conversions API and OUT via the
 * Meta Ads Reporting API. This route exists so the operator can
 * register the URL in Meta's app dashboard for "subscribed events"
 * (e.g. messages / page activity), but the Pixel provider itself
 * fail-closes verifyWebhook.
 *
 * Returns 200 with `ok: false, ignored: true` when no real wiring
 * exists, so Meta's retry logic doesn't escalate.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const provider = selectMarketingProvider("meta_pixel", null);
  const signature = request.headers.get("x-hub-signature-256") ?? "";
  const verifierFn = provider.verifyWebhook;
  const verified = verifierFn ? verifierFn(rawBody, signature, "") : false;
  return NextResponse.json({
    ok: true,
    verified,
    ignored: !verified,
    note: "Meta Pixel webhooks are not the conversion path — see Conversions API (P4.B).",
  });
}

export async function GET(request: NextRequest) {
  // Meta verify-token handshake: ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.META_PIXEL_WEBHOOK_VERIFY_TOKEN ?? "";
  if (mode === "subscribe" && token && expected && token === expected) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return NextResponse.json({ ok: false, error: "verify_token_mismatch" }, { status: 403 });
}
