# ADR-0016 — Guest Stay Foundation (v9E)

Status: Accepted · 2026-04-27

## Context

V9A–V9D shipped the operations stack: availability, readiness, owner stays,
finance bridge, preventive maintenance, utilities. The guest experience to
date was a styled demo at `/stay/demo` — no production token-gated route.

V9E ships the production guest stay surface:

- `/stay/[token]` and seven sub-pages, mobile-first, no-app.
- Token-issuance + revocation tied to a booking.
- Editable villa-guide content (sections, Wi-Fi, emergency contacts,
  neighborhood places).
- A smart-lock **stub** with a deterministic 6-digit display code,
  visible only inside `[checkIn − 24 h, checkOut + 3 h]`.
- Guest service-request submission gated by a valid token.
- Append-only access log (`guest_stay_access_events`).

Hard guardrails:

- No real lock/payment/messaging APIs.
- No raw booking IDs in public URLs.
- No owner finance, internal notes, or other guests' data exposed.
- No camera streams.

## Decisions

### 1. Token shape

- 32 random bytes → base64url → 43-char URL-safe string. 256 bits of
  entropy.
- We persist **only** the SHA-256 hash and an 8-char prefix (admin
  display). The raw token is shown to the operator exactly once at
  issuance and never logged.
- Default expiry = `checkOut + 7 days, 23:59 UTC`. Operators can
  override.
- Resolution flow: `getStayByToken(token)` hashes the input, looks up
  the row, validates `status === 'active'` and `expiresAt > now`,
  increments `access_count` + `last_accessed_at` on success. Returns a
  guest-safe summary that **never** includes `token_hash`.

### 2. RLS posture

Every new table is `ENABLE` + `FORCE ROW LEVEL SECURITY` with an
`internal_read` policy. The guest portal does NOT query these tables
through an authenticated guest session — the server route uses the
service-role DB client to resolve the token, then renders only the
fields we've manually projected for guest consumption. RLS holds the
line at the DB layer regardless of any future code path.

### 3. Smart-lock stub

`smart_lock_access_codes` is a placeholder for a real provider in v9F+.
The display code is **deterministic** from `(booking_id, villa_id)`:

```
SHA-256("stub-lock:" + booking_id + ":" + villa_id) [first 4 bytes BE] mod 1_000_000
```

That keeps demo flows reproducible while looking unguessable to a guest
reading the page. Visibility window = `[checkIn − 24 h, checkOut + 3 h]`.
The stub is documented in the admin UI as "demo only" and appears with
a "demo" badge in the `/stay/[token]/check-in` view.

### 4. Editable villa guide content

Five entities — sections, Wi-Fi, emergency contacts, neighborhood,
plus the smart-lock stub — share a **villa-first → project-fallback**
resolution rule:

- For **keyed** content (`villa_guide_sections`, one row per
  `section_key`), the villa-scoped row beats the project-scoped row.
- For **lists** (Wi-Fi, contacts, neighborhood), if any villa-scoped
  rows exist, they REPLACE the project-scoped fallback. Project rows
  fall through only when the villa has none configured.

Pure resolvers in `villa-guides/resolve-pure.ts`:

```ts
filterGuestVisible<T>(rows): T[]
resolveByKey<T>(rows): T[]          // for sections
resolveListWithFallback<T>(rows): T[] // for wifi/contacts/places
```

The `display_password` column on `villa_wifi_credentials` is
**explicitly plaintext** in v9E and documented as a v9F upgrade target
(encrypt-at-rest). Operators are warned in the admin description.

### 5. Service requests from /stay/[token]

Submission is **token-gated**, not auth-gated. Flow:

1. Validate `token` server-side via `getStayByToken`.
2. If invalid/expired/revoked → log the access event (without
   leaking which) and return a friendly error.
3. If valid → mint a code via existing `nextDailyCounter("SR")` +
   `buildServiceRequestCode`, insert into `service_requests` with
   `requestType='guest_portal'`.
