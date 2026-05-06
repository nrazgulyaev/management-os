# QA Demo Walkthrough — Arconique Management OS

This is the screenshot-ready end-to-end walkthrough for the demo
environment. Run it after every release candidate before showing the
demo to anyone.

A live, click-through version of this checklist also exists at
`/dashboard/demo` (the demo launchpad) — both are kept in sync.

---

## 0. Local startup checklist

```bash
# 1. Install + env.
npm install
cp .env.example .env.local            # fill in DATABASE_URL, DIRECT_URL,
                                       # NEXT_PUBLIC_SUPABASE_URL, etc.

# 2. Schema + seed.
npm run db:migrate                     # apply 0000…0033
npm run db:seed                        # apply drizzle/seed.sql

# 3. Refresh derived projections (owner-visible events, owner-booking
#    summaries, owner-revenue source mix, statement transparency).
npm run demo:rebuild

# 4. Validate the demo data.
npm run demo:validate                  # should print "Overall: OK"

# 5. Run dev server.
npm run dev                            # http://localhost:3000
```

### Required env (minimum)

| Var | Purpose | Required |
|---|---|---|
| `DATABASE_URL` / `DIRECT_URL` | Postgres connection (pooled / direct). | Yes |
| `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Auth. | Yes for sign-in |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side admin ops. | Yes for admin |
| `CRON_SECRET` | Gate for `/api/cron/*` routes. | Yes for cron |
| `STAY_LINK_KMS_SECRET` | Wi-Fi password encryption. | Optional in dev |
| `SECURITY_ENCRYPTION_SECRET` | MFA secret encryption. | Optional in dev |
| `LOGIN_THROTTLE_ENABLED` | Default `1`. | Optional |
| `BACKUP_RUNBOOK_URL` | Shown on `/dashboard/system/health`. | Optional |

### Demo users

The seed creates demo users with `@example.test` and `@arconique.local`
emails (no real domains). Sign in via Supabase auth using the
service-role token or your local Supabase studio. When in doubt,
create your own `super_admin` via `/setup/admin-bootstrap`.

---

## 1. Admin smoke test

Click in this order — each page should load without console errors
and without "Failed query" red boxes.

1. `/dashboard` — landing.
2. `/dashboard/projects` — 3 projects (Eternal / Enso / Ahau).
3. `/dashboard/villas` — 6+ villas across the projects.
4. `/dashboard/owners` — Emma / Takeda / Sonoma demo owners.
5. `/dashboard/bookings` — at least 5 bookings across direct + OTA + manual.
6. `/dashboard/finance` — finance landing renders metrics.
7. `/dashboard/finance/statements` — at least one issued + one approved.
8. `/dashboard/finance/transparency` — hub card + Rebuild-all button.
9. `/dashboard/owner-intelligence` — overview + booking projection + revenue links.
10. `/dashboard/operations` — recent ops tasks.
11. `/dashboard/maintenance-intelligence` — preventive plans + risks.
12. `/dashboard/utilities` — utility accounts + payment reminders.
13. `/dashboard/inventory` — items + low-stock cards.
14. `/dashboard/procurement` — purchase requests + orders.
15. `/dashboard/pricing` — rule sets + pricing calendar link.
16. `/dashboard/jobs` — job definitions + recent runs.
17. `/dashboard/jobs/runs` — job_runs table.
18. `/dashboard/jobs/locks` — at least one demo `demo_active_job` row.
19. `/dashboard/notifications` — notifications hub.
20. `/dashboard/audit` — audit events scroll.
21. `/dashboard/security` — camera registry hub.
22. `/dashboard/security/auth` — auth security overview.
23. `/dashboard/security/login-attempts` — recent demo attempts.
24. `/dashboard/security/events` — recent security events.
25. `/dashboard/security/mfa` — MFA factors list.
26. `/dashboard/system/health` — every tracked table `present`, env keys ready.
27. `/dashboard/demo` — demo launchpad with 9 cards.

If any page renders a `migration pending` card, run `npm run db:migrate`.

---

## 2. Owner walkthrough

> P116B note: in demo mode, every owner-portal surface has a static
> fallback so it renders meaningful content even when the live DB has
> no rows for the demo owner.  See
> `src/features/demo-data/owner-portal-fallback.ts`.  Expected demo
> minimums:
>
> - `/owner/bookings` — at least **8** rows (mix of direct, OTA, owner
>   stay, maintenance, internal hold).
> - `/owner/revenue` — **non-zero** gross + at least **7** monthly
>   rows across 3 months.
> - `/owner/stays` — at least **4** owner-stay requests.
> - `/owner/inbox` — at least **6** notifications.
> - `/owner/calendar` — visual month grid (P116B) above the per-villa
>   tables.

Sign in as a demo owner (Emma is wired most heavily).

1. `/owner` — portfolio overview.
2. `/owner/calendar` — direct, OTA, owner-stay, maintenance overlays
   visible. Legend shows distinct badges.
3. `/owner/bookings` — list with masked guest labels (`Emma W.` etc),
   no email / phone / token leaks.
4. `/owner/bookings/<id>` — booking detail with revenue breakdown +
   linked statement (when posted).
5. `/owner/revenue` — direct vs OTA source mix cards + monthly bucket
   table.
6. `/owner/villas/<villaId>/calendar` — per-villa calendar.
7. `/owner/villas/<villaId>/revenue` — per-villa source mix.
8. `/owner/statements` — list with transparency status badge per row.
9. `/owner/statements/<id>` — source-grouped statement, "Why this
   number" snapshot card, owner-visible warnings, linked activity.
10. `/owner/statements/<id>/pdf` — PDF download (renders the snapshot
    when present, otherwise the deterministic explanation).

Verify: no row contains a guest email/phone, a provider session id, a
finance-link id, a revenue-line id, or a statement-period id.

---

## 3. Guest stay walkthrough

Guest stay routes are token-bound. Two ways to walk through:

### Demo route (no token required)
- `/stay/demo` — fully fixture-driven stay portal preview.
- `/field/tasks/demo` — field task preview.

### Live token (recommended for QA)
1. Mint a fresh stay token from the admin booking detail page:
   `/dashboard/bookings/<id>` → "Issue stay token".
2. Copy the **raw** token (shown exactly once).
3. Visit `/stay/<rawToken>`.

Click through:
- `/stay/<token>` — landing card with villa + dates.
- `/stay/<token>/check-in` — verification flow (or auto-bypass
  in dev).
- `/stay/<token>/wifi` — Wi-Fi reveal (encrypted at rest).
- `/stay/<token>/guide` — guide sections.
- `/stay/<token>/house-rules` — rules.
- `/stay/<token>/neighborhood` — neighborhood places.
- `/stay/<token>/emergency` — emergency contacts.
- `/stay/<token>/services` — service catalog with order CTA.
- `/stay/<token>/services/orders` — orders list.
- `/stay/<token>/concierge` — AI concierge session.
- `/stay/<token>/requests` — request center with replies.

---

## 4. Direct booking walkthrough

1. Mint a direct-booking hold via the public form at
   `/book/<villaSlug>` (or `/book/quote`). The response includes
   the **raw** token; copy it.
2. Visit `/book/hold/<rawToken>` to see the post-quote page.
3. Submit guest details on the hold page → request created.
4. Open `/book/hold/<rawToken>/status` — the public status center.
   Verify: clean 14-stage timeline, no internal IDs, no
   `manually_marked_paid` literal.
5. Send a concierge message via the composer.
6. Switch to admin `/dashboard/direct-bookings/requests/<id>`:
   - Mark under review → status updates on the public page.
   - Approve → deposit gate opens.
   - Mark deposit paid → public page flips to `deposit_confirmed`.
   - Convert to booking → `/book/hold/<rawToken>/status` shows
     `confirmed`.
7. `/dashboard/direct-bookings/reconciliation` — finance link visible.
8. `/dashboard/direct-bookings/guest-status` — snapshot listed.
9. `/dashboard/direct-bookings/messages` — thread visible.

---

## 5. Field walkthrough

1. `/field/tasks/demo` — fixture demo (no auth required).
2. `/field` — assigned tasks landing.
3. `/field/tasks/<id>` — task detail with checklist + photo-required
   items.
4. `/field/inventory` — inventory by location.

---

## 6. Vendor walkthrough

1. From `/dashboard/service-fulfilment`, mint a vendor token for a
   pending fulfilment.
2. Open `/vendor/service/<token>`.
3. Accept the request, set ETA, mark in-progress, complete.
4. Submit invoice metadata at `/vendor/service/<token>/invoice`.

---

## 7. Finance walkthrough

1. `/dashboard/finance/statements` — list of statements.
2. `/dashboard/finance/statements/<id>` — admin detail.
3. Click "Open transparency" → `/dashboard/finance/transparency/statements/<id>`
   (admin source trace + warnings).
4. `/dashboard/finance/transparency/warnings` — filter by severity /
   status; acknowledge → resolve a sample warning.
5. Open the same statement at `/owner/statements/<id>` — source
   grouping card, snapshot, owner-visible warnings only.

---

## 8. Operations walkthrough

1. `/dashboard/operations` — open tasks per villa.
2. `/dashboard/maintenance-intelligence` — plans + risks.
3. `/dashboard/utilities` — accounts + payment reminders.
4. `/dashboard/inventory` — stock + low-stock.
5. `/dashboard/procurement` — purchase requests + orders.

---

## 9. Pricing walkthrough

1. `/dashboard/pricing` — rule sets + metrics.
2. `/dashboard/pricing/calendar` — per-villa nightly grid.
3. `/dashboard/pricing/quote` — quote tester (deterministic result).
4. `/dashboard/pricing/logs` — quote audit trail.
5. `/dashboard/pricing/channel-events` — simulated push events.

---

## 10. Security / system health walkthrough

1. `/dashboard/system/health` — table presence grid + env checklist.
2. `/dashboard/security/auth` — auth security hub.
3. `/dashboard/security/login-attempts` — recent attempts (hashed
   IP / UA).
4. `/dashboard/security/events` — security event feed.
5. `/dashboard/security/mfa` — MFA factors. Click `/setup/mfa` to
   enrol your own; verify; you should land on
   `/setup/mfa/recovery-codes` with 10 codes (shown once).
6. `/dashboard/jobs/locks` — current locks; "Expire stale locks"
   button works.
7. `/dashboard/notifications/deliveries` — delivery log.

---

## 11. Expected limitations

- **No real PSP** — direct-booking deposits are manual-stub only.
  Mark-paid is a director / finance-manager action.
- **No real smart lock** — Wi-Fi reveal works; lock control is a
  stub.
- **No real OTA push** — channel push events are simulated.
- **No WhatsApp / Telegram** — notifications dry-run by default
  (`NOTIFICATIONS_DRY_RUN=1`). Resend is supported when configured.
- **No AI write tools** — guest concierge sessions are read-only
  with deterministic scripted replies.
- **No real vendor payout** — vendor portal accepts invoice metadata;
  no money movement.
- **Tokens are never persisted in plaintext** — every demo token
  must be minted live as described above.
- **MFA enforcement on sign-in is deferred** — service layer +
  admin pages are ready; full enforcement requires routing sign-in
  through a server action (Prompt 113).

---

## 12. Expected validation outcomes

After `npm run demo:validate`:

```
Demo-data validation report
===========================

Row count checks:
  ✓ projects                                expected ≥   3, got   3
  ✓ villas                                  expected ≥   6, got  10
  ✓ owners                                  expected ≥   3, got   3
  ✓ ownership_shares                        expected ≥   3, got   N
  …
  ✓ statement_explanation_snapshots         expected ≥   1, got   1

Projection scan: no banned tokens or real-looking PII found.

Overall: OK
```

If any check fails, re-run:

```bash
npm run db:migrate
npm run db:seed
npm run demo:rebuild
npm run demo:validate
```

If `Overall: FAILED` persists after a clean rebuild, file a bug with
the failing check name attached.

---

## Cross-references

- [ADR-0035 — Full Demo Data + QA Pass](./ADR-0035-FULL_DEMO_DATA_AND_QA_PASS.md)
- [RUNBOOK-BACKUP-RESTORE](./RUNBOOK-BACKUP-RESTORE.md)
- Live launchpad: `/dashboard/demo`.
