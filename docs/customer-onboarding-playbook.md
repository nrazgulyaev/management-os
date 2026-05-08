# Customer onboarding playbook

**Stage 9.H** · **Audience**: Arconique HQ ops + the founder
**Last updated**: 2026-05-08
**Companion docs**:
- [STAGE-7-G-PRODUCTION-AUDIT.md](STAGE-7-G-PRODUCTION-AUDIT.md) — production route + workflow audit
- [VERCEL-CRON-CHECKLIST.md](VERCEL-CRON-CHECKLIST.md) — cron schedule reference
- [cross-org-isolation-playbook.md](cross-org-isolation-playbook.md) — security manual probe before commerce launch
- [DEPLOYMENT-RUNBOOK.md](DEPLOYMENT-RUNBOOK.md) — domain + Vercel env reference

---

## What this doc is

A field guide for the team supporting **new customers** through their first 30 days. It covers:

1. The pre-launch checklist that must be green before announcing availability.
2. The 5-step happy-path a new customer walks through.
3. The trial-to-paid email sequence.
4. The support runbook for the most common issues.
5. The escalation path when things go wrong.

The contents are runnable instructions, not aspirational marketing. Every step has either a URL, a CLI command, or a Slack channel.

---

## 1. Pre-launch checklist

These are the gates that must close before a customer signs up. The first column is the gate; the second is how to verify it; the third is who owns the fix if it's red.

| Gate | Verification | Owner |
|---|---|---|
| `STAY_LINK_KMS_SECRET` set on Vercel | `vercel env ls production \| grep STAY_LINK_KMS_SECRET` | Founder |
| `RESEND_API_KEY` set on Vercel | `vercel env ls production \| grep RESEND_API_KEY` | Founder |
| `CRON_SECRET` set + matches deployed cron config | `npm run check:cron` shows 102/101 | Eng |
| `SUPABASE_SERVICE_ROLE_KEY` set | `vercel env ls production \| grep SUPABASE_SERVICE_ROLE_KEY` | Founder |
| `STRIPE_SECRET_KEY` set to **live** key (Stage 9.A landed) | live key starts with `sk_live_` (NOT `sk_test_`) | Founder |
| `STRIPE_WEBHOOK_SECRET` set to production webhook secret | match the secret in Stripe dashboard → Webhooks | Founder |
| Migration 0087 applied + 6 provisioning invariants green | `node --env-file=.env.production.local --import tsx --test tests/invariants/provisioning.test.ts` → 6 passed | Eng |
| Migration 0088 applied + 5 team-invitation invariants green | `tests/invariants/team-invitations.test.ts` → 5 passed | Eng |
| Migration 0089 applied + Stage 5.J cross-org gap closed | `tests/invariants/tenant-isolation.test.ts` → 6 passed | Eng |
| Migration 0090 applied + 5 AI-config invariants green | `tests/invariants/org-ai-agent-config.test.ts` → 5 passed | Eng |
| Cross-org isolation manual probe (Suites 1-4) | walk `cross-org-isolation-playbook.md` once with two test orgs | Eng |
| Production audit re-run after final deploy | `npx tsx scripts/audit-production-pages.ts --auth` → 0 BROKEN, 0 PARTIAL | Eng |
| Workflow trace re-run | `npx tsx scripts/workflow-trace.ts` → 6/6 complete on read-only steps | Eng |
| 6 tier-3 cabinets (`gateCabinetForCurrentOrg`) gate correctly for non-internal plans | manually: log in as a teammate with `marketing_staff` role on a non-Pro plan, hit `/development-os/cabinets/cfo-accountant` → bounce to `/dashboard/billing/upgrade` | Eng |
| `/dashboard/system/health` renders < 3s | curl + 3 second budget | Eng |
| `/dashboard/pricing` + `/dashboard/direct-bookings` render < 3s | (Stage 9.I) | Eng |
| Welcome email template tested via dry-run | `RESEND_API_KEY` unset → `sendDevOsEmail` logs to `dev_notification_delivery_log` with `error_reason='dry_run'` and the body looks right | Ops |
| Customer support inbox (support@arconique.com) wired | someone replies in <2h during business hours | Ops |
| Status page (`https://management-os-fawn.vercel.app/dashboard/system/health`) bookmarked | shared in #support | Ops |

