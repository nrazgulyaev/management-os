import "server-only";

import { lte, gte, and, desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { devFxSnapshots } from "@/lib/db/schema/dev-finance";
import type { SupportedCurrency } from "@/lib/development/constants/investor-constants";

export type FxSnapshot = typeof devFxSnapshots.$inferSelect;

const RATE_COLUMN: Record<SupportedCurrency, keyof FxSnapshot | null> = {
  USD: null, // base currency
  IDR: "rateIdr",
  RUB: "rateRub",
  EUR: "rateEur",
  USDT: "rateUsdt",
  CNY: "rateCny",
};

/**
 * Returns the most recent FX rate for the given currency. USD always
 * returns 1.0. Returns null if no snapshot exists for that currency.
 */
export async function getCurrentFXRate(
  currency: SupportedCurrency,
): Promise<number | null> {
  if (currency === "USD") return 1.0;
  const db = getDb();
  if (!db) return null;
  const col = RATE_COLUMN[currency];
  if (!col) return null;
  const [r] = await db
    .select()
    .from(devFxSnapshots)
    .orderBy(desc(devFxSnapshots.snapshotDate))
    .limit(1);
  if (!r) return null;
  const v = (r as Record<string, unknown>)[col];
  return v ? Number(v) : null;
}

/**
 * Historical FX lookup. Falls back to nearest prior snapshot when the
 * exact date isn't recorded — matches the daily-recording cadence so
 * intra-day or weekend transactions get a stable rate.
 */
export async function getFXAtDate(
  currency: SupportedCurrency,
  date: string,
): Promise<number | null> {
  if (currency === "USD") return 1.0;
  const db = getDb();
  if (!db) return null;
  const col = RATE_COLUMN[currency];
  if (!col) return null;
  const [r] = await db
    .select()
    .from(devFxSnapshots)
    .where(lte(devFxSnapshots.snapshotDate, date))
    .orderBy(desc(devFxSnapshots.snapshotDate))
    .limit(1);
  if (!r) return null;
  const v = (r as Record<string, unknown>)[col];
  return v ? Number(v) : null;
}

export async function getFXHistory(
  currency: SupportedCurrency,
  fromDate: string,
  toDate: string,
): Promise<{ date: string; rate: number }[]> {
  if (currency === "USD") return [];
  const db = getDb();
  if (!db) return [];
  const col = RATE_COLUMN[currency];
  if (!col) return [];
  const rows = await db
    .select()
    .from(devFxSnapshots)
    .where(
      and(
        gte(devFxSnapshots.snapshotDate, fromDate),
        lte(devFxSnapshots.snapshotDate, toDate),
      ),
    )
    .orderBy(devFxSnapshots.snapshotDate);
  return rows.map((r) => ({
    date: String(r.snapshotDate),
    rate: Number((r as Record<string, unknown>)[col] ?? 0),
  }));
}

export async function getLatestFXSnapshot(): Promise<FxSnapshot | null> {
  const db = getDb();
  if (!db) return null;
  const [r] = await db
    .select()
    .from(devFxSnapshots)
    .orderBy(desc(devFxSnapshots.snapshotDate))
    .limit(1);
  return r ?? null;
}
