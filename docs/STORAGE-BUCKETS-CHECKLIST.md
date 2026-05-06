# Storage Buckets Checklist — Arconique Management OS

Every Supabase Storage bucket the Management OS expects to exist, with
required privacy mode, allowed MIME types, max sizes, signed-URL
policy, cleanup job, and the access model for owner / guest / vendor /
field users.

`npm run check:storage` parses this file and the bucket constants in
`src/` to make sure they match.  Add a row when introducing a new
bucket; the static check fails if a bucket constant in code is not
documented here.

## Buckets

| Bucket | Public/private | Used by | Allowed MIME | Max size | Signed upload? | Signed download? | Cleanup job | Metadata stripping | Owner / guest / vendor / field access |
|---|---|---|---|---|---|---|---|---|---|
| `task-attachments` | **private** | Field app — operation-task photos, damage reports, material usage. | `image/jpeg`, `image/png`, `image/heic`, `image/webp` (re-encoded server-side) | 12 MiB / file | yes (server mints signed PUT) | yes (short-lived signed GET) | none — task lifecycle owns the row | yes — server strips EXIF GPS before persisting metadata | Internal only.  Owners may see redacted metadata via `owner_visible_events`; guests + vendors cannot read. |
| `guest-request-attachments` | **private** | Guest concierge — guest-uploaded photos / docs sent with a service request or AI handoff. | `image/jpeg`, `image/png`, `image/heic`, `image/webp`, `application/pdf` | 8 MiB / file | yes (server mints signed PUT bound to a stay token) | yes (short-lived signed GET) | yes — `/api/cron/guest-request-attachments-cleanup` removes orphaned + abandoned uploads daily | yes — EXIF strip on completed uploads | Guest reads via stay-token bound signed URL; staff reads via permission-gated server route.  Owners + vendors cannot read. |

## Required configuration

For each bucket above:

1. **Create the bucket as private** in Supabase Studio →
   `Storage → New bucket`.  Toggle "Public bucket" OFF.
2. Set the file-size limit to the value above.
3. Set the allowed MIME types via Supabase RLS policies on
   `storage.objects` (or via the Studio UI when available).
4. Add an RLS policy that lets the service role write + read, and a
   second policy that lets the anon role do nothing.  Reads happen
   via short-lived signed URLs minted by the server.

## What MUST NOT happen

- ❌ A public bucket for any file containing guest contact info,
  Wi-Fi passwords, lock codes, or finance documents.
- ❌ Long-lived signed URLs (TTL > 1 hour).
- ❌ Server-side raw download endpoints that bypass the signed-URL
  flow.
- ❌ Storing the same blob in two buckets (deduplicate via metadata
  rows in Postgres instead).

## Static check

`npm run check:storage` walks `src/` for bucket constant references
and verifies that:

- every constant referenced in code (`task-attachments`,
  `guest-request-attachments`) appears in this file,
- the documentation explicitly marks
  `guest-request-attachments` as private / signed-URL only.

## When introducing a new bucket

1. Define the constant once in code (e.g.
   `export const NEW_BUCKET = "owner-documents";`).
2. Add a row to the table above with the same name string.
3. Add the bucket to `scripts/check-storage-config.ts` `KNOWN_BUCKETS`.
4. If the bucket needs a cleanup cron, follow the
   `guest-request-attachments-cleanup` pattern — register a job key
   + cron route per the cron checklist.
5. Run `npm run check:storage` — green output confirms the new
   bucket is fully wired.
