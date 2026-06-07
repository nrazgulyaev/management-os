-- 0121 — Villa rate overrides.
-- Per-villa, per-night manual nightly-rate override consumed by the dynamic
-- pricing engine (quoteDynamicStay → quoteStay manualOverridesByDate): an
-- override wins over every rule modifier. Backs the draggable rate pins on
-- the dynamic-pricing curve. Idempotent.

CREATE TABLE IF NOT EXISTS "villa_rate_overrides" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "villa_id" uuid NOT NULL REFERENCES "villas"("id") ON DELETE cascade,
  "stay_date" date NOT NULL,
  "nightly_rate_minor" bigint NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD',
  "note" text,
  "created_by" uuid REFERENCES "app_users"("id") ON DELETE set null,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "villa_rate_overrides_villa_date_uq"
  ON "villa_rate_overrides" ("villa_id", "stay_date");
