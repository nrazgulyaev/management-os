# ADR-0022 — Guest Request Attachments + Per-Message Read Receipts (v9K)

Status: Accepted · 2026-04-29

## Context

V9J shipped the two-way request center. Guests could see staff
replies, send follow-ups, watch system status updates land. What was
still missing:

1. **Attachments.** Concierge questions like "the AC is leaking — see
   the photo" or "here's our flight itinerary, please pick us up"
   forced guests back into the v9I free-text composer with no way to
   send a file.
2. **Per-message receipts.** The unread counters from v9J were
   handoff-level only. The guest couldn't tell if any *specific*
   reply had been read by staff; ops couldn't tell which guest
   message they'd seen and which was new.
3. **Internal-note isolation.** Booking managers (read-only role)
   could see internal staff notes that other senior roles intended
   for ops eyes only.

V9K closes those three gaps in one shot, while keeping every v9G–v9J
guarantee:

- AI is still strictly read-only. The AI never gets attachment tools,
  never mints signed URLs, never reads internal notes.
- No streaming yet — that's v9L.

## Decisions

### 1. Two new internal-only tables

```
guest_ai_handoff_reply_reads
  ─ reply_id          (cascade)
  ─ handoff_id        (cascade)
  reader_type         guest | staff
  ─ reader_app_user_id (set null)
  ─ reader_token_id    (cascade)
  read_at + created_at
  UNIQUE (reply_id, reader_type, COALESCE(app_user_id, token_id, …))

guest_ai_handoff_reply_attachments
  ─ reply_id           (cascade)
  ─ handoff_id         (cascade)
  ─ service_request_id (set null)
  storage_bucket       'guest-request-attachments' default
  storage_path         (server-only — never projected to guests)
  file_name + mime_type + size_bytes
  uploaded_by_type     guest | staff
  ─ uploaded_by_*       (one of two FKs by uploader_type)
  upload_status        pending | uploaded | failed | deleted
  visibility           guest_visible | internal_only
  image_width / height / checksum_sha256
  created/uploaded/deleted timestamps
  UNIQUE (storage_bucket, storage_path)
```

Both force RLS internal-only with `internal_read` + `internal_write`
policies. Guests never query either table directly; the server
actions resolve token → handoff first, then read through the
service-role client.

CHECKs at the migration layer pin every enum value the application
relies on (`mime_type` set: `image/jpeg | image/png | image/webp |
application/pdf`; `size_bytes` BETWEEN 1 AND 8 MB).

The COALESCE-based unique index on the reads table uses a sentinel
zero-UUID so a single index covers both staff (one row per app user)
and guest (one row per stay token) without NULL ambiguity.

### 2. MIME / size / count caps

Single source of truth in `attachments-pure.ts`:

```
MIME       image/jpeg | image/png | image/webp | application/pdf
size       1 byte – 8 MB
per reply  ≤ 3 attachments (counted on pending + uploaded)
URL TTL    10 minutes (signed download)
```

Three layers enforce it:

1. Zod schema (`attachments-schema.ts`) on the action input.
2. Pure validator (`validateAttachmentMetadata`) — defence-in-depth so
   if a future caller bypasses the action layer the same rules
   apply.
3. DB CHECK constraints in the migration. Even a manual SQL insert
   bounces.

### 3. Storage path is server-only

`storage_path` is the *only* identifier the server uses to mint a
signed URL via `createSignedDownloadUrl`. It is never projected into
a guest response shape: the guest-facing `GuestAttachmentView` type
lives in `attachments-services.ts` and explicitly omits
`storagePath`. A static-source test asserts that the guest detail
page at `/stay/[token]/requests/[code]` doesn't reference
`storage_path` / `storagePath`.

Signed URLs expire in 10 minutes. Each list call mints fresh URLs;
guests never see a permanent link.

### 4. Per-message read receipts

`recordGuestReadReceipts` and `recordStaffReadReceipts` are
idempotent — they pull the unread set, diff against existing rows,
and `INSERT … ON CONFLICT DO NOTHING`. Visiting the guest detail
page or admin handoff detail page triggers the corresponding
recorder; the v9J handoff-level `guest_unread_count` /
`staff_unread_count` are reset to 0 in the same transaction.

