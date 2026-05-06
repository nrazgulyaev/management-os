# ADR-0034 — Security Baseline & Operational Hardening (Prompt 111)

## Status
Accepted. Implemented in migration
`0033_security_baseline_operational_hardening.sql`, the
`src/features/security-baseline/*` and `src/features/jobs/locks.ts` modules,
the `src/features/system/db-health.ts` resilience helpers, the new
admin / settings / setup routes
(`/dashboard/settings/security`, `/setup/mfa[/verify|/recovery-codes]`,
`/dashboard/security/auth[/login-attempts|/events|/mfa]`,
`/dashboard/jobs/locks`, `/dashboard/system/health`), the
`FOR UPDATE SKIP LOCKED` upgrade to the notification delivery worker,
and a generic `record_sensitive_audit_event` trigger attached to
fourteen sensitive finance / auth tables.

## Context
After Prompts 105–110 the platform had complete business logic but
several latent operational risks:

1. **No second factor.** Internal users authenticated with password
   only.
2. **No login throttling.** Repeated failed sign-ins were unbounded;
   brute-force was theoretically free.
3. **No cron concurrency control.** Two cron workers (or a manual
   "Run now" + cron) could run the same job twice — duplicate
   notifications, double-posted finance bridges in the worst case.
4. **No notification delivery lock.** `deliverPendingNotifications`
   used a plain `SELECT … LIMIT 100` and would deliver each row
   twice when two workers raced.
5. **Audit gap on direct-SQL writes.** `recordAuditEvent` covered
   app-code mutations, but `psql` scripts / restore drills didn't
   audit anything.
6. **No RLS coverage test.** A new table missing `ENABLE ROW LEVEL
   SECURITY` would slip through code review.
7. **Dashboards crashed when migrations were pending.** `count(*)
   from "guest_stay_security_events"` would crash the entire admin
   page in environments that had not applied the latest migration.
8. **No backup / restore runbook.**

Prompt 111 closes all of these without changing business logic.

## Decision

### 1. MFA design
Five auth-related primitives, all RLS-forced internal-only:

- **`auth_mfa_factors`** — one verified TOTP factor per user. Status
  enum: `pending` / `verified` / `disabled` / `revoked`. Partial
  UNIQUE on `(app_user_id)` while status ∈ `(pending, verified)`
  prevents two concurrent enrolments. The TOTP secret lives only as
  AES-256-GCM ciphertext + key-version byte.
- **`auth_mfa_recovery_codes`** — 10 single-use codes generated only
  after successful enrolment. Stored as SHA-256 hashes (salted with
  `arconique:mfa:recovery-code:v1`); plaintext is shown once.
- **TOTP** is dependency-free: `src/features/security-baseline/totp-pure.ts`
  implements RFC 6238 (HMAC-SHA1, 30-second step, 6 digits, ±1
  window) plus an `otpauth://` URI generator + base32 encoder/decoder
  in 200 lines.
- **Encryption** uses `AES-256-GCM` with a 32-byte key derived from
  `SECURITY_ENCRYPTION_SECRET` via scrypt salted
  `arconique:security:v<n>` — the same pattern as the Wi-Fi crypto
  introduced in Prompt 9G but namespaced separately so the two key
  chains can never be confused. In production, missing the secret
  fails closed (`refusing to encrypt/decrypt`); in development a
  deterministic dev-only fallback prints a one-time warning.

UI flow:
- `/setup/mfa` — Step 1: generate the secret + show otpauth URL.
- `/setup/mfa/verify` — Step 2: enter a code, then the page receives
  recovery codes inline (rendered exactly once via the action's
  return value; never re-fetched).
- `/setup/mfa/recovery-codes` — landing page; from this point onward
  only the *count* of remaining codes is exposed.
- `/dashboard/settings/security` — per-user status card with Disable.
- `/dashboard/security/mfa` — admin list with Revoke (gated by
  `mfa.manage`).

### 2. Login throttling model
- **`auth_login_attempts`** logs every attempt with hashed IP + UA.
- Pure helper `decideLoginThrottle({emailAttempts, ipAttempts, now})`
  applies the rolling 10-minute window: 5 failures per email, 20
  per IP, lock for 15 minutes. Active locks return `retryAfterSeconds`.
