-- 0120 — Booking-detail data layer.
-- Per-booking party members, itemised charge ledger, card settlement, and
-- 1:1 extras (requirements + channel-sync counters). Idempotent.

CREATE TABLE IF NOT EXISTS "booking_guests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "booking_id" uuid NOT NULL REFERENCES "bookings"("id") ON DELETE cascade,
  "full_name" text NOT NULL,
  "role" text NOT NULL DEFAULT 'accompanying',
  "kind" text NOT NULL DEFAULT 'adult',
  "is_lead_booker" boolean NOT NULL DEFAULT false,
  "owner_villa_code" text,
  "age_years" integer,
  "email" text,
  "phone" text,
  "nationality" text,
  "id_type" text,
  "id_last4" text,
  "id_verified" boolean NOT NULL DEFAULT false,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "booking_guests_booking_idx" ON "booking_guests" ("booking_id");

CREATE TABLE IF NOT EXISTS "booking_charges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "booking_id" uuid NOT NULL REFERENCES "bookings"("id") ON DELETE cascade,
  "charge_type" text NOT NULL,
  "description" text NOT NULL,
  "amount" numeric(16, 2) NOT NULL,
  "currency" text NOT NULL DEFAULT 'IDR',
  "note" text,
  "occurred_on" date,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "booking_charges_booking_idx" ON "booking_charges" ("booking_id");

CREATE TABLE IF NOT EXISTS "booking_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "booking_id" uuid NOT NULL REFERENCES "bookings"("id") ON DELETE cascade,
  "provider" text NOT NULL DEFAULT 'stripe',
  "provider_payment_id" text,
  "method" text,
  "card_brand" text,
  "card_last4" text,
  "amount" numeric(16, 2),
  "currency" text NOT NULL DEFAULT 'IDR',
  "status" text NOT NULL DEFAULT 'captured',
  "captured_at" timestamptz,
  "capture_note" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "booking_payments_booking_idx" ON "booking_payments" ("booking_id");

CREATE TABLE IF NOT EXISTS "booking_meta" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "booking_id" uuid NOT NULL UNIQUE REFERENCES "bookings"("id") ON DELETE cascade,
  "dietary" text,
  "mobility" text,
  "ops_notes" text,
  "sync_messages_auto_replied" integer NOT NULL DEFAULT 0,
  "sync_messages_routed" integer NOT NULL DEFAULT 0,
  "sync_last_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
