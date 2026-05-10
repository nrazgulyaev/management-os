# 06 — Issues by severity (running list — populated CHECKPOINT 2-5)

Ranked by severity. CHECKPOINT 5 will produce the final ordered list;
this file accumulates findings as each checkpoint runs.

---

## P0 — blocks customer use (must fix in Phase 10.6.B)

### 13 confirmed 500 server errors in production

Captured 2026-05-10 from
`tmp/audit-production-results-checkpoint2.json` (audit-bot session,
production deployment `https://management-os-fawn.vercel.app`).
These are **not harness flakiness** — they're hard 500s, distinct
from the 78 timeout entries (which a longer-timeout retest at
concurrency=2/timeout=45s confirmed are USABLE).

| # | URL | Notes for Phase 10.6.B |
|---|---|---|
| 1 | `/dashboard/payments/providers` | Likely a missing schema row or a permission-redirect masquerading as 500. Check `payment_providers` table seed + per-org config. |
| 2 | `/dashboard/payments/providers/new` | Same root cause as #1 (form page on the list page that 500s). |
| 3 | `/development-os/banking` | Likely missing `dev_bank_accounts` org-scoped fixture. Check service `loadBankAccounts(orgId)`. |
| 4 | `/development-os/banking/new` | Same root cause as #3. |
| 5 | `/development-os/marketing/connections` | Likely `marketing_connections` table not seeded for audit-bot org. |
| 6 | `/development-os/marketing/connections/new` | Same. |
| 7 | `/development-os/platform/branding` | Platform-admin surface. Suspect: org fetch fails for non-platform-admin role. Check `requirePlatformAdmin()` / similar. |
| 8 | `/development-os/platform/organizations` | Same — platform-admin gate. |
| 9 | `/development-os/settings/api-keys` | Stage 10.5.B added this surface; likely a runtime error on the loader (decrypt of zero rows? schema migration drift?). |
| 10 | `/development-os/settings/data-export` | Suspect: missing `data_exports` table OR missing role permission. |
| 11 | `/development-os/settings/google-workspace` | Suspect: missing `google_workspace_config` schema OR missing OAuth setup. |
| 12 | `/development-os/settings/webhooks` | Suspect: webhook list query fails on missing `outgoing_webhooks` table OR per-org config. |
| 13 | `/development-os/settings/whatsapp` | Suspect: WhatsApp config loader fails on missing per-org rows. |

### Reproduction recipe (operator-side)

For each URL:
1. Open in browser, capture the error message + stack trace from
   Vercel logs (`https://vercel.com/{org}/{project}/logs`).
2. Paste into the corresponding per-section file under "Bugs found".
3. AI-coder will diagnose root cause from codebase + propose fix in
   Phase 10.6.B.

### Operator-flagged P0s NOT in the 500 list

These pages scored USABLE in production (page loaded) but the
operator's manual click-through found broken behavior:

| Page | Operator quote | CHECKPOINT 1 finding |
|---|---|---|
| `/dashboard/maintenance-intelligence/plans` | "'Generate new tasks' SERVER ERROR" | Action exists, structurally well-formed; runtime error needs operator browser repro |
| `/dashboard/villa-guides/wifi` | "Delete BROKEN" | Delete affordance MISSING (not "broken") |
| `/dashboard/villas` | "Edit modal Cancel button BROKEN" | Cancel-as-`<Link>` doesn't close modal |
| `/dashboard/projects` | "Add navigates to /new (should be modal)" | Modal-First Add violation |
| `/dashboard/bookings` | "Existing bookings не editable" | Pending CHECKPOINT 2 inspection |
| `/dashboard/bookings/calendar` | "New booking → /new" | Pending CHECKPOINT 2 inspection |
| `/dashboard/bookings/sync` | "Sync modals не работают" | Pending CHECKPOINT 2 inspection |
| `/dashboard/bookings/rates` | "Rate plans edit/delete не работает (Enso Base Rate frozen)" | Pending CHECKPOINT 2 inspection |
| `/dashboard/channels` (likely under `integrations`) | "Cannot add new channel" | Pending CHECKPOINT 2 inspection |
| `/dashboard/guests` | "Guests not editable, just phone numbers" | Pending CHECKPOINT 2 inspection |
| `/dashboard/guest-stays/tokens` | "Cannot add token, Revoke works" | Pending CHECKPOINT 2 inspection |
| `/dashboard/guest-services/catalog` | "Edit works, Delete BROKEN" | Pending CHECKPOINT 2 inspection |
| `/dashboard/maintenance-intelligence/templates` | "Add works, Delete MISSING" | Pending CHECKPOINT 2 inspection |
| `/dashboard/maintenance-intelligence/risk-feed` | "Scan risks not working" | Pending CHECKPOINT 2 inspection |

---

## P1 — major UX / pattern violation (Phase 10.6.B-C)

### Modal-First Add invariant violated on ≥30 of 48 list pages
See [`_modal-first-scan.md`](_modal-first-scan.md). Single shared
helper + per-page application closes the entire class.

### Cancel-button-as-`<Link>` in modal forms
See `_modal-first-scan.md` § "Cancel-button-in-modal — separate
systemic risk". 10-15 forms estimated. Co-shipped with the Modal-First
helper.

### All 10 cabinets render empty in production
See [`_cabinets-visual-reaudit.md`](_cabinets-visual-reaudit.md).
Phase 10.6.B should seed production demo data so cabinets are
reviewable; Phase 10.6.C is the visual modernization pass.

### Owner cabinet not in the Mgmt OS sidebar
Operator's prior finding "cabinet dashboards direct-link only, not
in menu". `/dashboard/owner` was missing from `audit-urls.txt` —
itself a coverage gap. Fix: add menu entry.

---

## P2 — minor UX / pattern inconsistency (Phase 10.6.D-F)

### Per-cabinet visual fidelity vs reference screenshots
- `rounded-md` vs reference `rounded-3xl`
- 28pt KPI value vs reference 56pt+
- Neutral surface vs gradient cards
- No character imagery vs heavy character treatment
- Modest section gaps vs generous whitespace

This is **not** a Phase 10.6.B blocker; it's a 10.6.C deliverable.
Can be cabinet-by-cabinet.

---

## P3 — polish (Phase 10.6.F or beyond)

### Marketing-page hero typography vs reference
The homepage scored 🟢 Working; the only gap is hero treatment.
Worth doing before customer launch but not blocking.

### Audit-bot demo-data realism
Audit-bot org has zero application data. Even after Phase 10.6.B
seeds it, the realism + cross-references will need operator review.
