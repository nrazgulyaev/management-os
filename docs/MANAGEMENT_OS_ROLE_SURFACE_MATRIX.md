# Management OS — Role × Surface Matrix

> Companion to `MANAGEMENT_OS_V1_PRODUCT_MAP.md`.

This matrix lists every formal role in the permission model and what
each role can access.  Read alongside `docs/USER_ROLES_AND_PERMISSIONS.md`
for the row-level permission grants.

Legend:

- ✅ — full access in v1
- 👁️ — read-only / scoped subset
- ❌ — no access (HTTP 401 / 403 / redirect)
- 🔑 — token-scoped (no auth session, only a stay / vendor / hold token)

## Internal roles

| Role | Admin Dashboard | Owner Portal | Guest Portal | Field App | Vendor Portal | Finance | Ops | Security | Notes |
|---|---|---|---|---|---|---|---|---|---|
| **super_admin** | ✅ | ❌ (impersonate-only) | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | Full control. Audit-logged for every sensitive write. |
| **director** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | 👁️ | Read security + audit; write on finance close. |
| **operations_manager** | ✅ | ❌ | ❌ | 👁️ | ❌ | 👁️ | ✅ | 👁️ | Cannot edit owner statements after issue. |
| **property_manager** | ✅ | ❌ | ❌ | 👁️ | ❌ | 👁️ | ✅ | ❌ | Per-villa scoped. |
| **booking_manager** | ✅ | ❌ | ❌ | ❌ | ❌ | 👁️ | 👁️ | ❌ | Owns calendar / channels / direct booking ops. |
| **revenue_manager** | ✅ | ❌ | ❌ | ❌ | ❌ | 👁️ | ❌ | ❌ | Pricing, rate plans, channel-push (simulated). |
| **finance_manager** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | 👁️ | ❌ | Owns expenses, fees, payouts, statements. |
| **accountant** | ✅ | ❌ | ❌ | ❌ | ❌ | 👁️ | ❌ | ❌ | Read-only finance + statement export. |
| **concierge** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | 👁️ | ❌ | Guest services + AI handoffs. |
| **housekeeping_supervisor** | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | 👁️ | ❌ | Assign tasks; review inventory counts. |
| **housekeeper** | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | Field app only — own assigned tasks. |
| **technician** | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | Field app only — maintenance + utilities tasks. |
| **security** | ✅ | ❌ | ❌ | 👁️ | ❌ | ❌ | 👁️ | ✅ | Reads security events, login attempts, MFA. |
| **procurement_manager** | ✅ | ❌ | ❌ | 👁️ | ❌ | 👁️ | 👁️ | ❌ | Owns supplier orders + procurement requests. |

## External roles

| Role | Admin Dashboard | Owner Portal | Guest Portal | Field App | Vendor Portal | Finance | Ops | Security | Notes |
|---|---|---|---|---|---|---|---|---|---|
| **investor_owner** | ❌ | ✅ | ❌ | ❌ | ❌ | 👁️ (own statements) | ❌ | ❌ | RLS scoped via `access_grants`. |
| **investor_viewer** | ❌ | 👁️ | ❌ | ❌ | ❌ | 👁️ | ❌ | ❌ | Read-only owner portal. |
| **owner_delegate** | ❌ | 👁️ (delegated) | ❌ | ❌ | ❌ | 👁️ | ❌ | ❌ | Inherits delegated owner's grants. |
| **agent** *(if granted)* | ❌ | 👁️ (selective) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Read-only, time-boxed, audited. |
| **guest** *(token-scoped)* | ❌ | ❌ | 🔑 | ❌ | ❌ | ❌ | ❌ | ❌ | Stay-token bound URL only. |
| **vendor** *(token-scoped)* | ❌ | ❌ | ❌ | ❌ | 🔑 | ❌ | ❌ | ❌ | Vendor token bound URL only. |
| **public booker** *(token-scoped)* | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Hold-token bound URL — `/book/hold/[token]/**`. |

## What each role can / cannot see

### super_admin / director / operations_manager
- **Can see:** every villa, every owner, every booking, every guest
  contact (with audit), every finance line, every cron run.
- **Cannot see:** unwrapped MFA secrets, plaintext recovery codes
  (only hashed), plaintext Wi-Fi passwords (only encrypted).

### finance_manager / accountant
- **Can see:** every money movement, every owner statement, every
  payout / expense / fee / tax, the statement source-group breakdown.
- **Cannot see:** guest contact PII unrelated to finance (handled via
  `app_users` permission on `guest.contact.read`).

### concierge / property_manager / booking_manager
- **Can see:** guest names + masked contacts when explicitly granted
  via `guest.contact.read`, service requests, AI conversations,
  bookings.
- **Cannot see:** finance lines beyond their permission scope, audit
  events, deletion / impersonation logs.

### investor_owner / investor_viewer / owner_delegate
- **Can see:** their owned villas, their own statements, their own
  bookings (owner-safe projection), their calendar.
- **Cannot see:** guest names beyond a masked initial, guest contact
  details, lock codes, internal operations chatter, finance entries
  outside their statements, other owners' data, vendor invoices, AI
  insights, security events.
- **Privacy contract:** every owner-facing query goes through the
  owner-safe projection in `src/features/owner-bookings/**` and
  `src/features/owner-intelligence/**`; banned tokens are scrubbed
  by tests in `tests/owner-projection.test.ts`.

### guest *(token-scoped)*
- **Can see:** their own stay (Wi-Fi, guide, services, requests,
  concierge), their own service-request attachments via short-lived
  signed URLs.
- **Cannot see:** other guests, operator side, finance, anything
  outside `/stay/[their-token]/**`.

### vendor *(token-scoped)*
- **Can see:** the service request bound to their token, schedule,
  ETA control, invoice metadata for that request, attachment
  uploads.
- **Cannot see:** guest contact (unless explicitly shared by an
  operator), other vendor requests, other villas, finance, payouts.

### housekeeper / technician
- **Can see:** their assigned tasks in the field app, the villa
  context for those tasks, the checklist + attachment requirements.
- **Cannot see:** the admin dashboard, finance, owner data, AI
  surfaces, security events.

## Field / vendor token-scoped access notes

- Tokens are random 32-byte URL-safe strings; their hashes are stored
  with `pgcrypto`-grade cost.
- Token-scoped pages explicitly do **not** establish a Supabase
  session — RLS is bypassed only inside server functions that verify
  the token and resolve a typed scope.
- Token revocation is immediate (delete the row → 404 on next
  request).
- Guest tokens expire on stay end + 30 days.  Vendor tokens expire
  on fulfilment close + 14 days.

## Data privacy notes

- Owner statements are the canonical record of what an owner can read
  about their finances.  Anything not in a statement is operator-only
  by default.
- Guest contact details are stored encrypted at rest and never
  exposed to owner / vendor surfaces.
- Wi-Fi passwords are encrypted with `STAY_LINK_KMS_SECRET` and
  decrypted only inside the guest stay page render path.
- MFA TOTP secrets are encrypted with `SECURITY_ENCRYPTION_SECRET`
  and decrypted only during enrol / verify.
- Recovery codes are stored as salted SHA-256 hashes; the plaintext
  is shown to the user once at generation and never persisted.
- Login attempts are logged with hashed IP + UA so the security
  events log can detect attack patterns without storing plaintext
  IPs.
- Sensitive-table audit (14 tables) writes to `auth_security_events`
  on every INSERT / UPDATE / DELETE via Postgres trigger.
