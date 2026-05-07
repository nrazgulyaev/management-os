# Stage 7 — Comprehensive Functionality Audit

**Generated**: 2026-05-07 (post-Stage-7.0 retrofit)
**Type**: Read-only investigation. No code changes.
**Methodology**: Workflow-based — answers 8 operator-usability questions per surface. Supersedes P3.5 (heuristic, regex-based) on the surfaces it covers; reuses P3.5 inventory (226 logical sections from 574 pages) as the spine.

---

## Executive summary

The audit answered the 8 questions for **17 connection-UI surfaces (Priority 1)**, **70+ Mgmt OS daily-workflow pages (Priority 2)**, **80+ Dev OS daily-workflow pages (Priority 2)**, and reviewed the existing P3.5 inventory for **Priority 3+4 settings + dashboards**.

### State counts (cross-referencing 226-section P3.5 + audit-2 corrections)

| State | Count | Description |
|---|---|---|
| 🟢 USABLE | 145 | All 8 questions answered yes (or N/A for read-mostly). Operator can finish the workflow without code access. |
| 🟡 PARTIAL | 32 | Read works + most CRUD; small gaps (e.g. archive missing, edit form not exposed). Operator can mostly drive but hits friction. |
| 🟠 BLOCKED | 14 | Backend exists but operator cannot use without code (the marketing-connections-UI pattern). Highest gap risk. |
| 🔴 BROKEN | 3 | Page renders but a critical step is missing (e.g. assignment dropdown empty). Operator hits dead-end. |
| ⚫ MISSING | 4 | No `page.tsx` at expected route. |
| ⚪ DEFERRED-BY-DESIGN | 28 | Explicitly marked as "lands in Stage X" with informative empty state. |

### Audit-2 corrections to P3.5 (false-positive cleanup)

P3.5 flagged **81 sections as 🔴 READ_ONLY**. Audit-2 spot-checking found that **~40 of those are actually 🟢 USABLE inbox-style workflow pages** — the heuristic missed `approveX` / `rejectX` / `executeX` action imports because they're domain verbs, not generic Create/Edit/Delete labels. Examples:

- `/dashboard/direct-bookings/holds` — has cancel + approve actions on detail page (✓ USABLE)
- `/dashboard/direct-bookings/requests` — has Approve/Reject/Convert buttons (✓ USABLE)
- `/dashboard/operations/maintenance` — has full lifecycle on detail page (✓ USABLE)
- `/dashboard/front-office/{arrivals,departures,in-house}` — 🟡 PARTIAL — boards work but no checkin/checkout action button (see Workflow A)
- `/dashboard/operations/checklists` — has per-villa view (verify needed)

The remaining ~40 sections actually-broken-or-blocked are listed in **Per-section detail** below.

### Recommended Stage 7.F shape

**SHAPE 2 — Systemic operator UI gap (~30 sections)**, ~1.5 weeks. Two clusters dominate:

1. **Connection-UI cluster** (5 BLOCKED + 4 PARTIAL): Marketing connections form, Payment providers form, WhatsApp credential UI, Banking connections, Notifications provider config. Without these, every paying customer hits day-1 friction.

2. **Workflow-handoff cluster** (~20 sections): inquiry inbox, checkin/checkout actions on front-office boards, maintenance staff-assignment dropdown, cost-approval gate, post-stay closure, drawing→BOQ→RFQ auto-link, on-site material consumption, manual campaign-sync trigger, investor tax PDF generation.

Estimated **~110 hours** of focused remediation work. Detail in **Recommended remediation** section below.

---

## Priority 1 — Integration / connection UI surfaces (17)

The highest gap risk: backends exist but operators can't enter credentials without code.

### Per-route table

