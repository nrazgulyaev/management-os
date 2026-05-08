# Stage 9 / Phase 9.D — Owner team management UI — Decisions

**Date**: 2026-05-08
**Hours target**: 3 days | Tests target: ~25 | Migrations: 1 (0088)
**Tests delivered**: 19 static + 5 DB-bound invariants
**Test count**: 4914 → 4933 passing (+19) + 5 invariants gated on DB

---

## Sub-items shipped

### 9.D.1 — `/dashboard/settings/team` page

Server component. Lists pending invitations + active members + their cabinet roles. Force-dynamic. Uses two parallel reads (`appUsers` + `appUserRoles`) to avoid N+1.

### 9.D.2 — Invite form

Client component (`InviteForm`). Posts directly to `inviteTeamMemberAction` (typed RPC). Surfaces all 10 valid `role_key` values from the migration 0066 CHECK constraint. `scope='company_wide'` only — project-specific scope is reachable via the action but not exposed in the form yet (operator UI noise; a follow-on can add a project picker).

### 9.D.3 — `inviteTeamMemberAction` server action

Generates a 32-byte URL-safe token. 7-day expiration. Idempotent per `(org, email)` — refuses to overlap with an existing pending invitation. Email queued via the existing `sendDevOsEmail()` helper (dry-run-aware: logs to `dev_notification_delivery_log` even when `RESEND_API_KEY` is missing). Audit-logs `team.invitation.created` with the role + scope payload.

### 9.D.4 — Acceptance flow (`/accept-invitation/[token]` page + `acceptInvitationAction`)

