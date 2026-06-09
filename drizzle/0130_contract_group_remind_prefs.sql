-- 0130 — Contract-group auto-remind preferences.
-- Backs the operator buyers+installments desk (/development-os/installments):
-- a per-buyer (per contract group) toggle that opts a payment plan into
-- automatic installment reminders. One row per contract group; the desk
-- treats a missing row as "auto-remind off". Idempotent.

CREATE TABLE IF NOT EXISTS "contract_group_remind_prefs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "contract_group_id" uuid NOT NULL REFERENCES "contract_groups"("id") ON DELETE cascade,
  "auto_remind_enabled" boolean NOT NULL DEFAULT false,
  "last_reminded_at" timestamptz,
  "updated_by" uuid REFERENCES "app_users"("id") ON DELETE set null,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "contract_group_remind_prefs_group_uq"
  ON "contract_group_remind_prefs" ("contract_group_id");
