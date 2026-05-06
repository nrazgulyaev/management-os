# ADR-0018 — Guest Stay Security Hardening (v9G)

Status: Accepted · 2026-04-28

## Context

V9E shipped the production guest stay surface (token-gated `/stay/[token]`,
guide content, smart-lock stub, free-text concierge). V9F layered the
guest services catalog on top. Both versions traded off security for
launch-day pragmatism:

- Wi-Fi passwords were stored in `villa_wifi_credentials.display_password`
  as plaintext.
- Anyone with the URL could open `/stay/[token]` and read every
  detail, with no second factor.
- Rate limiting was provided by Vercel's edge layer alone — nothing
  application-aware.
- The smart-lock stub code rendered immediately on the home page.

V9G closes those gaps without changing the URL shape, the issuance
flow, or the operator experience for "issue a stay token."

Hard guardrails:

- **No real smart-lock APIs.** The stub stays a stub.
- **No AI concierge runtime.**
- **No payments.**
- **No new third-party crypto provider.** Encryption uses Node's
  built-in `node:crypto` AES-256-GCM with a versioned data-key derived
  via scrypt from the platform secret.

## Decisions

### 1. Four new tables + Wi-Fi column extension

```
wifi_encryption_keys              versioned data keys
guest_stay_token_verifications    one-time codes
guest_stay_security_events        append-only security log
guest_stay_rate_limits            (token_prefix, ip_hash) rolling window

villa_wifi_credentials
  + password_ciphertext text
  + password_key_version integer
  + password_migrated_at timestamptz
```

Every new table is `ENABLE` + `FORCE ROW LEVEL SECURITY` with both
`internal_read` and `internal_write` policies. The guest portal never
queries them through an authenticated guest session.

### 2. AES-256-GCM Wi-Fi password encryption

```
plaintext  →  IV (12B) | tag (16B) | ciphertext
            ↑ derived data key via scrypt(secret, "arconique:wifi:v{ver}")
            ↑ stored as base64url("v" || keyVersion[1B] || iv | tag | ct)
```

- Format byte + key version live in the blob header so a future
  rotation can decrypt v1 ciphertexts while writing v2 payloads.
- Pure helpers (`wifi-crypto-pure.ts`) are unit-tested without
  `server-only`.
- Server wrapper (`wifi-crypto.ts`) reads `STAY_LINK_KMS_SECRET` and
  **fails closed in production**: missing secret → encryption /
  decryption refuses to operate. Dev falls back to a deterministic
  placeholder with a `console.warn`.

The legacy `display_password` column is retained for one release so
the migration helper can read it in-place. Once
`migratePlaintextWifiPasswords` runs against every active row, the
column is dropped in v9H.

### 3. One-time verification gate

First-time visits to `/stay/[token]` are redirected to
`/stay/[token]/verify`. The flow:

1. Server auto-issues a 6-digit numeric code. Hash (`sha256(salt:prefix:code)`)
   is persisted; raw code never touches the DB.
2. Code expires in 10 minutes. Maximum 5 attempts per code. Resend
   cooldown = 60 seconds.
3. Delivery rides the existing notification queue (`email` / `sms` /
   `whatsapp` channels). When no provider is configured, dev shows a
   safe console / inline preview; production silently no-ops.
4. Successful verification flips the row to `verified` and the guest
   is redirected back to `/stay/[token]`. The verified state lasts as
   long as the token is active — it is not bound to a cookie or session.
5. If the token has no email / phone, the page shows a "Contact
   concierge" fallback. Operators can issue manually from the booking
   detail.

The pure state machine (`verification-pure.ts`) is fully unit-tested:
it covers the legal transitions for `pending → {verified, expired,
failed, cancelled}` plus attempts-counter behaviour.

### 4. Rate limiting

Two policies, both keyed on `(token_prefix, ip_hash)`:

- **Token access** — 60 requests / 10 minutes, 10-minute block.
  Applies to `/stay/[token]`, `/stay/[token]/verify`, and the
  `/wifi`, `/check-in` reveal endpoints.
