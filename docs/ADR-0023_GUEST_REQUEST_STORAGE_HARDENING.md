# ADR-0023 — Guest Request Storage Hardening (v9L)

Status: Accepted · 2026-04-29

## Context

V9K shipped guest concierge attachments end-to-end, but with three
acknowledged gaps:

1. **No EXIF / metadata stripping.** Storage isolation (private
   bucket, signed-URL-only) mitigated the worst case but didn't
   strip embedded geolocation from JPEG / PNG.
2. **No stale-row cleanup.** A guest who walked away after picking a
   file but before the upload completed left a `pending` row hanging
   around forever.
3. **No bucket validation.** Operators were told to create the
   `guest-request-attachments` bucket manually with no in-product way
   to confirm they did, or that it was private.

V9L closes all three. SSE/streaming is intentionally NOT in this
release — the storage path needed hardening first.

## Decisions

### 1. Two new column groups + indexes on `guest_ai_handoff_reply_attachments`

```
metadata_status        pending | stripped | not_required | warning | failed
metadata_stripped_at
metadata_error
original_size_bytes
processed_size_bytes
cleanup_eligible_at
deleted_reason         stale_pending | guest_deleted | staff_deleted |
                        security_rejected | storage_missing
security_scan_status   not_scanned | passed | warning | failed
security_scan_notes

attachment_metadata_status_idx
attachment_cleanup_eligible_idx     (partial: WHERE NOT NULL)
attachment_security_scan_status_idx
```

CHECKs at the migration layer pin every enum value the application
relies on. `metadata_status='not_required'` is auto-applied to
existing PDFs by the migration so the v9K backfill doesn't need a
manual sweep.

### 2. Post-upload processing pipeline

```
guest uploads bytes via signed URL
        │
        ▼
register* action
        │
        ├─ flips upload_status = 'uploaded'
        └─ kicks processAttachmentMetadata(id)
                ├─ application/pdf → metadata_status='not_required',
                │                    security_scan_status='passed'
                ├─ image/jpeg → strip APP1 (EXIF + XMP), reupload
                ├─ image/png  → strip tEXt/zTXt/iTXt, reupload
                ├─ image/webp → metadata_status='warning' (passthrough)
                └─ unknown    → metadata_status='failed'
        ▼
guest projection filters:
  uploaded ∧ guest_visible ∧ metadata in (stripped | not_required | warning)
                            ∧ scan in (passed | warning)
```

The pure stripper (`metadata-strip-pure.ts`) is the single source of
truth for the byte rules. It uses only `Buffer` — no native image
library — so the build stays lean and the test suite can pin
synthetic fixtures.

#### JPEG

We walk the marker stream and drop every `APP1` segment (covers
both EXIF `Exif\0\0…` and XMP `http://ns.adobe.com/xap…`). Every
other marker — including `APP0` JFIF, `APP2` ICC profiles, and the
`SOS` entropy block — is preserved byte-for-byte. Output starts at
`SOI` and ends at `EOI`, matching JPEG spec. If the input fails any
shape check (bad marker, truncated segment) we return `failed` and
the row is hidden from the guest.

#### PNG

We split the chunk stream on the `length / type / data / CRC` shape,
drop `tEXt`, `zTXt`, `iTXt`, and re-emit every other chunk
unchanged. CRCs are preserved byte-for-byte for kept chunks; we
never recompute. `IEND` sentinel is required, otherwise we return
`failed`.

#### WebP — deferred

Rebuilding RIFF chunks (`EXIF`, `XMP `, `VP8X`, animation lists)
without breaking VP8L / VP8 chunks is risky without a vetted native
dependency. v9L marks WebP as `metadata_status='warning'` +
`security_scan_status='warning'`, leaves the bytes alone, surfaces
"review (webp)" badges to admins, and serves the file to guests
behind the same signed-URL+TTL guarantees as everything else. This
is documented in the admin Storage page and in the README. v9M can
add a WebP stripper.

#### PDF — not processed

We don't touch PDFs. They're marked `not_required` immediately on
register. v9M may add a PDF metadata sweeper.

### 3. Storage bucket validation

`storage-bucket.ts` introduces three helpers:

- `getGuestRequestAttachmentStorageHealth()` — reads the bucket
  list, confirms the bucket exists, reports a `private` flag (`ok`
  / `failed` / `unknown` depending on what the Supabase SDK returns
  this version), and runs a probe to see whether
  `createSignedUploadUrl` and `createSignedUrl` succeed.
- `validateGuestRequestAttachmentBucketAction()` — admin-only
  wrapper of the above, audit-logged.
- `ensureGuestRequestAttachmentBucketConfigured()` — boolean
  predicate the storage page uses to render a "configure me" banner.

The `private` flag is intentionally `unknown` when the SDK doesn't
expose it — we never claim a bucket is private when we can't verify
it. The admin page surfaces every `note` returned by the health
function so operators see exactly why a check is `unknown`.

### 4. Stale cleanup

`cleanupStalePendingAttachments()`:
- Selects rows where `upload_status='pending'` AND
  `created_at < now() - 24h`.
- For each, `deleteStorageObject` (best-effort) and flips the row
  to `upload_status='deleted'` with `deleted_reason='stale_pending'`.
- Audit-logs every delete.

Failed-metadata rows are NOT auto-deleted — they're triaged by
operators on the admin storage page so we don't lose evidence
unnecessarily.

