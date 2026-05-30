import "server-only";

import { sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";

/**
 * Sprint INTEGRATIONS-1 — Alpha Vantage FX service.
 *
 * Provides live currency conversion rates with a database cache.
 * Cache-first read path; falls back to Alpha Vantage API; falls back
 * again to pinned defaults if the API is missing or rate-limited.
 *
 * Pinned defaults (consistent with all prior PART-1/2 work):
 *   USD/IDR = 15,800
 *   USD/EUR = 0.92
 *   USD/SGD = 1.35
 *
 * Env required (HALT acknowledged — operator action):
 *   - ALPHAVANTAGE_API_KEY    free tier at alphavantage.co
 */

const PINNED_RATES: Record<string, number> = {
  "USD/IDR": 15_800,
  "USD/EUR": 0.92,
  "USD/SGD": 1.35,
  "USD/RUB": 90,
  "USD/CNY": 7.2,
  "USD/USDT": 1.0,
};

const ALPHA_VANTAGE_BASE = "https://www.alphavantage.co/query";
const CACHE_TTL_HOURS = 24;

export interface FxRateResult {
  rate: number;
  fromCurrency: string;
  toCurrency: string;
  fetchedAt: Date;
  source: "alpha_vantage" | "cache" | "pinned_fallback";
}

function pinnedRate(from: string, to: string): number {
  const key = `${from}/${to}`;
  if (PINNED_RATES[key]) return PINNED_RATES[key];
  if (from === to) return 1;
  // Cross-rate via USD if possible.
  const fromUsd = PINNED_RATES[`USD/${from}`];
  const toUsd = PINNED_RATES[`USD/${to}`];
  if (fromUsd && toUsd) return toUsd / fromUsd;
  return 1;
}

function isAlphaVantageConfigured(): boolean {
  return Boolean(process.env.ALPHAVANTAGE_API_KEY);
}

interface AlphaVantageResponse {
  "Realtime Currency Exchange Rate"?: {
    "5. Exchange Rate"?: string;
    "1. From_Currency Code"?: string;
    "3. To_Currency Code"?: string;
  };
  Note?: string; // rate limit message
  "Error Message"?: string;
}

async function fetchFromAlphaVantage(
  fromCurrency: string,
  toCurrency: string,
): Promise<number | null> {
  const key = process.env.ALPHAVANTAGE_API_KEY;
  if (!key) return null;
  const url = new URL(ALPHA_VANTAGE_BASE);
  url.searchParams.set("function", "CURRENCY_EXCHANGE_RATE");
  url.searchParams.set("from_currency", fromCurrency);
  url.searchParams.set("to_currency", toCurrency);
  url.searchParams.set("apikey", key);
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as AlphaVantageResponse;
    if (json["Error Message"] || json.Note) return null; // includes rate-limited responses
    const rateStr = json["Realtime Currency Exchange Rate"]?.["5. Exchange Rate"];
    if (!rateStr) return null;
    const rate = Number(rateStr);
    return Number.isFinite(rate) && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}

async function readFromCache(
  fromCurrency: string,
  toCurrency: string,
): Promise<{ rate: number; fetchedAt: Date } | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db.execute<{ rate: string; fetched_at: string }>(sql`
    SELECT rate::text AS rate, fetched_at::text AS fetched_at
      FROM fx_rates_cache
     WHERE from_currency = ${fromCurrency}
       AND to_currency = ${toCurrency}
       AND fetched_at > (NOW() - INTERVAL '${sql.raw(CACHE_TTL_HOURS.toString())} hours')
     ORDER BY fetched_at DESC
     LIMIT 1
  `);
  const r = rowsOf<{ rate: string; fetched_at: string }>(rows)[0];
  if (!r) return null;
  const rate = Number(r.rate);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return { rate, fetchedAt: new Date(r.fetched_at) };
}

async function writeToCache(
  fromCurrency: string,
  toCurrency: string,
  rate: number,
): Promise<void> {
  const db = getDb();
  if (!db) return;
  const today = new Date().toISOString().slice(0, 10);
  try {
    await db.execute(sql`
      INSERT INTO fx_rates_cache (from_currency, to_currency, rate, rate_date, source)
      VALUES (${fromCurrency}, ${toCurrency}, ${rate.toString()}::numeric, ${today}::date, 'alpha_vantage')
      ON CONFLICT (from_currency, to_currency, rate_date)
      DO UPDATE SET rate = EXCLUDED.rate, fetched_at = NOW()
    `);
  } catch {
    // Cache write failures are non-fatal.
  }
}

export async function getFxRate(
  fromCurrency = "USD",
  toCurrency = "IDR",
): Promise<FxRateResult> {
  if (fromCurrency === toCurrency) {
    return {
      rate: 1,
      fromCurrency,
      toCurrency,
      fetchedAt: new Date(),
      source: "pinned_fallback",
    };
  }

  // 1. Cache
  const cached = await readFromCache(fromCurrency, toCurrency);
  if (cached) {
    return {
      rate: cached.rate,
      fromCurrency,
      toCurrency,
      fetchedAt: cached.fetchedAt,
      source: "cache",
    };
  }

  // 2. Live fetch (if configured)
  if (isAlphaVantageConfigured()) {
    const live = await fetchFromAlphaVantage(fromCurrency, toCurrency);
    if (live !== null) {
      await writeToCache(fromCurrency, toCurrency, live);
      return {
        rate: live,
        fromCurrency,
        toCurrency,
        fetchedAt: new Date(),
        source: "alpha_vantage",
      };
    }
  }

  // 3. Pinned fallback
  return {
    rate: pinnedRate(fromCurrency, toCurrency),
    fromCurrency,
    toCurrency,
    fetchedAt: new Date(),
    source: "pinned_fallback",
  };
}

/** Convenience wrapper — most callers just want the number. */
export async function getUsdToIdr(): Promise<number> {
  const r = await getFxRate("USD", "IDR");
  return r.rate;
}

/** Cron-handler payload: refresh the operator's working FX pairs. */
export async function refreshDailyFxRates(): Promise<Array<{ pair: string; result: FxRateResult }>> {
  const pairs: Array<[string, string]> = [
    ["USD", "IDR"],
    ["USD", "EUR"],
    ["USD", "SGD"],
    ["USD", "RUB"],
  ];
  const results: Array<{ pair: string; result: FxRateResult }> = [];
  for (const [from, to] of pairs) {
    const result = await getFxRate(from, to);
    results.push({ pair: `${from}/${to}`, result });
  }
  return results;
}

export { isAlphaVantageConfigured };