- **Verification** — 5 attempts / 10 minutes, 30-minute block.

The pure helper (`rate-limit-pure.ts`) computes the next state. The
server wrapper persists it and logs a `token_rate_limited` security
event exactly once per transition into a block (not per request).

### 5. Reveal buttons (Wi-Fi + smart lock)

The guest projection drops plaintext entirely. Each sensitive value
sits behind a server action:

- `revealWifiPasswordAction(token, wifiId)` — re-validates token,
  enforces verification gate, applies rate limit, decrypts, logs
  `wifi_viewed`.
- `revealLockCodeAction(token)` — same gates, plus the smart-lock
  visibility window. Logs `lock_code_viewed`.

The lock code never appears in server-rendered HTML — even on the
`/stay/[token]/check-in` page it's pulled in client-side only after
the user taps "Show door code."

### 6. Security event taxonomy

`guest_stay_security_events.event_type` is constrained to:

```
verification_sent / verification_resent / verification_verified
verification_failed / verification_expired
token_rate_limited / suspicious_access
lock_code_viewed / wifi_viewed
wifi_password_rotated / wifi_password_migrated
```

`severity` is one of `low | medium | high | critical`. Operators view
the rolling log at `/dashboard/guest-stays/security/events` with a
filter pill per severity.

### 7. Permissions

Five new keys, owners + agents excluded everywhere:

```
guest_stay_security.read           ops, property, booking, concierge, security
guest_stay_security.manage         ops, property, security
guest_stay_verification.issue      booking_manager + concierge ladder
wifi_credentials.encrypt           ops + property (rotation + write)
wifi_credentials.rotate            ops only (multi-version key flips)
```

## Trade-offs

- **Verification cookie is implicit.** `verified` lives on the row;
  any device that knows the token sees the verified state. We
  considered binding to a signed cookie but it would have broken the
  shareable-link UX (one guest forwards the URL to a partner, second
  device fails). v9H may add an opt-in "lock to one device" flag.
- **No real KMS / HSM.** The platform secret derives data keys via
  scrypt. Production deployments should rotate the env secret + the
  active `wifi_encryption_keys` row together.
- **Rate-limit table grows unbounded.** A nightly cron (added in
  v9H) will sweep rows where `window_start < now - 24h`.
- **Notification delivery is best-effort.** When the provider is
  dry-run / down, the verification row exists but no message is sent.
  The operator can manually copy the code from the audit log only if
  they want to defeat the whole purpose — we don't expose plaintext
  in the admin UI.

## Out of scope (deferred)

- Real smart-lock provider integrations.
- Cookie / device binding for verified sessions.
- Background sweep of stale rate-limit rows.
- IP-allowlist / geo-deny lists.
- WebAuthn second factor.
- AI concierge runtime.

## Operational runbook

- **Set `STAY_LINK_KMS_SECRET`** before any production deployment:
  `openssl rand -hex 48`. Refusing to encrypt without it is by design.
- **Apply migration**: `npm run db:migrate` (idempotent).
- **Seed**: `npm run db:seed` writes the v1 key row + four
  notification templates (`guest_stay.verification_code` for email +
  sms, plus `security_alert` and `link_verified`). Wi-Fi ciphertext
  is NOT pre-baked into the seed because it depends on the runtime
  KMS secret — instead, run the migration sweep:
- **Migrate legacy plaintext Wi-Fi**: visit
  `/dashboard/villa-guides/wifi/migrate` and click "Run migration
  sweep." Idempotent. Rows that already have ciphertext are skipped.
- **Rotate the data key** (future v9H operator runbook): insert a new
  `wifi_encryption_keys` row with `key_version + 1` and
  `status='active'`, flip the prior row to `'rotated'`, then re-encrypt
  via a new sweep that decrypts under the old version and re-encrypts
  under the new.
- **Investigate suspicious access**:
  `/dashboard/guest-stays/security/events?severity=high`. The
  `tokenPrefix` + `ipHash` columns let you correlate without ever
  seeing plaintext.