A new job key `guest_request_attachment_cleanup` (jobType
`attachment_cleanup`) runs daily at 04:00 UTC via
`/api/cron/guest-request-attachments-cleanup` (CRON_SECRET-gated).
The same runner is callable from the admin storage page via the
"Cleanup stale pending" button.

### 5. Client-side resize

`maybeResizeAttachment` in `client-image-resize.ts` is a Web-Crypto-
and-Canvas-only helper:
- Refuses non-images (returns `not_an_image`) and oversize PDFs
  (returns `not_resizable_pdf`).
- For oversize JPEG / PNG / WEBP, walks a longest-edge ladder
  `[2400, 2000, 1600, 1280, 1024]` × a quality ladder
  `[0.92, 0.85, 0.78, 0.7, 0.6, 0.5]` until the output drops below
  8 MB. Returns `still_too_large` if no combination fits.
- No external dependency. Tested via static-source for shape; the
  canvas pipeline isn't exercised in the Node test runner (no DOM).

The guest uploader runs the helper before the signed-URL request,
so the server still applies the same 8 MB cap and the existing
defence-in-depth checks at the action / DB layer.

### 6. Admin UI

New route `/dashboard/guest-ai/storage` shows:

1. Storage bucket health (exists / private / signed upload / signed
   download).
2. Attachment processing health (pending uploads, pending metadata,
   failed metadata, stale pending counts).
3. Recent failed metadata strips (last 20, with file name + MIME +
   error + a link back to the handoff).
4. Cron status pill + manual buttons for **Validate bucket**,
   **Strip pending metadata**, **Cleanup stale pending**.

The admin handoff detail page now renders a per-attachment metadata
badge (`metadata stripped` / `no metadata` / `review (webp)` /
`strip failed` / `processing`). Failed rows do NOT render a
download link, even for admins — operators must intentionally fall
back to the storage page to retry processing.

### 7. Guest UI

The guest projection (`listGuestVisibleAttachmentsForHandoff`)
filters out rows that aren't yet safe. A separate
`pendingGuestAttachmentsForHandoff` returns only the guest's own
pending / failed rows so the request detail page can render
"Processing file securely…" or "This file could not be processed
safely. Please try another file." in place of the missing
attachment. No technical error details are surfaced to the guest.

### 8. Security events

Existing v9G/J `recordSecurityEvent` is reused. New cases:

- Bad MIME upload attempt → `suspicious_access` severity `low`.
- Repeated rejections from the same token → severity `medium` (the
  helper `logRejectedUpload({ reason: 'repeated' })` is exposed for
  future v9M wiring).
- Metadata strip failure → no security event by default; the
  attachment is filtered out and admins triage on the storage page.

## Trade-offs

- **No native image library.** Pure-Buffer stripping keeps the build
  lean but means we accept a `warning` outcome for WebP and a
  `not_required` for PDFs in v9L.
- **Best-effort storage delete on cleanup.** If the storage object
  doesn't exist (already gone, or the bucket lookup fails), we still
  flip the DB row to `deleted` so the guest projection doesn't keep
  rendering it.
- **`bucket_private` may report `unknown`.** Supabase's `listBuckets`
  doesn't always include the `public` flag. We surface `unknown`
  + a note rather than silently claiming `ok`.
- **Re-upload on every successful strip.** We could reuse the
  signed-upload URL minted at upload time but that complicates the
  flow. Re-upload via `admin.storage.upload(..., { upsert: true })`
  is simple and correct.
- **Failed metadata rows persist.** Admins must triage via the
  storage page; they don't show up to guests.

## Out of scope (deferred)

- WebP metadata stripping.
- PDF metadata stripping.
- Per-image redaction of GPS coordinates *only* (currently we strip
  the whole APP1 / text-chunk set).
- Async processing queue — v9L runs the strip inline in the
  register action. For very large estates this could move to the
  job runner.
- Server-side virus scanning / content moderation.
- Real-time notification when processing finishes.

## Operational runbook

### Manual Supabase bucket setup checklist

1. Open Supabase Dashboard → Project → Storage.
2. **Create bucket** → name **`guest-request-attachments`** → set
   **Public bucket: OFF**.
3. Open `/dashboard/guest-ai/storage` and click **Validate bucket**.
   Expected: `bucket exists = ok`, `private = ok` (or `unknown`
   with a note), `signed upload = ok`, `signed download = warning`
   (because the probe path doesn't have an object yet — that's
   fine).
4. Upload a test attachment from `/stay/[token]/requests/[code]`
   and confirm the signed URL renders.

### Routine ops

- **Daily cron** runs at 04:00 UTC. Verify it ran via
  `/dashboard/jobs/runs` — look for `guest_request_attachment_cleanup`.
- **Manual triggers** are on `/dashboard/guest-ai/storage` —
  Validate bucket / Strip pending metadata / Cleanup stale pending.
- **Failed metadata** triage from the same page — open the linked
  handoff and decide whether to re-upload, ask the guest to
  re-attach, or close.

### Troubleshooting

- *"Bucket not found"* → create it as a private bucket via the
  dashboard checklist above.
- *"Signed upload probe failed"* → check that the
  `SUPABASE_SERVICE_ROLE_KEY` env var is set (server-only). The
  health page surfaces the underlying error.
- *Guest sees "could not be processed"* → admin storage page →
  failed strips list → click through. Most common reason is the
  uploaded bytes were corrupt / not a valid JPEG-PNG.
