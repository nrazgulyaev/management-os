-- INTEGRATIONS-1 — FX rate cache for live currency conversion.
--
-- Primary cache for per-day FX rates fetched from Alpha Vantage
-- (free tier, 5 req/min / 500/day). Cron warms USD/IDR + USD/EUR +
-- USD/SGD daily; runtime callers read from cache first, fall back
-- to pinned defaults (15,800 IDR/USD) on cache miss + API failure.

BEGIN;

CREATE TABLE IF NOT EXISTS "fx_rates_cache" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "from_currency" TEXT NOT NULL,
  "to_currency" TEXT NOT NULL,
  "rate" NUMERIC(20, 8) NOT NULL,
  "rate_date" DATE NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'alpha_vantage',
  "fetched_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "fx_rates_cache_pair_date_unique"
    UNIQUE ("from_currency", "to_currency", "rate_date")
);

CREATE INDEX IF NOT EXISTS "fx_rates_cache_pair_idx"
  ON "fx_rates_cache" ("from_currency", "to_currency");
CREATE INDEX IF NOT EXISTS "fx_rates_cache_date_idx"
  ON "fx_rates_cache" ("rate_date" DESC);

COMMIT;