The pure helpers `replySeenByGuest` / `replySeenByStaff` (in
`read-receipts-pure.ts`) are tiny set lookups that the UI uses to
render "Seen by team" on guest replies and "Seen by guest" on staff
guest-visible replies. They live in a `pure` file so tests can import
them without pulling `server-only`.

The admin metrics page surfaces a new "Median first staff read"
KPI computed from the receipt rows directly via
`medianFirstStaffReadSeconds()`.

### 5. Internal-note permission tightening

```
guest_ai.handoff.notes.read           super_admin/director/ops/property/concierge
guest_ai.handoff.attachments.read     adds booking_manager
guest_ai.handoff.attachments.write    same as notes.read
```

The admin detail page now does a `hasPermission(ctx,
'guest_ai.handoff.notes.read')` check before rendering. When the user
lacks the perm:

- `internal_only` replies are filtered out **server-side** (not just
  hidden in CSS).
- `internal_only` attachments are filtered out the same way.
- The visible reply count reflects only what the user is allowed to
  see; "10 replies" on the page is honest.
- The static-source test grep prevents future contributors from
  accidentally piping the raw list into the response props.

Booking managers retain read access to handoffs + the guest-visible
side of the conversation + visible attachments — they just don't see
internal notes anymore. That's the v9I → v9K tightening.

### 6. AI isolation

The AI context builder (`context.ts`) and fallback router
(`fallback.ts`) are forbidden from importing:

- `attachments-services` / `attachments-actions` / `attachments-storage`
- `createSignedUploadToken` / `createSignedDownloadUrl`
- The Drizzle `guestAiHandoffReplyAttachments` /
  `guestAiHandoffReplyReads` tables

A static-source test grep enforces this. The AI never knows
attachments exist; if the model wants to "see the photo" it has to
suggest the guest tap "Ask human concierge" — which is the v9I
handoff path that actually has the file context.

### 7. EXIF stripping — deferred

The spec asked us to consider re-encoding images server-side to drop
EXIF. We chose **not** to add a heavy native dependency just for
this in v9K. Instead we lean on:

- No public URLs ever — only short-lived (10 min) signed URLs.
- Storage paths are server-only, not enumerable.
- AI has no access (above).
- Documented warning in this ADR + the README.

A future v9L can introduce a small server-side EXIF stripper (likely
through the existing Supabase Storage transform pipeline if
available, or a dependency-free `exif` byte sweep for JPEG / PNG)
without changing the schema or action surface.

## Trade-offs

- **No real-time push.** Read receipts and uploads only show on
  navigation. v9L adds SSE.
- **One signed URL per page render.** Guests revisiting the page
  get fresh URLs; no client-side caching beyond the 10-minute window.
- **8 MB per file is conservative.** Large videos or scans need
  resizing client-side first — for v9K that's the guest's problem.
  v9L could add background re-encoding.
- **No image previews on staff side** beyond the file name + a
  signed link. We keep the admin UI list-only; an ops member wanting
  a thumbnail clicks through. Reduces accidental EXIF / PII leakage
  via auto-loaded inline images.
- **Booking managers lose access to internal notes.** This is the
  intentional change in v9K and may surprise users who were used to
  v9I/J behaviour. Documented in the README.

## Out of scope (deferred)

- EXIF / metadata stripping (v9L).
- Real-time SSE push of new replies + receipts (v9L).
- Per-team scoping for internal notes (e.g. "concierge-only" vs
  "ops-only" tiers).
- Upload progress bars beyond the simple state badges.
- Server-side virus scan / content moderation.

## Operational runbook

- **Apply migration**: `npm run db:migrate` (idempotent).
- **Create the storage bucket**: in Supabase, create a private
  bucket named `guest-request-attachments`. Add a Storage policy
  scoped to the service-role key; no public read.
- **Seed**: `npm run db:seed` is unchanged — no v9K seed rows.
- **Guest flow**: tap "Ask human concierge" → write message → after
  send, the composer reveals an attachment uploader (max 3 files,
  ≤ 8 MB, JPEG/PNG/WEBP/PDF). The guest stays on the page.
- **Admin flow**: same composer pattern on
  `/dashboard/guest-ai/handoffs/[id]`. Toggle between "Reply to
  guest" and "Internal note" before sending; after send, the
  attachment uploader appears with the chosen visibility.
- **Permissions**: grant `guest_ai.handoff.notes.read` to the user
  via the existing role assignment flow; booking managers
  intentionally do not have it.