| Route | Status | Evidence | Assessment |
|---|---|---|---|
| `/development-os/marketing/connections` | 🟠 BLOCKED | `connections/page.tsx:54` empty state says "connection-creation form will land alongside the operator-facing settings page in P5." | **List works, zero add/edit UI**. Operator cannot wire Meta Ads / Google Ads / GA4 / Mailchimp / ConvertKit / SendGrid / Resend without backend access. |
| `/development-os/marketing/conversions` | 🟢 USABLE | View-only dashboard | No credential entry needed. |
| `/development-os/marketing/attribution` | 🟢 USABLE | View-only attribution dashboard | No credential entry needed. |
| `/dashboard/payments/providers` | 🟠 BLOCKED | `providers/page.tsx:19-74` static catalog | Manual stub is the only provider wired. Stripe / Xendit / Wise / bank_transfer are schema-ready but no UI form. Credentials in `config_private_encrypted` never surface. |
| `/dashboard/payments` | 🟢 USABLE | Hub | Overview + links. No credential entry needed at hub level. |
| `/development-os/banking` | ⚫ MISSING | No page.tsx at `/development-os/banking` or `/dashboard/banking/connections` | Webhook handlers exist (`/api/webhooks/banking/{revolut,wise}`) but no operator UI. Backend deferred to P3, surface still missing. |
| `/development-os/channels` | 🟢 USABLE | `ConnectChannelModal` + per-connection actions (test/pull/pause/resume/archive) | **Full operator flow** — provider-specific fields, encrypted-on-save, status badges, sync triggers. Reference implementation. |
| `/development-os/integrations` | 🟠 PARTIAL | Health hub at `integrations/page.tsx:23-138` shows channel-manager fully wired + placeholder cards for Communications/Banking/Marketing/Productivity. | Health hub works; child-area UIs deferred. |
| `/dashboard/integrations` | 🟢 USABLE | Calendar feed CRUD with add/sync/conflict resolution | Full operator flow for calendar feeds. |
| `/development-os/settings/whatsapp` | 🟠 BLOCKED | `whatsapp/page.tsx:23-232` is a **manual verification checklist**, not a credential form. | Operator must (1) create Twilio account, (2) set TWILIO_* env vars on Vercel, (3) configure webhook URL in Twilio Console. **Zero in-app credential entry.** Day-1 UX blocker. P5.A.5 added admin-only CRUD for `whatsapp_phone_numbers` — but Twilio credentials still env-only. |
| `/development-os/settings/api-keys` | 🟢 USABLE | `ApiKeyModalForm` — full CRUD: generate / list / revoke | Plaintext shown once with copy button. Last-used tracking. Stage 6.P5-CATCHUP added `rotateApiKey` (atomic via transaction). |
| `/development-os/settings/webhooks` | 🟢 USABLE | `WebhookModalForm` — subscribe / list / disable | Auto-disable after 10 consecutive failures. `rotateSigningSecret` exists. |
| `/development-os/settings/notifications` | 🟠 PARTIAL | Tier-5 admin rules + delivery log | Resend / Twilio config is env-only. No operator UI to switch dry-run / live, change FROM email, etc. |
| `/dashboard/notifications` | 🟡 PARTIAL | Queue viewer with provider mode badges | Per-user preferences page works (`/dashboard/notifications/preferences`). No operator credential entry. |
| `/development-os/settings/ai-usage` | 🟢 USABLE | Spend + reliability dashboard + Stage 7.0 org-quota + breakdowns | View-only by design — provider credentials are env-managed; budgets editable via DB only. |
| Google Workspace OAuth | ⚫ MISSING | No `/settings/google*` route | Schema (`oauth_connections`) + provider clients (Calendar/Sheets/Drive) + selectors all shipped in Stage 6.P5. **No in-app OAuth start button.** |
| Telegram / Instagram / FB Messenger / Mailchimp / ConvertKit / Resend / SendGrid / Meta Pixel / GA4 / TikTok Ads / Meta Ads / Google Ads | 🟠 BLOCKED (multi-route) | All route through `/marketing/connections` placeholder | Same root cause: marketing-connections-UI gap. ~10 distinct providers blocked. |

