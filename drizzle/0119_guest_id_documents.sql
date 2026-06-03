-- 0119 — Guest ID documents (FC-GUEST/MGMT front-office, Phase 3: passport OCR).
--
-- One row per booking's identity document. The scan file lives in `documents`
-- (Supabase Storage); this table holds the id-ocr extraction (name, nationality,
-- document number, expiry, confidence) + the human-in-the-loop review status.
-- confidence < 0.85 → status stays 'pending_review' for manual override.

CREATE TABLE IF NOT EXISTS guest_id_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  guest_id uuid REFERENCES guests(id) ON DELETE SET NULL,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  doc_type text NOT NULL DEFAULT 'passport',
  status text NOT NULL DEFAULT 'pending_review',
  full_name text,
  nationality text,
  document_number text,
  expires_at text,
  confidence numeric(4, 3) NOT NULL DEFAULT 0,
  raw jsonb,
  extracted_at timestamptz,
  reviewed_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS guest_id_documents_booking_unique ON guest_id_documents (booking_id);
CREATE INDEX IF NOT EXISTS guest_id_documents_status_idx ON guest_id_documents (status);
