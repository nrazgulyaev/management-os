# Runbook — Backup & Restore (Prompt 111)

This runbook covers the backup / restore drill for Arconique
Management OS in production. All commands assume Supabase as the
managed Postgres + auth provider, but the strategy is provider-
agnostic — anywhere we can reach `psql` is enough.

## RPO / RTO assumptions

- **RPO (recovery point objective):** ≤ 24 hours. Supabase Pro tier
  takes daily logical + continuous WAL backups; we do not maintain
  a separate backup pipeline.
- **RTO (recovery time objective):** ≤ 4 hours from "we need to
  restore" to "Owner statement page renders correctly".
- **Out of scope:** sub-second point-in-time recovery, multi-region
  active-active failover, hot standby.

## What lives where

| Layer | Backup mechanism | Notes |
|---|---|---|
| Postgres tables (everything in `public`) | Supabase managed daily snapshot + WAL | One-click restore from the Supabase dashboard. |
| Supabase Auth (`auth.users`, `auth.sessions`) | Supabase managed | Linked from `app_users.auth_user_id`. |
| Supabase Storage objects (images, PDFs) | **Separate** — not covered by DB snapshot | Export the bucket manifests via `supabase storage ls` weekly. Object data itself is in S3-compat storage with its own retention. |
| Env / secrets (`SECURITY_ENCRYPTION_SECRET`, `STAY_LINK_KMS_SECRET`, `CRON_SECRET`, etc.) | 1Password vault (or your equivalent) | Never persisted in app DB. |
| External provider sessions (Stripe / Xendit / Wise) | Provider-side | We only persist hashes / references, never card data. |

## Pre-migration backup checklist

Before applying a new migration in production:

1. Take a manual Supabase snapshot:
   `supabase db dump -f pre-<migrationN>.sql` (or click in dashboard).
2. Verify the dump is non-empty:
   `wc -l pre-<migrationN>.sql` should be ≥ 50k for a non-empty
   environment.
3. Stage the migration in staging first; run quality gates.
4. Schedule a maintenance window for any migration that touches
   `revenue_lines`, `statement_lines`, `payout_lines`, or any
   `*_finance_links` table.

## Restore drill

Run quarterly. Estimated time: 1 hour for a fresh staging DB.

```bash
# 1. Provision a fresh Supabase project (or local Postgres + auth).
supabase init --project arconique-restore-drill

# 2. Restore the snapshot.
psql "$DRILL_DATABASE_URL" < pre-NNNN.sql

# 3. Apply any migrations newer than the snapshot.
DATABASE_URL=$DRILL_DATABASE_URL npm run db:migrate

# 4. Optionally seed demo data (skip in prod restores).
DATABASE_URL=$DRILL_DATABASE_URL npm run db:seed

# 5. Sanity quality gate.
npm run typecheck
npm run lint
npm run test
npm run build
```

## Post-restore verification

After a real restore, verify the following before re-opening
traffic:

1. **Admin bootstrap** — open `/setup/admin-bootstrap` and confirm
   it correctly skips when `app_users` already has a super_admin.
2. **Owner statement page** — open `/owner/statements` (signed in
   as an owner). The statement count should match the pre-snapshot
   value; the transparency snapshot card should render or
   gracefully fall back to the deterministic explanation.
3. **Guest-stay token** — generate a stay token via
   `/dashboard/guest-stays/[bookingId]` and load
   `/stay/<token>`. The Wi-Fi password panel should decrypt
   without warning.
4. **Background jobs** — open `/dashboard/jobs` and "Run now" on
   `deliver_pending_notifications`. The lock should acquire +
   release within 30 seconds.
5. **System health page** — `/dashboard/system/health` should show
   every tracked table as `present` and no `missing` env keys.

## Rotating secrets

### `SECURITY_ENCRYPTION_SECRET`
This wraps MFA TOTP secrets in `auth_mfa_factors.secret_ciphertext`.
Rotation procedure (one-time):

1. Generate a new 48-byte secret: `openssl rand -hex 48`.
2. Stage as `SECURITY_ENCRYPTION_SECRET_NEXT` (env-only, no code
   change).
3. Add a one-shot migration that decrypts every existing factor
   with the old secret + re-encrypts with the new secret + bumps
   `secret_key_version` from 1 → 2. (Use `keyVersion = 2` in the
   `deriveSecurityMasterKey` call.)
4. Promote `SECURITY_ENCRYPTION_SECRET_NEXT` → `SECURITY_ENCRYPTION_SECRET`.
5. Verify `/dashboard/security/mfa` still resolves all factors.

If you do not have a rotation migration, the simpler path is to
revoke every active MFA factor (`UPDATE auth_mfa_factors SET status
= 'revoked', revoked_at = now() WHERE status = 'verified'`) and
ask all users to re-enrol.

### `STAY_LINK_KMS_SECRET`
Same shape; touches `villa_guides_wifi_passwords.password_ciphertext`
+ a few related stay-token tables. Bump the key version, run a
one-shot re-encrypt, promote the env var.

### `CRON_SECRET`
Stateless. Rotate by:

1. Push a new env var to all Vercel + cron-trigger callers.
2. After the new value is propagated everywhere, retire the old.

## What cannot be restored from app DB alone

- **Supabase Storage objects** — Wi-Fi guide images, statement PDFs,
  guest-uploaded request attachments. Restore from the storage
  bucket snapshot.
- **External provider sessions** — direct-booking deposit sessions,
  webhook payloads. We never persist provider session secrets;
  active sessions become invalid after a restore. Cancel + re-issue.
- **Email queue at Resend** — in-flight messages are at the provider.
  After a restore, queued rows in `notification_queue` will retry;
  duplicates are deduped by `dedupe_key`.
- **Anthropic AI conversation context** — stateless; no recovery
  needed.

## Cross-references
- [ADR-0034 — Security Baseline & Operational Hardening](./ADR-0034-SECURITY_BASELINE_AND_OPERATIONAL_HARDENING.md)
- [ADR-0004 — Finance Engine + Owner Statements](./ADR-0004-FINANCE_ENGINE_AND_OWNER_STATEMENTS.md)
- [ADR-0033 — Finance Statement Transparency](./ADR-0033-FINANCE_STATEMENT_TRANSPARENCY.md)