4. Queue in-app notifications to `concierge` + `property_manager`.
5. Audit-log + access-log the create event.

The form lives at `/stay/[token]/services` and respects the existing
service_requests table (no enum extension needed — `request_type` is
free text).

### 6. Access log

`guest_stay_access_events` is append-only. We log seven event types:
`opened`, `invalid_token`, `expired_token`, `revoked_token`,
`guide_opened`, `wifi_viewed`, `smart_lock_viewed`,
`service_request_created`. The `ip_hash` column is a **truncated
SHA-256** (`salt + ip → first 16 hex chars`), so operators can spot
re-use without holding any plaintext IP.

### 7. Admin surfaces

- `/dashboard/guest-stays` hub.
- `/dashboard/guest-stays/tokens` + `/[id]` — list with filter, detail
  with revoke button.
- `/dashboard/bookings/[id]/guest-stay` — issue token + view smart-lock
  stub + token history.
- `/dashboard/villa-guides` hub + four list-and-create surfaces:
  sections, wifi, emergency-contacts, neighborhood.

### 8. Permissions

Seven new keys, owners + agents excluded everywhere:
`guest_stay.{read,write,token.manage}`, `villa_guide.{read,write}`,
`smart_lock.{read,manage}`. `villa_guide.read` extends to housekeeper
+ technician (they need to know what guests are seeing); `smart_lock.*`
stays narrow (super_admin, director, ops_manager, property_manager,
booking_manager, concierge, security).

## Trade-offs

- **Display-password plaintext**. v9E only. Encrypt-at-rest lands in
  v9F. We chose this over forcing operators into a vault flow before
  any guest portal can ship.
- **No guest auth**. Token in URL. Acceptable because (a) the URL is
  delivered through an out-of-band trusted channel, (b) we hash the
  token at rest, (c) we cap expiry and offer revoke. A future v9F+
  upgrade can add a one-time email/SMS step before token use.
- **Stub lock is visible to admins as plaintext**. Same as v9D's
  utility display; both are pre-real-integration placeholders.
- **Demo route stays at `/stay/demo`**. We did NOT redirect or remove
  it — it remains the marketing-friendly walkthrough without a token.
- **No PDF generation**. Offline page is HTML with browser print
  hook. Real PDF rendering can land in v9F if needed.

## Out of scope (deferred)

- Real smart-lock provider integrations (Aqara, Igloohome, TTLock).
- Owner-portal exposure of guest-stay activity.
- Guest payments / damage deposits.
- WhatsApp / Telegram message threads inbound from the stay portal.
- AI concierge runtime.
- Image upload on guest service requests (size budget too noisy for v9E).

## Operational runbook

- **Apply migration**: `npm run db:migrate` (idempotent re-run safe).
- **Seed sample data**: `npm run db:seed` adds Enso project guide
  content, Wi-Fi, emergency contacts, neighborhood places, one stay
  token bound to booking `ARC-A-00238`, one smart-lock stub, the
  `guest_stay.service_request_created` notification template.

  The seeded plaintext token (one-time, demo only):

  ```
  arconique-v9e-demo-stay-token-aaaaaaaaaaaaaaaaaaaaaaaa
  ```

  Visit `http://localhost:3000/stay/arconique-v9e-demo-stay-token-aaaaaaaaaaaaaaaaaaaaaaaa`
  to walk through every guest sub-page. The stub door code is `903754`,
  visible from check-in − 24 h to check-out + 3 h.

- **Issue a fresh token**: `/dashboard/bookings/[id]/guest-stay` →
  "Issue token". The full URL is shown once and copied to clipboard.

- **Revoke**: `/dashboard/guest-stays/tokens/[id]` → "Revoke" (with
  optional reason, audit-logged).

- **Edit villa guide**: `/dashboard/villa-guides/sections` (and the
  three sibling pages). Villa-scoped rows beat project-scoped. Set
  `guest_visible=false` on a row to keep it internal.