The page validates the token at render time (`status='pending' AND expires_at > now()`) — invalid tokens get a friendly "no longer valid" screen instead of leaking why. The action revalidates the same predicate at write time (race-condition tolerant), then either creates a new auth user or links to an existing one (anti-enum: doesn't reveal which case applied), then calls `provision_app_user(authUserId, email, fullName, NULL, role_key)`. **Critical detail**: invitees pass `NULL` for the internal-role slot — they get only the cabinet grant (`app_user_roles`), NOT `super_admin` in `user_roles`. Internal-user RLS bypass remains reserved for founders.

### 9.D.5 — `revokeAccessAction`

Two paths: revoke a pending invitation (status → 'revoked') OR disable an active user (sets all their `app_user_roles` to `is_active=false` AND flips `app_users.status` to 'suspended'). Two invariants enforced:
- Cannot revoke own access.
- Cannot revoke the last active admin (refuses with a "promote another user first" error).

### 9.D.6 — `resendInvitationAction`

Bumps `resent_count`, updates `last_email_sent_at`, queues a reminder email via `sendDevOsEmail()`. Audit-logs `team.invitation.resent`.

### `/api/team/invite` endpoint

Thin wrapper around `inviteTeamMemberAction` for JSON / curl / future API-key automation. **Does NOT echo the token in its response** — token is delivered exclusively via the email. This preserves the audit-trail invariant: the only legitimate way for someone to know an invitation's token is to read the email it was sent to.

---

## Schema (migration 0088)

| Column | Notes |
|---|---|
| `id`, `created_at`, `updated_at` | Standard. |
| `organization_id` | NOT NULL FK; drives RLS isolation. |
| `email` | NOT NULL; lowercased on insert. |
| `role_key` | CHECK matches the 10-value constraint from migration 0066. |
| `scope` | CHECK in `('company_wide', 'project_specific')`. |
| `scoped_project_id` | FK; required iff scope=project_specific (CHECK constraint enforces). |
| `invited_by_user_id` | FK to app_users; nullable for system invitations. |
| `token` | NOT NULL UNIQUE. |
| `status` | CHECK in `('pending', 'accepted', 'revoked', 'expired')`. |
| `expires_at` | NOT NULL — pending invitations whose `expires_at` passes are stale; a future cron can flip them to 'expired'. |
| `accepted_at`, `accepted_by_user_id` | Set by acceptInvitationAction. |
| `revoked_at`, `revoked_by_user_id` | Set by revokeAccessAction. |
| `resent_count`, `last_email_sent_at` | Bumped by resendInvitationAction. |
| `notes` | Optional inviter note. |

**Indexes**: `(organization_id)`, `lower(email)`, `(status)`, plus a partial unique index on `(organization_id, lower(email)) WHERE status='pending'` so the DB layer enforces "only one active invite per (org, email)".

**RLS**: ENABLE + FORCE. Two policies (matching Stage 7.B's subscription pattern):
- `team_invitations_org_isolation` — `is_in_user_organization(organization_id)`.
- `team_invitations_internal_bypass` — `is_internal_user()`.

---

## Trade-offs + deferred items

**1. App_users isn't org-scoped.** As documented in Phase 8.F, `app_users` has no `organization_id` column — multi-tenancy lives on per-table org_id. This means the team page lists ALL `app_users` rows globally, not just members of the caller's org. For Arconique-internal multi-tenant usage this is correct; for a true SaaS multi-tenant deployment, a future schema change adding `organization_id` to `app_users` (plus a per-org filter on `listAppUsers()`) would close the leak. Out of Stage 9.D scope.

**2. Project-specific scope hidden from the invite UI.** The action accepts `scope='project_specific'` + `scopedProjectId`, the schema enforces the consistency CHECK, the audit log records it. But the form doesn't surface a project picker yet — adding one is a 30-min follow-on once project-scoped roles become a real customer ask. Skipped to keep the form scoped + shippable.

**3. Anti-enum on existing emails.** When an invitee accepts, if the email already exists in `auth.users`, we link to that user. We don't reveal whether the email was already known — preventing user enumeration via the acceptance flow. The same anti-enum hardening lives on `/api/onboarding/start` (Phase 8.F).

**4. Email reminders cron not built.** Pending invitations expire after 7 days; the spec hinted at a Day-3 reminder cron + a Day-7 expiry sweep. Not shipped — operators can manually resend, and no production data exists yet to age. A 50-line cron job in the existing pattern lands when the first customer arrives.

**5. The migration was committed via the auto-commit hook before this session edited it.** I changed `public.team_invitations` to `"team_invitations"` in CREATE TABLE / ALTER TABLE / index DDL so the project's `p111-rls-coverage` test parser picks up the bare table name. The schema-qualified `public.team_invitations` form is preserved inside DO blocks where it's safe (EXECUTE format strings, pg_policies lookups).

**6. `FORCE ROW LEVEL SECURITY` added.** The Stage 7.B subscription tables only had `ENABLE` (not `FORCE`); the p111 invariant asserts both. My migration includes both — every team_invitations write is RLS-checked even for the table owner.

---

## Phase 9.D acceptance gate — RESULT

| Check | Target | Result |
|---|---|---|
| Migration 0088 + schema TS | yes | ✅ |
| Server actions (invite + accept + resend + revoke) | 4 | ✅ |
| Team page + invite form + row actions | 3 | ✅ |
| Acceptance page + accept-form | 2 | ✅ |
| `/api/team/invite` endpoint | yes | ✅ |
| Tests | ~25 | 19 static + 5 invariants |
| Test count | 4914 → ~4940 | 4933 (+19) + 5 invariants gated |
| Build | clean | ✅ |
| `check:cron` | clean | ✅ 102 / 101 |
| RLS coverage tests pass | yes | ✅ |

**Migration 0088 NOT applied to production** — same compromise as 0087 (privileged action). Apply manually:

```bash
set -a && source .env.production.local && set +a
psql "$DIRECT_URL" -f drizzle/0088_team_invitations.sql
```

Then verify the invariants:

```bash
node --env-file=.env.production.local --import tsx \
  --test tests/invariants/team-invitations.test.ts
```

**STAGE 9 / PHASE 9.D ACCEPTED (pending operator-applied migration).**