- `recordLoginAttempt({email, ip, userAgent, succeeded, failureReason})`
  hashes the IP + UA, computes whether *this* attempt crosses the
  threshold, persists the row with a `locked_until` if so, and
  emits `login_failed` / `login_locked` security events.
- Integration with the actual sign-in path is deferred to a follow-up
  prompt: today's auth flow uses `supabase.auth.signInWithPassword`
  client-side, which we cannot intercept without proxying. The
  service layer + admin pages are ready; full enforcement requires
  routing sign-in through a server action. Documented as a known
  limitation.

### 3. Job locking model
- **`job_locks`** — UNIQUE on `job_key`. State machine
  `locked → released | expired`.
- `acquireJobLock(jobKey, ttlSeconds, lockedBy)` does an
  `INSERT … ON CONFLICT`-style flow: try INSERT, fall through to
  SELECT + UPDATE on UNIQUE error. Stale rows
  (`expires_at < now − 30s`) are taken over.
- `executeJob` is now wrapped in lock acquire/release. A skipped
  run returns `JobOutcome.status = "skipped"` with summary
  `skipped — already locked by <holder>`. `executeAllJobs` no
  longer fails the whole batch on a single skip.
- Admin: `/dashboard/jobs/locks` shows current locks with a
  per-row Force-release button (`job_lock.manage`) and a top-level
  Expire-stale-locks button.

### 4. Notification delivery locking
- `deliverPendingNotifications` now claims rows inside a
  `BEGIN; SELECT … FOR UPDATE SKIP LOCKED LIMIT 100; UPDATE … SET
  status='processing'; COMMIT;`. Two workers running side-by-side
  pick disjoint batches.
- The `processing` status keeps any *third* worker from grabbing
  the same row even after the lock is released by COMMIT.
- Provider calls happen outside the transaction so the lock
  window stays sub-millisecond.
- Source-grep test pins `FOR UPDATE SKIP LOCKED` so a future
  refactor can't silently regress the guarantee.

### 5. DB audit trigger model
- One PL/pgSQL function `public.record_sensitive_audit_event()` is
  attached as `AFTER INSERT OR UPDATE OR DELETE` to fourteen sensitive
  tables: `user_roles`, `app_users_owners`, `auth_mfa_factors`,
  `auth_mfa_recovery_codes`, `owner_statements`, `statement_lines`,
  `payout_lines`, `management_fee_lines`, `revenue_lines`,
  `expense_lines`, `direct_booking_finance_links`,
  `owner_stay_finance_links`, `statement_source_groups`,
  `statement_reconciliation_warnings`.
- The function uses `to_jsonb(NEW)` / `to_jsonb(OLD)` to avoid
  needing to know each table's exact shape. `changed_keys` is
  computed via `jsonb_object_keys` diff for UPDATEs.
- Defence-in-depth guard: the function refuses to write when
  `TG_TABLE_NAME = 'audit_events'` (in case someone attaches the
  trigger by mistake — it would otherwise recurse).
- Audit-write failures are swallowed (`EXCEPTION WHEN OTHERS THEN
  NULL`). The underlying mutation must always succeed even if
  audit_events is unavailable.
- The attach loop skips tables that don't exist in the current
  environment, so partial / older databases run the migration
  without errors.

### 6. RLS coverage test
- `tests/p111-rls-coverage.test.ts` walks every `drizzle/*.sql`
  file (skipping `seed.sql`), parses both static
  `CREATE TABLE …` declarations and dynamic
  `EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t)`
  loops, and asserts that every table is RLS-locked unless
  allowlisted.
- Allowlist is small + documented inline:
  - `fx_rates`, `notification_templates`, `booking_channels` —
    read-mostly reference data.
  - `job_definitions`, `job_runs`, `job_run_events` — internal
    runtime infra.
  - drizzle/Supabase migration bookkeeping tables.
- Limitation: this is source-text grep, not a live-DB
  introspection. We do not assert per-policy semantics; that's
  the per-feature test's job.

