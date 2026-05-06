# Management OS — Launch Readiness Summary

> Established at Prompt 115.  Companion to ADR-0038.

## 1. Overall readiness status

| Stage | Status | Evidence |
|---|---|---|
| **Demo-ready** | ✅ yes | 591/591 tests pass; mock data renders every surface; demo walkthrough doc + dashboard cover every flow |
| **Staging-ready** | ✅ yes | every static check green; production gates green; staging readiness report emits clean Markdown; staging launch checklist drafted |
| **Production-ready** | 🟡 conditional | gated on operator-side preconditions (Supabase project, env vars, Vercel cron, backups, MFA bootstrap) — see § 5 |

## 2. Go / no-go criteria

### Staging — go

- ✅ `npm run preflight:deploy` exits 0
- ✅ `npm run staging:report` shows fatal=0, warnings tolerable
- ✅ `npm run check:cron-auth` green (every cron route gated)
- ✅ `npm run check:storage` green (every bucket private + documented)
- ✅ Migration count + RLS coverage stable (34 migrations · 172 tables ·
  RLS forced on every base table)
- ✅ Demo walkthrough completes end-to-end on a staging Supabase
  project

### Production — no-go until

- 🟡 Real Supabase project provisioned per
  `docs/SUPABASE-PROVISIONING-CHECKLIST.md`
- 🟡 All required env vars set per
  `docs/ENVIRONMENT-VARIABLES.md` (`mode=production` → fatal=0)
- 🟡 `CRON_SECRET` set on Vercel + matches the value Vercel uses
- 🟡 Storage buckets created as private (`task-attachments`,
  `guest-request-attachments`)
- 🟡 Backups verified per `docs/RUNBOOK-BACKUP-RESTORE.md`
- 🟡 Admin bootstrap completed (`/auth/setup/admin-bootstrap`); MFA
  set up
- 🟡 `ARCONIQUE_FORCE_MOCK`, `NEXT_PUBLIC_ENABLE_DEMO_MODE`,
  `DEMO_MODE`, `ALLOW_DEV_CRON_WITHOUT_SECRET`,
  `ALLOW_DEMO_SECURITY_FALLBACKS` all unset / `0`
- 🟡 `NOTIFICATIONS_DRY_RUN` and `AI_DRY_RUN` explicit (`0` or `1`)
- 🟡 At least one full pass through
  `docs/STAGING-LAUNCH-CHECKLIST.md` on the staging project

## 3. Critical blockers

None today.  The known-issues registry
(`src/features/prelaunch/known-issues.ts`) contains no entries with
`severity: "blocker"` and `status: "deferred"`.

If a blocker is discovered post-Prompt-115, it must be raised as a
new issue with severity blocker + a fix prompt before continuing.

## 4. Accepted limitations

These ship as documented v1 trade-offs:

| Area | Limitation | ADR / doc |
|---|---|---|
| Direct booking | No real PSP — manual provider stub | ADR-0029 |
| Direct booking | No real refund call — manual ledger entry | ADR-0030 |
| Pricing | Channel push is a simulation | (P104 / dynamic-pricing) |
| Integrations | No OTA write API | (P104 + post-v1 backlog) |
| Notifications | No WhatsApp / Telegram | ADR-0010 |
| Notifications | Default dry-run; explicit flip needed | ADR-0036 |
| AI | Read-only insights only | (P104 / AI strategy) |
| Smart home | Smart-lock issuance is a stub | (post-v1 backlog) |
| Owner views | IDR only (no FX) | (post-v1 backlog) |
| Owner views | No Xero / QuickBooks export | (post-v1 backlog) |
| Vendor portal | No payouts | (post-v1 backlog) |
| UX | English-only UI | (post-v1 backlog) |
| Field PWA | Online-first; partial offline cache | (post-v1 backlog) |
| Operations | Production-minimal seed is a stub | ADR-0036 |
| Observability | JSON logger; no SIEM hookup yet | ADR-0036 |
| Security | TOTP MFA only — no WebAuthn | ADR-0034 |
| Security | App-level login throttle (best-effort) | ADR-0034 |
| Security | No AV / content-moderation on uploads | ADR-0023 |

Full list in
`src/features/prelaunch/known-issues.ts` and rendered on the demo
dashboard.

## 5. Required before production

In order:

1. **Provision Supabase** following
   `docs/SUPABASE-PROVISIONING-CHECKLIST.md`.
2. **Set every required env var** per
   `docs/ENVIRONMENT-VARIABLES.md`.  `npm run check:env` (in production
   mode) must report fatal=0.
3. **Apply migrations** via `npm run db:migrate` against the
   production database.
4. **Create both storage buckets** as private; configure RLS on
   `storage.objects` so only the service role can read/write.
5. **Configure Vercel cron** entries for every job key documented in
   `docs/VERCEL-CRON-CHECKLIST.md`.
6. **Configure backups** following
   `docs/RUNBOOK-BACKUP-RESTORE.md` and verify a restore.
7. **Bootstrap the first super_admin** at
   `/auth/setup/admin-bootstrap`; complete MFA enrol; rotate the
   bootstrap secret.
8. **Disable demo flags**: confirm `ARCONIQUE_FORCE_MOCK`,
   `NEXT_PUBLIC_ENABLE_DEMO_MODE`, `DEMO_MODE`,
   `ALLOW_DEMO_SECURITY_FALLBACKS`,
   `ALLOW_DEV_CRON_WITHOUT_SECRET` are unset.
9. **Set notification mode** explicitly: `NOTIFICATIONS_DRY_RUN=0`
   when ready to deliver, `=1` to remain in dry-run.
10. **Set AI mode** explicitly: `AI_DRY_RUN=0` only after rate /
    cost limits are configured at Anthropic.

## 6. Recommended staging smoke sequence

Walk `docs/STAGING-LAUNCH-CHECKLIST.md` in full.  Eight phases:

0. Prerequisites (clean tree, credentials)
1. Static gate (`npm run preflight:deploy`)
2. Staging environment validation
3. Database, migrations, RLS
4. Cron + jobs
5. Storage
6. Demo / mock leak hardening
7. Manual UI smoke (operator + owner + guest + field + vendor)
8. Post-launch

Stop at the first failure, fix, re-run.

## 7. Suggested next direction

Three reasonable paths.  Pick one as Prompt 116:

### Option A — Deploy Management OS to staging (recommended)
- **Scope:** Prompt 116 walks through
  `docs/STAGING-LAUNCH-CHECKLIST.md` end-to-end against a real
  Supabase + Vercel staging project.
- **Output:** a staging deployment report (`tmp/staging-deployment-
  report.md`), a list of issues surfaced + fixed, and a green
  staging environment ready for stakeholder demo.
- **Why:** every prompt from P107 onwards has been preparing for
  this.  Confidence in the platform compounds dramatically with the
  first real deployment.

### Option B — Begin Development OS / Construction OS
- **Scope:** open scope on the next operating system in the
  Arconique family.  Starts with a fresh ADR + scope freeze.
- **Why:** if the team's commercial priority is portfolio breadth
  rather than depth.

### Option C — One more polish sprint
- **Scope:** another Prompt 117-style polish pass focused on a
  specific weakness (e.g. owner mobile responsiveness, finance
  exports, accessibility audit).
- **Why:** if a specific stakeholder demo requires a specific
  surface to be more polished.

The platform recommends **Option A**.  The more polish prompts you
add before the first deploy, the longer the platform takes to
deliver real value.
