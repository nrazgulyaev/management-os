-- Migration 0137 — contract_signatures
--
-- Block 02 (BUYER MONEY). Captures a legally-meaningful e-signature event on a
-- contract group from the buyer portal. The `contracts` / `contract_groups`
-- tables already carry signing STATE (signed_at / first_signed_at /
-- fully_signed_at + status), but they do not record WHO signed, the consent
-- they gave, the captured identity, or a content hash. This table is that
-- record: an append-only signature log scoped to the buyer.
--
-- There is NO real e-sign provider (DocuSign etc.) and NO real PSP — this is a
-- manual typed-name signature captured in the portal, mirroring the manual
-- mark-paid pattern. Idempotent.

CREATE TABLE IF NOT EXISTS contract_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_group_id uuid NOT NULL
    REFERENCES contract_groups(id) ON DELETE CASCADE,
  -- The buyer who signed (buyers.id). Plain uuid (no FK) to avoid an import
  -- cycle with the buyers module; ownership is enforced in the action.
  buyer_id uuid NOT NULL,
  buyer_code text NOT NULL,
  -- Captured at sign time.
  signer_name text NOT NULL,
  signer_email text,
  -- 'buyer' for portal-captured signatures.
  signer_role text NOT NULL DEFAULT 'buyer',
  -- 'typed_name' is the only method until a real e-sign provider lands.
  method text NOT NULL DEFAULT 'typed_name',
  -- The exact consent text the buyer agreed to (audit-grade).
  consent_text text NOT NULL,
  -- Snapshot of the contract value at sign time, bigint MINOR units.
  signed_value_usd_minor bigint NOT NULL DEFAULT 0,
  -- Content hash of the signed payload (group id + value + signer + ts).
  signed_hash text,
  ip_address text,
  user_agent text,
  signed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contract_signatures_group_idx
  ON contract_signatures (contract_group_id);
CREATE INDEX IF NOT EXISTS contract_signatures_buyer_idx
  ON contract_signatures (buyer_id);

-- One ACTIVE buyer signature per group (a buyer signs a group once). Allows
-- re-running the migration without duplicating; the action also guards.
CREATE UNIQUE INDEX IF NOT EXISTS contract_signatures_group_buyer_unique
  ON contract_signatures (contract_group_id, buyer_id);