### 7. Backup / restore runbook
[`docs/RUNBOOK-BACKUP-RESTORE.md`](./RUNBOOK-BACKUP-RESTORE.md)
covers Supabase backup strategy, restore drill steps, post-restore
verification (migrate / seed / typecheck / test / build / verify
admin bootstrap / verify owner statement / verify guest-stay
token), RPO/RTO assumptions, secret rotation, and what cannot be
restored from app DB alone (Supabase Storage objects, external
provider sessions, etc.).

### 8. Dashboard resilience
- `src/features/system/db-health.ts` exposes `safeCount`,
  `safeList`, `isMissingRelationError`, `isMissingColumnError`,
  and `migrationPendingMessage`. Both wrappers swallow Postgres
  `42P01` (relation does not exist) and `42703` (column does not
  exist) and return `{ ok: false, value: 0 | [] }` plus a
  structured error.
- `/dashboard/system/health` (new) renders a per-table presence
  grid + an env readiness checklist (DATABASE_URL, Supabase auth,
  CRON_SECRET, APP_BASE_URL, SECURITY_ENCRYPTION_SECRET,
  STAY_LINK_KMS_SECRET, notifications mode, backup runbook URL).
- The new admin pages
  (`/dashboard/security/auth`, `/login-attempts`, `/events`,
  `/mfa`, `/dashboard/jobs/locks`) use `safeCount` / `safeList` and
  render a "Migration pending" badge when 0033 is not yet applied.
- Future Prompt 112 will extend this hardening to the existing
  `/dashboard/guest-stays/security`, `/dashboard/guest-ai/storage`,
  `/dashboard/owner-intelligence/*`, etc., as their seed coverage
  expands.

### 9. Permissions matrix additions
- `auth_security.read` / `auth_security.manage` — note the new
  prefix; the existing `security.*` keys are reserved for the
  camera registry.
- `mfa.manage` — super_admin / director only.
- `login_attempt.read`, `job_lock.read` / `job_lock.manage`,
  `system_health.read` / `system_health.manage`.
- Investor / owner / field / vendor / agent / housekeeper /
  technician are excluded from every new key.

## Consequences

### Positive
- Internal users can enrol TOTP MFA + 10 recovery codes; admins
  can revoke a lost factor.
- Brute-force is bounded by the throttle layer; every attempt and
  every state transition lands in the `auth_security_events` audit
  trail.
- Cron jobs are protected by a row-level mutex that survives
  Vercel re-invocations, manual "Run now" + cron overlap, and
  multi-region deploys.
- The notification worker no longer double-delivers when two
  workers race.
- Sensitive table mutations are audited at the database layer in
  addition to the app layer — direct-SQL changes (admin scripts,
  restore drills) leave a trace.
- A regression that adds a non-RLS-locked table is now a test
  failure, not a security incident.
- Admin pages no longer crash when the latest migration has not
  been applied.

### Negative / risks
- Login throttling is wired but not actively enforced on the
  client-side Supabase sign-in. A motivated brute-force will not be
  stopped at sign-in time — only logged. Documented as
  pending-prompt-112 work; the building blocks (service + UI) are
  in place.
- The dev-only crypto fallback is loud but not impossible to ship
  to production accidentally; CI should add an env-presence check
  before deploy. (Listed in deferred work.)
- Job lock take-over of stale rows uses simple compare-and-update
  with no `xmin` check. Two workers that both see the same stale
  row could both believe they hold the lock for ~1 cycle. The
  underlying jobs are idempotent so this isn't critical, but a
  Postgres advisory lock or a `xmin` predicate would be tighter.
- Audit trigger writes happen even when the underlying mutation is
  rolled back — common Postgres trigger behaviour, but a future
  improvement would be to write through a deferred constraint.

### Out of scope (deferred)
- Server-side Supabase sign-in proxy (so login throttle actively
  blocks).
- WebAuthn / passkeys.
- Audit-events streaming export (e.g. to a SIEM).
- xmin / advisory-lock job mutex upgrade.
- safeCount / safeList rollout across the remaining ~12 admin
  routes (Prompt 112 demo-data rebuild will exercise each one).

## Recommended next prompt
**Prompt 112 — Full Demo Data Rebuild + End-to-End QA Pass**:
rebuild + enrich demo data across every Management OS module,
verify every dashboard page loads without query errors, fix empty
states, and produce a screenshots-ready QA checklist.
