import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import {
  buildPublicQuoteResponse,
  publicQuoteInputSchema,
} from "@/features/pricing/public-quote";
import { quoteForRange } from "@/features/pricing/services";
import {
  createQuoteLog,
  quoteDynamicStay,
} from "@/features/dynamic-pricing/services";
import { buildPublicQuoteSummary } from "@/features/dynamic-pricing/explainer";
import { publicQuoteParamsSchema } from "@/features/dynamic-pricing/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// -----------------------------------------------------------------------------
// Tiny in-memory token bucket. Per-IP, per-minute. Sufficient for v9C —
// the quote endpoint is read-only and deterministic, so the worst a
// flood does is push DB load. Edge / Redis-backed limiter lands later.
// -----------------------------------------------------------------------------
const RATE_LIMIT_PER_MINUTE = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;

type Bucket = { count: number; windowStart: number };
const buckets: Map<string, Bucket> = new Map();

function ipFromRequest(request: NextRequest): string {
  const fwd = request.headers.get("x-forwarded-for") ?? "";
  const first = fwd.split(",")[0]?.trim();
  if (first) return first;
  return request.headers.get("x-real-ip") ?? "unknown";
}

function rateLimit(ip: string): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || now - b.windowStart > RATE_LIMIT_WINDOW_MS) {
    buckets.set(ip, { count: 1, windowStart: now });
    return { ok: true };
  }
  b.count++;
  if (b.count > RATE_LIMIT_PER_MINUTE) {
    const elapsed = now - b.windowStart;
    return {
      ok: false,
      retryAfter: Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - elapsed) / 1000)),
    };
  }
  return { ok: true };
}

function methodNotAllowed() {
  return NextResponse.json(
    { ok: false, reason: "method_not_allowed" },
    { status: 405, headers: { Allow: "GET" } },
  );
}

const HASH_SALT = "arconique:quote-log:p104";
function hashShort(input: string | null | undefined): string | null {
  if (!input) return null;
  return createHash("sha256")
    .update(`${HASH_SALT}:${input}`, "utf8")
    .digest("hex")
    .slice(0, 16);
}

export async function GET(request: NextRequest) {
  const ip = ipFromRequest(request);
  const limited = rateLimit(ip);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, reason: "rate_limited", retryAfter: limited.retryAfter },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfter) },
      },
    );
  }

  const url = new URL(request.url);
  const parsed = publicQuoteInputSchema.safeParse({
    villaId: url.searchParams.get("villaId"),
    checkIn: url.searchParams.get("checkIn"),
    checkOut: url.searchParams.get("checkOut"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        reason: "invalid_input",
        errors: parsed.error.issues.slice(0, 3).map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

  const channelKey =
    publicQuoteParamsSchema.shape.channelKey.parse(
      url.searchParams.get("channelKey") ?? "direct",
    ) ?? "direct";

  // Run BOTH engines: the legacy rate-plan engine for the existing
  // response contract, and the dynamic-pricing engine for the new
  // fields. The dynamic engine wins when a rule set exists for the
  // villa; otherwise we fall back to the legacy result.
  let serviceQuote;
  try {
    serviceQuote = await quoteForRange({
      villaId: parsed.data.villaId,
      checkIn: parsed.data.checkIn,
      checkOut: parsed.data.checkOut,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "internal_error";
    return NextResponse.json(
      { ok: false, reason: "internal_error", message: message.slice(0, 200) },
      { status: 500 },
    );
  }

  let dynamic;
  try {
    dynamic = await quoteDynamicStay({
      villaId: parsed.data.villaId,
      checkIn: parsed.data.checkIn,
      checkOut: parsed.data.checkOut,
      channelKey,
      publicQuote: true,
    });
  } catch {
    dynamic = null;
  }

  const legacy = buildPublicQuoteResponse(serviceQuote);

  // Build the extended public response. Existing fields stay 1:1; new
  // fields are namespaced under documented keys.
  const summary = dynamic ? buildPublicQuoteSummary(dynamic.stay) : null;
  const publicNightly = dynamic?.stay.nightly.map((n) => ({
    date: n.date,
    rateMinor: n.finalRateMinor.toString(),
    available: n.available,
    publicReason: n.available
      ? null
      : n.unavailableReason === "stop_sell"
        ? "stop_sell"
        : "unavailable",
  }));

  const responseBody = {
    ...legacy,
    pricingMode: dynamic?.ruleSet ? ("dynamic" as const) : ("rate_plan" as const),
    available: dynamic?.ruleSet ? dynamic.stay.available : legacy.available,
    reason: dynamic?.ruleSet ? mapPublicReason(dynamic.stay.reason) : legacy.reason,
    totalMinor: dynamic?.ruleSet
      ? dynamic.stay.totalMinor.toString()
      : legacy.grossAmountMinor,
    averageNightlyMinor: dynamic?.ruleSet
      ? dynamic.stay.averageNightlyMinor.toString()
      : (
          BigInt(legacy.grossAmountMinor || "0") /
          BigInt(Math.max(1, legacy.nights))
        ).toString(),
    currency: dynamic?.ruleSet ? dynamic.stay.currency : legacy.currency,
    nights: dynamic?.ruleSet ? dynamic.stay.nights : legacy.nights,
    nightly: publicNightly ?? null,
    summary,
  };

  // Log to pricing_quote_logs (best-effort, public_quote=true).
  // TENANCY: stamp organizationId from the resolved rule set (the row's
  // parent) so this inline write is never org=NULL. The rule set is the
  // org-anchored entity that produced this quote; mis-stamping is
  // impossible because it was selected for this villa server-side.
  if (dynamic?.ruleSet) {
    await createQuoteLog({
      organizationId: dynamic.ruleSet.organizationId,
      villaId: parsed.data.villaId,
      projectId: null,
      channelKey,
      checkIn: parsed.data.checkIn,
      checkOut: parsed.data.checkOut,
      nights: dynamic.stay.nights,
      available: dynamic.stay.available,
      reason: dynamic.stay.reason,
      totalMinor: dynamic.stay.totalMinor,
      currency: dynamic.stay.currency,
      requestIpHash: hashShort(ip),
      userAgentHash: hashShort(request.headers.get("user-agent")),
      publicQuote: true,
      ruleSetId: dynamic.ruleSet.id,
    }).catch(() => null);
  }

  return NextResponse.json(responseBody, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      // Public read endpoint — be explicit about CORS and no creds.
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function mapPublicReason(
  r: "ok" | "no_nights" | "stop_sell" | "min_los" | "unavailable",
): string {
  switch (r) {
    case "ok":
      return "ok";
    case "no_nights":
      return "no_nights";
    case "stop_sell":
      return "stop_sell";
    case "min_los":
      return "min_los_violation";
    case "unavailable":
      return "unavailable";
  }
}

// Block other verbs explicitly so misuse returns a clean 405.
export async function POST() {
  return methodNotAllowed();
}
export async function PUT() {
  return methodNotAllowed();
}
export async function PATCH() {
  return methodNotAllowed();
}
export async function DELETE() {
  return methodNotAllowed();
}