If any row is red, **do not announce availability**.

---

## 2. The customer happy path (first 30 days)

### Day 0 — sign-up

1. Customer hits `/pricing`, picks a plan, clicks "Sign up to <plan>".
2. Lands on `/sign-up` with the plan pre-selected.
3. Fills email + password + name + org name + slug.
4. Submits the form → POST `/api/onboarding/start`:
   - Creates Supabase Auth user (`email_confirm: true`, no magic link required for trial).
   - Creates `organizations` row with the slug.
   - Calls `provision_app_user(auth_user_id, email, full_name, organization_id, 'super_admin', 'admin')`.
   - Inserts `org_subscriptions` with the plan + 14-day trial window.
   - Audits `org.create` + `auth.user.provisioned`.
5. Browser redirects to `/login?onboarded=1&email=<email>` — the form is pre-filled and a banner says "Workspace created — sign in below". Customer signs in and lands on `/dashboard`.

**Failure modes** (handle these in support):
- Slug already taken → 409 with `fieldErrors.org_slug` → ask for a different slug.
- Email already in `auth.users` → 409 with `fieldErrors.email` → tell them to sign in instead, or contact us if they don't recognize the email.
- Supabase Admin API not configured → 503 → on-call problem.
- Any downstream failure after auth user creation → endpoint rolls back the auth user automatically (`admin.auth.admin.deleteUser`); customer sees "please try again."

### Day 0 — welcome email

`sendWelcomeEmailToOrg(org.id)` (TODO if not yet wired) fires from the `/api/onboarding/start` audit hook. Template is in §3 below. **In dry-run mode** (no `RESEND_API_KEY`), the welcome row lands in `dev_notification_delivery_log` with `error_reason='dry_run'` and we email the customer manually from Ops.

### Day 1 — first session

Owner (the sign-up email) lands on `/dashboard`. Five suggested first actions:

1. **Add a teammate** — `/dashboard/settings/team` → invite by email + role. Phase 9.D ships this; invitee gets a `/accept-invitation/<token>` link valid for 7 days.
2. **Connect a marketing provider** — `/development-os/marketing/connections/new` → pick GA4 or Mailchimp etc. Phase 7.F.B.1 shipped 7-provider field-set.
3. **Connect banking (CSV upload)** — `/development-os/banking/new` → Mandiri or BCA CSV. Phase 7.F.B.3.
4. **Configure an AI agent** — `/dashboard/settings/ai-agents` → tier badge + plan eligibility per agent. Operator can disable an agent or override its kickoff prompt for the workspace. Phase 9.F + the 9.F follow-up wire the eligibility gate + custom prompt into the runtime.
5. **Run an agent** — any of `/development-os/ai-agents/<slug>` → "Run now". Phase 8.B shipped the buttons.

### Day 7 — engagement check

Send the trial-day-7 email (template in §3). Operator sees:
- 7 days of activity in `/dashboard/audit`.
- Their first agent outputs in `/development-os/ai-agents/inbox`.
- Their team's roles in `/dashboard/settings/team`.

If the inbox is empty + no team invitations + no integrations, send a personal outreach email asking what's blocking them.

### Day 12 — trial-ending warning

Send the trial-day-12 email (template in §3). Two days before trial expiry. Customer receives a reminder + a one-click upgrade link (`/dashboard/billing/upgrade`).

### Day 14 — trial expiry

Cron `subscription_advance_lifecycle` (Stage 7.C) runs daily at 08:30 UTC. On Day 14:
- Trial → grace if no payment method on file.
- Day 17 → suspended if no payment.
- Day 30 → archived.

**Operator can extend the trial via SQL** if a customer asks for more time:

```sql
UPDATE org_subscriptions
   SET trial_ends_at = trial_ends_at + interval '7 days',
       updated_at    = now()
 WHERE organization_id = '<org-id>'
   AND status         = 'trial';
```

Audit the manual extension in `audit_events` with `action = 'subscription.trial_extended'` so the trail is clean.

---

## 3. Email templates

