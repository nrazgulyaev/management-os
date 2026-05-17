import { NextResponse, type NextRequest } from "next/server";
import { verifyCronAuthFromRequest } from "@/features/jobs/auth";
import { refreshDailyFxRates, isAlphaVantageConfigured } from "@/features/integrations/fx-service";

/**
 * INTEGRATIONS-1 — Daily FX refresh cron.
 *
 * Schedule (Vercel Cron): 22:00 UTC = 06:00 GMT+8. Warms the
 * fx_rates_cache for USD/IDR, USD/EUR, USD/SGD, USD/RUB so runtime
 * callers hit cache instead of the Alpha Vantage API (free tier
 * has 5 req/min / 500/day limits).
 *
 * Gracefully no-ops when ALPHAVANTAGE_API_KEY is unset — getFxRate()
 * falls back to pinned defaults in that mode, so the rest of the
 * platform stays functional.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = verifyCronAuthFromRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.reason ?? "unauthorised" }, { status: 401 });
  }
  if (!isAlphaVantageConfigured()) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "ALPHAVANTAGE_API_KEY not configured — pinned fallbacks active",
    });
  }
  try {
    const results = await refreshDailyFxRates();
    return NextResponse.json({
      ok: true,
      refreshedAt: new Date().toISOString(),
      pairs: results.map((r) => ({
        pair: r.pair,
        rate: r.result.rate,
        source: r.result.source,
      })),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
