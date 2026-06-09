-- 0131 — Villa rental-pool state (P1 owner-calendar-pool).
-- One row per villa, tracking whether the owner has the villa IN the
-- rental pool (available for guest bookings) or has TAKEN IT OUT for
-- personal use. A take-out enters a 14-day cooling-off window before it
-- becomes effective; a return-to-pool likewise cools off. Drives the
-- interactive /owner/calendar pool-manager surface.
--
-- Single-tenant pattern: mirrors villas/bookings (no organization_id).
-- Scope flows through the villa → ownership_shares graph. Idempotent.

CREATE TABLE IF NOT EXISTS "villa_pool_state" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "villa_id" uuid NOT NULL REFERENCES "villas"("id") ON DELETE cascade,
  -- pool_status: in_pool | out_of_pool
  "pool_status" text NOT NULL DEFAULT 'in_pool',
  -- The app_user (owner-portal grant) that last toggled the state.
  "changed_by_app_user_id" uuid REFERENCES "app_users"("id") ON DELETE set null,
  -- When the most recent take-out / return request was made.
  "requested_at" timestamptz,
  -- 14-day cooling-off boundary: the pending status becomes effective at
  -- this instant. NULL once the cooling-off has elapsed (state is stable).
  "cooling_off_until" timestamptz,
  -- The status the villa is transitioning TO during cooling-off (mirrors
  -- pool_status once effective). NULL when no transition is pending.
  "pending_status" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- One pool-state row per villa.
CREATE UNIQUE INDEX IF NOT EXISTS "villa_pool_state_villa_uniq"
  ON "villa_pool_state" ("villa_id");
CREATE INDEX IF NOT EXISTS "villa_pool_state_status_idx"
  ON "villa_pool_state" ("pool_status");
CREATE INDEX IF NOT EXISTS "villa_pool_state_cooling_idx"
  ON "villa_pool_state" ("cooling_off_until");