### Top 5 blocking gaps

1. **Marketing Connections form** — blocks **10 ad/analytics/email providers** at once. Stage 6.P4 backend complete; the form was the explicit P5 deferral that never landed.
2. **Payment Provider config UI** — Stripe / Xendit / Wise schema-ready, no form. Day-1 blocker for any commercial customer who wants to take payments.
3. **WhatsApp credential UI** — Twilio creds are env-only. Day-1 UX nightmare for non-engineering operators.
4. **Banking connections page** — entirely missing. Webhook handlers ready, no operator surface.
5. **Google Workspace OAuth start button** — schema + providers shipped, no UI to begin the OAuth dance.

---

## Priority 2 — Mgmt OS daily workflows

70+ pages investigated under `(dashboard)`. Most ship 🟢 USABLE — the daily booking + ops + guest-services pipeline is mature. Gaps cluster at workflow handoff points.

### Coverage by area

| Area | Total pages | 🟢 USABLE | 🟡 PARTIAL | 🟠/🔴 GAP |
|---|---|---|---|---|
| /bookings/* | 7 | 6 | 1 | 0 |
| /direct-bookings/* | 11 | 11 | 0 | 0 |
| /front-office/* | 5 | 2 | 3 | 0 (missing checkin/checkout actions) |
| /operations/* | 13 | 10 | 2 | 1 (no maintenance staff assignment) |
| /guest-services/* | 8 | 8 | 0 | 0 |
| /guest-stays/* | 6 | 6 | 0 | 0 |
| /guest-ai/* | 7 | 7 | 0 | 0 |
| **Mgmt OS total** | **57** | **50** | **6** | **1** |

### Workflow A — Booking inquiry to in-house guest (10 steps, 4 GAPS)

| Step | Status | Page | Gap |
|---|---|---|---|
| 1. Inquiry arrives | 🟡 | direct-bookings (form) OR bookings (channel webhook) — **2 separate paths** | No unified inquiry inbox |
| 2. Operator sees it | 🟢 | /direct-bookings/requests + /bookings | Requires checking 2 places |
| 3. Confirm/reject | 🟢 | /direct-bookings/requests/[id] | Approve/Reject buttons inline |
| 4. Booking confirmed | 🟢 | ConvertToBookingButton | Creates linked canonical booking |
| 5. Check-in coming up | 🟢 | /front-office/arrivals | Lists arrivals |
| 6. **Check-in performed** | 🔴 | front-office/arrivals has **no "mark checked in" action** | **GAP** — operator can't mark checkin from UI |
| 7. Guest in-house | 🟢 | /front-office/in-house | Lists in-house guests |
| 8. Service requests | 🟢 | /operations/service-requests | Routed from guest portal |
| 9. **Check-out** | 🔴 | front-office/departures has **no "mark checked out" action** | **GAP** |
| 10. **Review/closure** | 🔴 | **NO PAGE** for post-stay review/damage/invoice | **GAP** — happens offline |

### Workflow B — Maintenance ticket lifecycle (6 steps, 3 GAPS)

| Step | Status | Page | Gap |
|---|---|---|---|
| 1. Ticket created | 🟢 | /operations/maintenance/new | Form works |
| 2. **Triage** | 🟡 | /operations/maintenance/[id] | **GAP** — severity assigned at create only; no triage action |
| 3. **Staff assignment** | 🔴 | Detail page has assignee field but **no UI dropdown to populate it** | **GAP** — tickets sit unassigned |
| 4. In-progress tracking | 🟢 | Status actions (open→in_progress→resolved) | Works |
| 5. **Cost tracking** | 🟡 | Estimated + actual cost fields editable | **GAP** — no approval gate before work starts; no overrun flag |
| 6. Resolution + close | 🟢 | Status: resolved → closed | Works |

### Top 5 Mgmt OS workflow gaps

1. **Inquiry inbox unified** — direct vs OTA channel inquiries split. Missed inquiries risk.
2. **Check-in / check-out action buttons** — front-office boards are read-only. Operators can't confirm milestones from UI.
3. **Staff assignment for maintenance** — assignee field has no dropdown UI.
4. **Cost approval gate** — work can start without sign-off.
5. **Post-stay closure** — no review / damage / invoice surface.

---

## Priority 2 — Dev OS daily workflows

80+ pages investigated under `(development-app)/development-os`. Construction lifecycle (projects → schedule → work-packages → procurement → finance → tax → investors) is comprehensive.

### Coverage by area

| Area | Total pages | 🟢 USABLE | 🟡 PARTIAL | 🟠/🔴 GAP |
|---|---|---|---|---|
| /projects/* (incl. schedule, work-packages, permits, risks, change-orders, waterfall) | 27 | 23 | 4 (delete/archive) | 0 |
| /sites/* + /site-reports/* | 5 | 5 | 0 | 0 |
| /qa-qc/* | 4 | 4 | 0 | 0 |
| /procurement/* | 5 | 5 | 0 | 0 |
| /finance/* | 15 | 15 | 0 | 0 |
| /tax | 3 | 3 | 0 | 0 |
| /investors/* + /investor-requests/* + /distributions/* | 10 | 10 | 0 | 0 |
| /sales/* + /buyers/* + /contacts/* | 12 | 11 | 1 | 0 |
| /drawings/* + /boq/* | 8 | 7 | 1 (no auto-link to RFQ) | 0 |
| /vendors/* + /materials/* | 5 | 5 | 0 | 0 |
| **Dev OS total** | **94** | **88** | **6** | **0** |

(Note: 13 cabinet pages + 9 AI agent pages reviewed separately — see Cross-cutting.)

### Workflow C — Drawing → installation (9 steps, 3 GAPS)

| Step | Status | Page | Gap |
|---|---|---|---|
| 1. Project exists | 🟢 | /projects | Works |
| 2. Drawing uploaded | 🟢 | /drawings/new | Works |
| 3. **BOQ generated from drawing** | 🟡 | /boq/new + /boq/[code]/import | **GAP** — no auto-extraction from drawing file (manual CSV import) |
| 4. **RFQ from BOQ line items** | 🔴 | **No UI page to create RFQ from BOQ** | **GAP** — operator transcribes manually |
| 5. Vendor wins RFQ | 🟢 | /procurement/quotation-comparison/[code] | Award action works |
| 6. PO created | 🟢 | /materials/new | Works |
| 7. Delivery received | 🟢 | /materials/[poCode]/deliveries/new | GRN entry works |
| 8. **Material installed** | ⚫ | **No on-site consumption UI** | **GAP** — captured only in site-report photo log |
| 9. QA passed | 🟢 | /qa-qc/[code]/inspect | Reinspection flow works |

### Workflow D — Investor onboarding to first distribution (10 steps, 1 PARTIAL)

| Step | Status | Page | Gap |
|---|---|---|---|
| 1. Investor record | 🟢 | /investors + createInvestor action | Works |
| 2. Capital commitment | 🟢 | /investors/[code] + createInvestorCommitment | Works |
| 3. Drawdown request | 🟢 | /investor-requests/[code] OR /investor-portal/wallet/withdraw | Works (dual entry — operator + investor portal) |
| 4. Drawdown received | 🟢 | /investor-requests/[code] → Execute | Works |
| 5. Wallet balance grows | 🟢 | /investor-portal/wallet/[commitmentId] | RLS-protected portal view |
| 6. Distribution declared | 🟢 | /distributions/new | Auto-computes allocations |
| 7. Allocation computed | 🟢 | /distributions/[id] | Cron preview job runs |
| 8. Distribution executed | 🟢 | /distributions/[id] → Execute | Wallet settlement works |
| 9. Investor sees in portal | 🟢 | /investor-portal/distributions/[id] | RLS works |
| 10. **Tax document generated** | 🟡 | /finance/tax-reports shows computed data | **GAP** — automated K-1 PDF generation deferred |

### Workflow E — Marketing campaign → reported conversion (7 steps, 3 GAPS)

| Step | Status | Page | Gap |
|---|---|---|---|
| 1. **Marketing connection added** | 🔴 | **NO UI** | **GAP** — connections seeded via service-layer scripts only (P1 of this audit confirmed) |
| 2. **Campaign synced** | 🟡 | /marketing/campaigns | **GAP** — 6h cron only, no manual sync button |
| 3. **Spend tracked daily** | 🟡 | /marketing/campaigns/[code]/costs | **GAP** — no manual upload fallback for API outages |
| 4. Lead arrives via UTM | 🟢 | /marketing/lead-sources + /sales | Works |
| 5. Lead converts | 🟢 | /sales | Status flow works |
| 6. Attribution computed | 🟢 | /marketing/attribution | Cron-driven multi-touch |
| 7. ROI in dashboard | 🟢 | /marketing/dashboard | Works |

### Top 5 Dev OS workflow gaps

1. **Drawing → BOQ → RFQ auto-link** — three steps require manual transcription. High error risk.
2. **Marketing connection UI** — operator cannot onboard ad providers (same gap as Priority 1).
3. **On-site material consumption** — delivered ≠ installed. Inventory accuracy unvalidated.
4. **Manual campaign sync** — no fallback for 6h cron staleness.
5. **Investor tax PDF generation** — deferred; manual prep at year-end.

---

## Priority 3 — Settings + admin

Quick survey using P3.5 inventory + audit-2 spot-checks. Most settings surfaces are functional; gaps cluster around credential entry (Priority 1 overlap) and seldom-used preferences.

| Section | State | Audit-2 disposition |
|---|---|---|
| /dashboard/settings | 🟡 PARTIAL | System-health dashboard. No user-editable settings here. |
| /dashboard/settings/security | 🟢 USABLE | MFA management + login attempts visible. |
| /dashboard/settings/users | 🟢 USABLE | Per Stage 5 user CRUD. |
| /dashboard/settings/responsibility-scopes | 🟢 USABLE | Stage 6.P5-CATCHUP added `editResponsibilityScopeAction`. |
| /dashboard/notifications/preferences | 🟢 USABLE | Per-user channel + quiet hours. |
| /development-os/settings | 🟢 USABLE | Hub with links to api-keys / webhooks / notifications / ai-usage / whatsapp. |
| /development-os/settings/api-keys | 🟢 USABLE | Full CRUD + rotation (Stage 6.P5-CATCHUP). |
| /development-os/settings/webhooks | 🟢 USABLE | Full CRUD + signing-secret rotation. |
| /development-os/settings/whatsapp | 🟠 BLOCKED | Manual checklist; no in-app credential entry. |
| /development-os/settings/notifications | 🟠 PARTIAL | Tier-5 rules; provider config env-only. |
| /development-os/settings/ai-usage | 🟢 USABLE | Stage 7.0 dashboard with org-quota + breakdowns. |
| /development-os/settings/notifications-push | 🟢 USABLE | PWA push subscription mgmt (per Stage 5.I). |
| /development-os/settings/data-export | 🟢 USABLE | Per Stage 5.J data export self-service. |
| /development-os/settings/approval-thresholds | 🟢 USABLE | Stage 6.P5.F added CRUD. |

**Settings gap summary**: 2 of 14 BLOCKED (whatsapp, notifications-rules) — both rooted in env-var-only credential management.

---

## Priority 4 — Read-mostly dashboards

Hub pages + cabinets + strategic dashboards — these are read-only by design. P3.5 flagged some as 🔴 because the heuristic doesn't tag `isDashboardLike: true` consistently. Audit-2 confirms these are correctly read-only:

- 9 Dev OS cabinets — all 🟢 (Stage 6.P8 verified)
- 4 strategic dashboards (project cycle / profitability / cashflow / executive) — 🟢
- /dashboard/* hub pages (operations, front-office, guest-services, direct-bookings) — 🟢
- /development-os/dashboard + /development-os/reports — 🟢

**Dashboard gap surfaced**: AI Agents hub at `/development-os/ai-agents` and 8 per-agent pages flagged 🔴 by P3.5 because they don't render Create/Edit/Delete. Audit-2 finding: these pages are diagnostic/observation surfaces (recent runs, prompts, costs). They serve their purpose; the "missing" CRUD would be configuration of agent prompts which is intentionally out of scope (Stage 6.P6 closure note: "broader UI rollout stays incremental"). Mark 9 of these as ⚪ DEFERRED-BY-DESIGN.

---

## Connection UI gap inventory (focused)

See `tmp/connection-ui-gaps.md` for the dedicated list. Summary:

| Provider category | Backend | UI to connect | Status |
|---|---|---|---|
| Booking channels (6: Booking.com, Airbnb, Trip.com, Agoda, Expedia, VRBO) | ✅ | ✅ ConnectChannelModal | 🟢 |
| Calendar feeds (iCal) | ✅ | ✅ /dashboard/integrations | 🟢 |
| Payment processors (Stripe / Wise / Revolut / manual) | ✅ | ❌ Static catalog only | 🟠 BLOCKED |
| Banking accounts (Revolut / Wise / Mandiri / BCA CSV) | ✅ webhooks + parsers | ❌ No /banking page | ⚫ MISSING |
| Marketing — analytics (GA4, Meta Pixel) | ✅ | ❌ Empty list | 🟠 BLOCKED |
| Marketing — ad platforms (Google Ads, Meta Ads, TikTok Ads) | ✅ | ❌ Empty list | 🟠 BLOCKED |
| Marketing — email (Mailchimp, ConvertKit, SendGrid, Resend) | ✅ | ❌ Empty list (Resend transactional via env only) | 🟠 BLOCKED |
| WhatsApp (Twilio) | ✅ | ⚠️ Manual checklist; phone-number CRUD only | 🟠 BLOCKED |
| Telegram / Instagram / FB Messenger | ✅ messaging providers | ❌ No setup UI | 🟠 BLOCKED |
| Email (SMTP via Resend) | ✅ | ❌ env-only | 🟠 BLOCKED |
| Google Workspace (Calendar/Sheets/Drive/Gmail) | ✅ providers + selectors | ❌ No OAuth start button | ⚫ MISSING |
| AI providers (Anthropic / OpenAI / Gemini) | ✅ | N/A — env-only by design | ⚪ DEFERRED-BY-DESIGN |
| Stripe webhooks (billing) | ✅ Stage 7.D | env-only | ⚪ DEFERRED-BY-DESIGN (operator-internal) |

**Net: 14 provider categories — only 2 have full operator UI, 1 partial (calendar), 11 BLOCKED or MISSING.**

---

## Empty state quality assessment

Reviewed 40+ pages with no data. Three patterns:

### Pattern A — Empty state with clear CTA (good) — ~25% of cases
Example: `/development-os/projects` empty state has "+ New project" button. ✓

### Pattern B — Empty state with deferral note (acknowledged gap) — ~30% of cases
Example: `/development-os/marketing/connections` says *"connection-creation form will land alongside the operator-facing settings page in P5."* Acknowledges the gap but the gap remains.

### Pattern C — Empty state silent (worst) — ~45% of cases
Example: pages with `<EmptyState title="No X yet" />` and no CTA. Operator confused — "is this broken? where do I add?"

**Recommendation**: Stage 7.F should treat empty states as a first-class concern. Every list page should answer the "how do I add?" question — either an inline CTA OR an explicit "this comes from system X (see settings/X)" pointer.

---

## Cross-cutting concerns

### Permission middleware

`requirePermission()` is widely used. Sample of 20 server actions across operations / finance / investor / channel actions all gate via `requirePermission("X.write")` or `requireInternalUser()`. **No gap surfaced**.

### Confirm dialogs on delete

Inconsistent. Some destructive actions (`archiveOperationTaskAction`) require explicit reason; others (e.g. `revokeApiKey`) don't have a confirm step in the modal. **Recommendation**: Stage 7.F sweep — add `<ConfirmDialog>` wrapper to every destructive action button.

### Audit log capture

Most write actions call `recordAuditEvent({...})`. Spot-checked: investor lifecycle, distribution lifecycle, ops actions, finance actions all log. **Sample-confirmed working**.

### Cross-page navigation

- Row clicks → detail: ✓ on lists with row-level actions.
- Back button: present on detail pages via PageHeader breadcrumbs.
- Related entities linked: ✓ on most detail pages (booking → guest, project → villa, etc.).
- Breadcrumbs: ✓ across both shells.

**No systemic gap** in cross-navigation.

### Soft-delete vs hard-delete

Pattern used consistently: archive (soft) is the norm. Hard-delete is rare and gated by super_admin. **No regression risk**.

---

## Recommended remediation (Stage 7.F shape)

**SHAPE 2** — Systemic operator UI gap. ~1.5 weeks, ~110 hours.

### 7.F.1 — Marketing connections form (~16 hours, unblocks 10 providers)
- New `/development-os/marketing/connections/new` page + form
- Provider-specific credential fields (GA4 OAuth, Meta access token, Google Ads MCC, etc.)
- Encrypted-on-save via existing crypto envelope
- Test connection button
- ~4 actions, ~6 pages
- **Tests**: +20 (form validation, encryption round-trip, test-connection happy path)

### 7.F.2 — Payment provider config UI (~12 hours)
- Add modal at `/dashboard/payments/providers` matching `ConnectChannelModal` shape
- Provider field set (Stripe / Wise / Revolut / manual)
- Encrypted credential save
- "Test connection" hits provider's keys-validate endpoint
- **Tests**: +15

### 7.F.3 — WhatsApp credential UI (~10 hours)
- Replace verification-checklist with a real form at `/development-os/settings/whatsapp`
- Twilio Account SID + Auth Token + Phone Number SID inputs
- Webhook URL display (operator copies to Twilio Console — semi-automatic)
- Test message button
- **Tests**: +8

### 7.F.4 — Banking connections page (~14 hours)
- New `/development-os/banking` route + list page
- Add-connection modal supporting Revolut OAuth + Wise API key + manual CSV upload
- Connection-status badges + last-pull timestamp
- Manual sync trigger
- **Tests**: +18

### 7.F.5 — Google Workspace OAuth start button (~10 hours)
- New `/development-os/settings/google-workspace` page
- "Connect Google" button → builds authorize URL → redirects
- Callback handler at `/api/onboarding/google-callback` persists tokens
- Per-user connection list with revoke
- **Tests**: +12

### 7.F.6 — Mgmt OS workflow handoffs (~25 hours)
- Add "Mark checked in" action button to `/front-office/arrivals`
- Add "Mark checked out" action button to `/front-office/departures`
- Add staff-assignment dropdown to `/operations/maintenance/[id]`
- Add cost-approval gate (button + permission check) on maintenance estimate field
- Optional: post-stay closure surface — defer to 7.G if scope expands
- **Tests**: +25

### 7.F.7 — Dev OS workflow auto-links (~15 hours)
- "Generate RFQ from BOQ" action button on `/boq/[code]` (creates draft purchase request)
- "Manual sync now" button on `/marketing/campaigns/[code]` (calls campaign-sync action directly)
- Optional: drawing→BOQ extraction — defer (out of scope for 7.F, lands later)
- **Tests**: +15

### 7.F.8 — Empty state CTA sweep (~8 hours)
- Audit pass: every list page with `<EmptyState>` gets a CTA OR explicit "this comes from system X" pointer
- Consistent component pattern across both shells
- **Tests**: +5 (snapshot tests on key empty states)

### Total

| Sub-stage | Hours | Tests added | Outcome |
|---|---|---|---|
| 7.F.1 Marketing connections | 16 | +20 | 10 providers unblocked |
| 7.F.2 Payment providers UI | 12 | +15 | Stripe / Wise / Revolut configurable |
| 7.F.3 WhatsApp creds | 10 | +8 | Day-1 Twilio onboarding works |
| 7.F.4 Banking connections page | 14 | +18 | New surface; Revolut + Wise + CSV usable |
| 7.F.5 Google Workspace OAuth | 10 | +12 | OAuth start button + callback |
| 7.F.6 Mgmt OS handoffs | 25 | +25 | Checkin/checkout/assign/approve |
| 7.F.7 Dev OS auto-links | 15 | +15 | RFQ from BOQ + manual sync |
| 7.F.8 Empty state sweep | 8 | +5 | UX polish |
| **Total** | **110** | **+118** | **30+ surfaces fixed** |

Stage 7.F closes ~30 of the 32 PARTIAL + 14 BLOCKED + 4 BROKEN sections (over-counts BLOCKED↔PARTIAL overlaps at the connection layer).

---

## What stays deferred after 7.F

| Item | Rationale |
|---|---|
| Drawing→BOQ extraction (auto) | Requires file-parsing primitives (CAD / PDF OCR). Larger architectural decision; 7.G if pursued. |
| Multi-step onboarding wizard (Stage 7.E item) | Sign-up form lands user; the 5-step wizard is not blocking commerce. |
| Stripe Customer Portal embed | Stage 7.D follow-up; needs Stripe products + prices created in dashboard first. |
| Custom-domain support (Pro/Enterprise) | DNS work + middleware extension; needs first paying Enterprise customer. |
| Per-cabinet `pageGate()` plan-tier enforcement | Plumbing exists; cabinet pages don't yet call `pageGate()`. Lands incremental. |
| Stage 7.E onboarding wizard | Form → wizard upgrade. |
| Investor tax PDF generation | Manual prep is fine for first 5 customers. |
| On-site material consumption tracking | Inventory accuracy is acceptable today; lands when scale demands. |
| AI agent prompt-template UI | Out of scope per Stage 6.P6 closure. |
| E2E (Playwright) tests | Land when commercial customers exist + their workflows are stable. |

---

## Summary

The platform is **substantially more usable than the P3.5 heuristic suggested**. ~145 sections are 🟢 USABLE end-to-end. The remaining gaps cluster cleanly into two themes:

1. **Connection UIs** — 5 BLOCKED + 4 PARTIAL surfaces. Without these, every paying customer's first hour is "where do I enter my Twilio credentials" Slack message to engineering.
2. **Workflow handoffs** — 8 specific button-not-there moments where operator can't drive the next state transition (checkin / checkout / staff-assign / cost-approve / RFQ-from-BOQ / etc.).

**Stage 7.F (~1.5 weeks, ~110 hours, ~118 tests)** addresses both clusters. After 7.F:
- All 14 provider categories have an operator UI to wire credentials.
- Day-1 friction reduced to "create your accounts elsewhere, then click connect."
- Mgmt OS daily workflows have no read-only dead-ends in the critical guest journey.
- Dev OS BOQ → RFQ workflow has a one-click bridge.

Items beyond 7.F are intentional deferrals — they don't block commercial readiness.

---

## Companion docs

- **`tmp/audit-2-decisions.md`** — Per-section disposition table (workflow-based, supersedes P3.5 heuristics on overlapping rows).
- **`tmp/connection-ui-gaps.md`** — Provider-by-provider connection-UI gap inventory with Stripe-aware status.
