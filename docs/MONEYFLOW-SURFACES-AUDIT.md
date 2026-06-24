# Money-Flow Correctness + Un-Audited Surfaces Audit — 2026-06-24

Two audits in one pass (the prior 3 completeness audits covered operator-surface completeness + cross-tenant tenancy; these cover what they did NOT): **(A) money-flow correctness** (the financial spine end-to-end for math/lifecycle/concurrency bugs) and **(B) un-audited surfaces** ((auth)/signup, billing/subscription, (platform-app)). 10 clusters → adversarial verify.

**Result: 29 confirmed (10 high, 19 med) + 19 low — 16 money defects.**

## 🔴 HIGH (10) — fix-now

### Security (auth)
1. **Public signup mints GLOBAL `super_admin`** (`signup/actions.ts:218`) — `assign_user_role(user,'super_admin',NULL,NULL)`. `super_admin` (NULL scope) is the platform super-admin gate; `(platform-app)/layout.tsx` gates the cross-tenant **Platform Admin OS purely on it**, and the platform pages read ALL orgs. So **any public signup gets cross-tenant platform-admin access.** (The canonical `provision_app_user` (0087) also grants it — the role conflates "org admin" and "platform admin".) **Fix = gate the Platform OS on platform-org membership** (super_admin AND org = ARCONIQUE_DEFAULT), not change the tenant role (which risks locking tenant admins out of their own cabinets). Handled manually.
2. **Login has no throttle/lockout** (`auth/actions.ts:70`) — brute-forceable; a login-attempts table+admin surface exist but `signInAction` never calls them.
3. **MFA verify + recovery-code unthrottled** (`mfa-actions.ts:104`) — brute-force the 2FA.
4. **MFA enforcement missing on platform-app + field layouts** — an MFA-enrolled user reaches those surfaces without completing the challenge (`enforceMfaChallengeCleared` not called).

### Money
5. **Statement DOUBLE_COUNT loses a villa's payout** (`statement-generator.ts:1292`) — the idempotency lookup drops `villaId` while the cron generates per-(owner,villa); call #2 matches call #1's row → UPDATE branch overwrites villa #1's statement with villa #2 → **an owner with 2+ villas silently loses a whole villa's payout.**
6. **Disputed statements can still be paid out** (`finance/actions.ts:751`) — the dispute pause is enforced only at line creation, not at the money-releasing approved→paid transition.
7. **Drawdown confirm RACE** (`drawdown-actions.ts:173`) — non-locking read-then-write → double-credit the investor wallet (balance ≠ Σ ledger).
8. **Wallet write actions RACE** (`wallet-actions.ts`, withdraw/reinvest/hold/release/adjust) — non-locking read-then-write, no CAS → lost updates / overdraw.
9. **Statement CURRENCY mix** (`statement-generator.ts:294`) — the ledger source path sums lines without filtering by currency → mixes USD+IDR into one figure.

### Billing
10. **Paid plan can never activate** (`stripe-subscription-bridge.ts:174`) — no `checkout.session.completed` handler, so `org_subscriptions` never links after a successful checkout.

## MED (19) — selected
- executeDistribution: declared→executing flip has no status precondition; wallet credit has no DB-level idempotency; balance read-then-write not concurrency-safe.
- payout batch mark-paid decoupled from its lines; statement-period close/lock/reopen tenancy.
- Xendit invoice.paid webhook: no amount assertion before flipping to paid; shared milestone settlement race; buyer-portal invoice pill stuck due/overdue after paid.
- owner-statement PDF operator-fee % headline is hardcoded (MOCK_MONEY).
- Stripe webhook event.id not deduped (redelivery double-applies); reconciliation cron is a no-op stub.
- signup → org provisioning has no transaction/rollback (orphan org on partial failure); app-user revoke/suspend is cosmetic for super_admin; requireOrgId unauth→ARCONIQUE_DEFAULT fallback; platform `/[orgCode]` audit-log drill broken; 3 divergent provisioning paths (none stamps both trial fields consistently).

## Fix plan
- **Wave 1 (running):** the clear money (double-count, races, currency, disputed-pause, distribution guards), payments (webhook amount assert, settlement race), billing (checkout.session.completed, webhook dedup, reconciliation), and auth-throttle (login + MFA throttle + MFA-layout enforcement) findings — file-disjoint fan-out, strictly reviewed.
- **Manual (after wave):** the signup→super_admin escalation = gate the Platform OS on platform-org membership; signup provisioning rollback transaction.
- **Operational (separate):** turnover times migration, whatsapp inbound org=NULL, E2E for the money flows, statement_timeout ALTER ROLE runbook (founder-run).

## Resolution — shipped on `fix/moneyflow-security-wave1`

**Wave 1 (17 fixes, file-disjoint fan-out + adversarial verify):**
- Money: statement DOUBLE_COUNT now keys idempotency on `villaId` (matches the
  per-villa partial-unique index; `isNull` for pool-only owners); CURRENCY mix
  fixed at the ledger source pulls; disputed statements re-checked at the
  money-releasing approved→paid transition (`ownerState='disputed'`, org-scoped);
  drawdown/wallet/distribution RACEs rewritten to SQL-side atomic deltas with a
  `available_balance >= X` balance guard + `rowCount===1` assert + status-flip CAS
  gates (`WHERE status <> 'received'`).
- Payments: Xendit `invoice.paid` amount assertion before flip-to-paid; shared
  milestone settlement race closed; buyer-portal invoice pill clears on paid.
- Billing: added the missing `checkout.session.completed` handler (paid plans now
  activate); Stripe webhook event dedup; the claim is now a two-phase
  `processing`→`processed` lease (insert `processing`, finalize to `processed`
  ONLY after side effects succeed, release on failure/non-terminal) so a crash
  mid-apply no longer durably loses the event; reconciliation poller wired.
- Auth: login throttle/lockout + MFA verify/recovery-code throttle (existing
  login-attempts table); MFA challenge enforcement added to the platform-app +
  field layouts.

**Manual — signup→super_admin escalation (#1), FIXED via platform-admin allowlist:**
`super_admin` is granted to every org admin by BOTH provisioning paths, so it
conflates "org admin" with "platform operator". Rather than change the tenant
role (lockout risk), the two shared platform helpers — `requireSuperAdmin()` and
`isSuperAdminContext()` in `features/auth/require-super-admin.ts` — now ALSO
require the signed-in email to be on the `PLATFORM_ADMIN_EMAILS` env allowlist.
This locks all 18 cross-tenant platform call sites (org CRUD, impersonation,
subscription-OS, platform agents/flags, the `(platform-app)` layout) at once,
while the raw `ctx.isSuperAdmin` field is unchanged so tenant admins keep their
OWN cabinets. **FAIL-CLOSED**: with the var unset, no live user reaches the
Platform OS (demo exempt) — set `PLATFORM_ADMIN_EMAILS` in the deploy env.

**Still open (deferred, not in this PR):**
- Deeper role cleanup: signup/`provision_app_user` should grant an org-scoped
  admin role, not GLOBAL `super_admin` (the allowlist contains the blast radius
  for now). signup provisioning rollback transaction (orphan org on partial fail).
- Operational: turnover-times migration, whatsapp inbound org=NULL resolver, E2E
  money-flow tests, `statement_timeout` ALTER ROLE runbook (founder-run).