These are content-only — wiring them into `sendDevOsEmail` is Stage 9.A's onboarding-completion follow-up.

### Welcome (sent immediately after sign-up)

**Subject**: Welcome to Arconique, {first_name}

**Body**:
```
Hi {first_name},

Welcome to Arconique. Your workspace "{org_name}" is live.

A 14-day trial starts now — no credit card required. You can upgrade
or downgrade any time from /dashboard/billing.

Five things you'll probably want to do this week:
  1. Add your team — /dashboard/settings/team
  2. Connect a marketing provider — /development-os/marketing/connections
  3. Upload a bank statement (CSV) — /development-os/banking
  4. Configure your AI agents — /dashboard/settings/ai-agents
  5. Run your first agent analysis — /development-os/ai-agents

Need anything? Reply to this email — it lands in our support queue.

— The Arconique team
```

### Trial day 7 — engagement

**Subject**: How's the trial going, {first_name}?

**Body**:
```
Hi {first_name},

A week into your Arconique trial — how are things?

If you've already invited your team and connected your providers,
you're set. If not, here are the most impactful next steps based on
what other operators do first:

  1. Invite your finance lead — /dashboard/settings/team
  2. Configure the QS Cost Analyst — /dashboard/settings/ai-agents/qs-cost-analyst
  3. Try the daily digest cron — /development-os/ai-agents/daily-digest

If something's blocking you, reply to this email and we'll jump in.

— The Arconique team
```

### Trial day 12 — ending soon

**Subject**: Your trial ends in 2 days — {org_name}

**Body**:
```
Hi {first_name},

Your Arconique trial for "{org_name}" ends on {trial_end_date}.

To keep your team's access uninterrupted, pick a plan from
/dashboard/billing/upgrade. We'll bill the chosen tier on
{trial_end_date} and your data + integrations stay exactly as
they are.

If you need more time, just reply — we can extend the trial by a
week, no questions asked.

— The Arconique team
```

### Trial day 14 — expired (sent on lifecycle cron transition to grace)

**Subject**: Trial ended — pick a plan to keep "{org_name}"

**Body**:
```
Hi {first_name},

Your Arconique trial ended today. Your workspace and data are still
intact, but mutations are paused for the next 3 days while you pick
a plan.

Pick a plan: /dashboard/billing/upgrade

After 3 days in grace your workspace moves to "suspended" — read-only.
After 30 days it's archived. Nothing is deleted in the first 30 days.

— The Arconique team
```

---

## 4. Support runbook

### "I can't sign in"

