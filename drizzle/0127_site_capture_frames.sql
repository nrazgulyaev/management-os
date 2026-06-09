-- 0127 — Site-supervisor field-capture frames.
--
-- Backs the mobile field-capture WRITE workflow on the site-supervisor
-- cabinet (crew-on-shift counter, active-zone chips, Photo / Incident /
-- Voice-note capture + the AI "Compile & send daily summary" digest).
--
-- One row per captured frame. `frame_type` discriminates the payload:
--   · 'photo'         → photo_document_id links the uploaded blob (reuses
--                       the site-report photo-upload pipeline → documents)
--   · 'incident'      → severity ('high' | 'normal') + body
--   · 'voice'         → audio_document_id + transcript_text (AI-transcribe
--                       is a v1 stub: transcript may be a deferred note)
--   · 'note'          → free-text body
--   · 'daily_summary' → the compiled AI digest sent to the director;
--                       body holds the markdown, metadata the frame counts
--
-- Org-scoped (multi-tenant, mirrors site_report_photos). Money-free.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS "site_capture_frames" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "project_id" uuid REFERENCES "projects"("id") ON DELETE set null,
  -- frame_type: photo | incident | voice | note | daily_summary
  "frame_type" text NOT NULL,
  -- active zone chip the supervisor had selected at capture time
  "active_zone" text,
  -- crew on shift counter snapshot at capture time
  "crew_on_shift" integer,
  -- incident severity: high | normal  (null for non-incident frames)
  "severity" text,
  -- short title / caption shown in the today feed
  "title" text,
  -- free-text body / incident description / transcript / digest markdown
  "body" text,
  -- photo frame: the uploaded image document
  "photo_document_id" uuid REFERENCES "documents"("id") ON DELETE set null,
  -- voice frame: the uploaded audio document
  "audio_document_id" uuid REFERENCES "documents"("id") ON DELETE set null,
  -- voice frame: AI transcript (v1 stub — may be a deferred placeholder)
  "transcript_text" text,
  "transcript_status" text NOT NULL DEFAULT 'none',
  -- arbitrary structured extras (digest counts, gps, duration, etc.)
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "captured_by" uuid REFERENCES "app_users"("id") ON DELETE set null,
  "captured_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "site_capture_frames_org_idx"
  ON "site_capture_frames" ("organization_id", "captured_at");
CREATE INDEX IF NOT EXISTS "site_capture_frames_type_idx"
  ON "site_capture_frames" ("frame_type");
CREATE INDEX IF NOT EXISTS "site_capture_frames_project_idx"
  ON "site_capture_frames" ("project_id");