Check, in order:
1. Did they actually sign up? `SELECT id, email FROM auth.users WHERE email = '<email>'` — if zero rows, they never finished sign-up. Resend the sign-up link.
2. Auth user exists but `app_users` doesn't? Run the 0087 backfill block again — it's idempotent. (The migration's loop catches any orphaned auth.users at deploy time.)
3. Auth user + app_user exist but no role grants? Run `provision_app_user(auth_user_id, email, full_name, organization_id, 'admin')` against the org's id. (Use NULL for the internal-role slot — internal-bypass is reserved for Arconique HQ.)
4. Status is `suspended`? Likely revoked via the team management UI. Re-grant their role from `/dashboard/settings/team/<user_id>` — that flips them back to `active`.

### "My team can't see my data"

Cross-org leak debug:
1. Check the user's org: `SELECT email, organization_id FROM app_users WHERE email = '<their-email>'` — should match the customer's org.
2. Check their grants: `SELECT role_key, scope, is_active FROM app_user_roles WHERE user_id = '<their-app-user-id>'` — should have at least one `is_active = true` row.
3. If the customer says "my data" but the user's `organization_id` is wrong, the user got linked to the wrong tenant during sign-up. Move them: `UPDATE app_users SET organization_id = '<customer-org-id>' WHERE id = '<user-id>'` — RLS on tenant-scoped tables will then start gating their reads correctly.

### "An AI agent failed / hangs / never returns output"

1. Find the run: `SELECT id, status, error FROM ai_assistant_runs WHERE assistant_key = '<agent_key>' ORDER BY created_at DESC LIMIT 5`.
2. Common causes:
   - Org's plan tier doesn't include the agent's required flag → upgrade or wait for cron (Stage 9.F: `getAgentEligibility` returns `plan_excludes_agent`).
   - Org has disabled the agent in `/dashboard/settings/ai-agents` → re-enable.
   - Daily/monthly AI quota exceeded → see `ai_org_quota_limits` + `ai_org_usage_monthly`.
   - Provider rate-limit (Anthropic / OpenAI / Gemini) → wait or fail-over to another provider via `getAIProviderByName`.
3. Stage 8.E perf logs: search Vercel function logs for `[perf] page=…` to identify slow paths if the operator is reporting "agent runs are slow."

### "I want to cancel"

Customer Portal (Stage 9.C, when shipped) handles this. Until then:
1. Customer requests cancellation via support email.
2. Ops marks the subscription: `UPDATE org_subscriptions SET status = 'cancelling', cancel_at_period_end = true, updated_at = now() WHERE organization_id = '<id>'`.
3. Audit: `INSERT INTO audit_events (action, entity_type, entity_id, metadata) VALUES ('subscription.cancellation_requested', 'org_subscription', '<id>', jsonb_build_object('reason', '<reason>', 'requested_by_email', '<email>'))`.
4. Lifecycle cron flips the row to `cancelled` at end of current period.

### "I need an export of my data"

`/development-os/settings/data-export` — Stage 5.J shipped the data-export-requests flow. Customer kicks off a request; ops monitors `data_export_requests` table; on completion the customer gets a signed download URL.

### "Can you delete my workspace?"

Hard delete is irreversible. Procedure:
1. Confirm in writing (email reply) that the customer wants permanent deletion.
2. Confirm with founder before proceeding.
3. Run: `DELETE FROM organizations WHERE id = '<org-id>'` — CASCADEs through every tenant-scoped table.
4. Delete auth.users via Supabase admin: `admin.auth.admin.deleteUser(authUserId)` for each user that belonged only to that org.
5. Audit: `INSERT INTO audit_events (action, entity_type, entity_id, metadata) VALUES ('org.deleted', 'organization', '<id>', jsonb_build_object('requested_by_email', '<email>', 'confirmed_by', '<founder>'))`.
6. Email customer confirming completion + send a record of the delete event for their compliance.

---

## 5. Escalation path

| Severity | Symptom | Escalation |
|---|---|---|
| P0 | `/dashboard` returns 5xx for all customers | Page founder + on-call eng. Roll back via `git revert` + force-deploy. Status page update within 15 min. |
| P0 | Cross-org leak suspected (one customer sees another's data) | Page founder immediately. Pull the suspect surface offline via Vercel pause-deployments. Run the cross-org isolation playbook to confirm + identify scope. Notify affected customers within 24h per privacy policy. |
| P1 | Customer can't sign up / can't sign in | Diagnose via the runbook. If unresolved in 30 min, escalate to on-call eng. |
| P1 | Cron job stops firing (cron registry alert) | Check Vercel cron config + run via `npm run check:cron`. If the job is wedged, manually `POST /api/cron/<slug>` with `Authorization: Bearer $CRON_SECRET`. |
| P2 | An AI agent has higher-than-normal failure rate | Check `ai_assistant_runs` + provider status pages. If a single provider, fail-over via `getAIProviderByName` override. |
| P3 | UI bug on a single page | Log a GitHub issue. Fix in the next deploy. |

**Founder contact**: nrazgulyaev@gmail.com (also super_admin in production).
**Audit-bot**: audit-bot@arconique.com — used for security/test sweeps. Don't share its credentials.

---

## 6. Cadence

| Cadence | Action |
|---|---|
| Each new customer | Walk this playbook end-to-end. Note any gap in `tmp/customer-onboarding-runs.md`. |
| Weekly | Skim `audit_events` for the week's `org.create` + `auth.user.provisioned` rows. Confirm each one had a successful first session. |
| Monthly | Re-run the cross-org isolation playbook against the current production tenant set. |
| Quarterly | Update the email templates above based on what's actually working. |
| Every Stage closure | Confirm the pre-launch checklist still maps to the current state. |
