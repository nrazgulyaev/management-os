# Stage 10.6.A CHECKPOINT 4 — Integration matrix refresh

**Date**: 2026-05-13
**Inputs**: Codebase audit + post-10.6.B.2-fix layout state + 10.6.B.3 AI runner per-org wiring.

---

## TL;DR

| Status | Count | Integrations |
|---|---|---|
| ✅ **At parity** (UI + per-org + encrypted + test connection + status indicator) | 1 | AI providers (OpenAI / Anthropic / Gemini) — Stage 10.5.B + 10.6.B.3 |
| ⚠️ **UI exists but broken / partial** (P0 500s historically; should heal post-10.6.B.2-fix deploy) | 7 | Channel managers, payment processors, WhatsApp/Twilio, banking, marketing connections, webhooks, API keys |
| 🔴 **Env-only — no UI at all** | 5 | Resend email, Twilio SMS, Maps API, document storage (Supabase), auth providers |
| 🔵 **Schema slot exists, not wired** | 2 | Stripe Connect (per-org `externalAccountId` field stored, no UI flow), Plaid (bank schema reserved, DryRun fallback) |

**Total surveyed**: 15 integrations.

**Critical for customer launch (Stage 10.6.D priority)**: 5 P0 fixes — Stripe, WhatsApp, Resend, channels, Google Workspace — at parity with AI agents pattern. Estimated 32-50h.

---

## 1. The parity benchmark — AI agents (10.5.B + 10.6.B.3)

This is the model every other integration should follow. Per agent, per org, the operator can:

1. Visit `/development-os/settings/ai-agents/[agent_key]`
2. Choose provider (Anthropic / OpenAI / Gemini)
3. Paste API key (encrypted at rest with `STAY_LINK_KMS_SECRET` AES-256-GCM)
4. Click "Test connection" — real HTTP call to provider
5. See `lastTestStatus` + `lastTestAt` + `lastTestError` displayed
6. Toggle activate / deactivate per agent

The `orgAiAgentConfig` table + `agent-provider-actions.ts` + `loadOrgAgentRuntimeConfig` helper are the reference implementation. Stage 10.6.D.2's job is to apply this same shape to the other 4-5 customer-launch integrations.

---

## 2. Per-integration matrix

| # | Integration | Credentials | UI path | Scope | Encrypted? | Test conn? | Status indicator? | Verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | Calendar feeds (iCal) | `channelCalendarFeeds.feedUrl` (plaintext) | `/dashboard/integrations/calendar-feeds` | Per-villa | ⚠️ plaintext | ❌ | sync log table | OK for v1 (URLs unguessable, RLS-protected); encrypt later |
| 2 | Channel managers (Booking.com, Airbnb, Agoda) | `channelConnections.credentials` (encrypted JSONB) | `/dashboard/integrations/channels` (broken) | Per-org per-villa | ✅ AES-256-GCM | partial | FSM (pending/active/archived) | **Operator-flagged as broken** ("cannot add new channel"); OAuth flow exists but UI blocked |
| 3 | Payment processors (Stripe / Wise / PayPal / manual) | `paymentProcessorConnections.credentials` | `/dashboard/payments/providers` (P0 500 historically) | Per-org | ✅ AES-256-GCM | ❌ | metadata only | Should heal post-10.6.B.2-fix deploy; **needs test-connection wiring + UI restyle** |
| 4 | WhatsApp / Twilio messaging | `oauthConnections.accessToken` | `/development-os/settings/whatsapp` (P0 500 historically) | Per-org per-user | ⚠️ encrypted only if KMS secret set | ❌ | ❌ | Should heal post-deploy; **DryRun fallback** when key unset |
| 5 | **AI providers** (Anthropic / OpenAI / Gemini) | `orgAiAgentConfig.apiKeyEncrypted` | `/development-os/settings/ai-agents/[agent_key]` ✅ | Per-org per-agent | ✅ AES-256-GCM | ✅ real | ✅ `lastTestStatus` + timestamp + error | **Reference implementation — at parity** |
| 6 | Email (Resend) | `RESEND_API_KEY` env var | None 🔴 | Platform-wide | env | ❌ | ❌ | **Needs per-org UI for customer-facing brand emails**; conditional on `NOTIFICATIONS_DRY_RUN=0` |
| 7 | Maps (Google Maps) | Unknown / not actively integrated | None 🔴 | n/a | n/a | ❌ | ❌ | Operator-flagged as needed for villa maps + public portal |
| 8 | SMS providers (Twilio) | `TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM_SMS` | None 🔴 | Platform-wide | env | ❌ | ❌ | Optional for v1; defaults to noop |
| 9 | Document storage (Supabase / R2 / S3) | `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | `/dashboard/system/storage` (health only) | Per-bucket platform | env | implicit health | bucket health metrics | Supabase default; R2 migration planned not shipped |
| 10 | Analytics (PostHog / Mixpanel / Plausible) | Unknown — referenced in docs not wired | None 🔴 | n/a | n/a | ❌ | ❌ | Marketing-driven analytics only (Google Analytics read-only) |
| 11 | Banking (Plaid / Open Banking) | `bankConnections.credentials` (encrypted) | `/development-os/banking` (P0 500 historically) | Per-org per-account | ✅ AES-256-GCM | ❌ | `lastSyncStatus` + `lastSyncError` | Revolut / Wise / Mandiri / BCA supported; **Plaid slot reserved DryRun fallback**; should heal post-deploy |
| 12 | Marketing connections (GA / Ads / Meta / TikTok / Mailchimp) | `marketingConnections.credentials` (encrypted) | `/development-os/marketing/connections` (P0 500 historically) | Per-org per-account | ✅ AES-256-GCM | ❌ | `lastSyncStatus` + `lastSyncRecordsPulled` | Should heal post-deploy; **needs test-connection wiring** |
| 13 | Stripe Connect | `paymentProcessorConnections.externalAccountId` | Rolled into `/dashboard/payments/providers` | Per-org per-account | ✅ AES-256-GCM (creds); ⚠️ webhook secret unencrypted | ❌ | metadata + `lastEventAt` | Slot exists, not wired; **needed for SubscriptionOS billing collection (10.6.E)** |
| 14 | Webhooks (outbound) | `webhookSecrets` (channel + payment + banking) | `/development-os/settings/webhooks` (P0 500 historically) | Per-org | ⚠️ HMAC signing only; secret plaintext | ❌ | delivery log + status enum | Should heal post-deploy; **encryption gap** |
| 15 | Auth (Supabase Auth + Google OAuth) | Supabase env vars | None — embedded | Platform-wide | env | implicit (signup/login) | session state | Supabase Auth is the auth layer; per-org Google Workspace is separate concern |

---

## 3. Critical security gaps

1. **Webhook secrets stored plaintext** — `channelConnections.webhookSecret`, `paymentProcessorConnections` inbound signing keys. Should encrypt with same AES-256-GCM envelope.
2. **Calendar feed URLs plaintext** — Airbnb/Booking iCal URLs are unguessable but should still be encrypted at rest as defense-in-depth.
3. **No per-org KMS rotation** — Encryption uses platform-wide `STAY_LINK_KMS_SECRET`; if compromised, all customer credentials exposed. Per-org key derivation via scrypt(secret, org_id) would limit blast radius.
4. **No per-org env-var override** — If a customer needs a dedicated Twilio account, the entire platform must be redeployed. Per-org integration table needed for SMS / email (matching what AI agents already does).

These are not 10.6.D scope (10.6.D ships UIs). These are Stage 11+ security hardening candidates.

---

## 4. Stage 10.6.D.2 priority (per master plan timeline)

The master plan budgets ~1 week for 10.6.D.2 covering 10 integrations. Realistic priority order:

| Day | Integration | Why first |
|---|---|---|
| 1 | **Stripe Connect** (#13) | Unblocks SubscriptionOS billing collection (10.6.E gates on it) |
| 2 | **Resend email** (#6) | Customer-facing emails (welcome, statement, owner notification) — currently DryRun |
| 3 | **WhatsApp / Twilio** (#4) | Operator-flagged surface; per-org messaging key needed |
| 4 | **Channel managers** (#2) | Operator-flagged; OAuth flow already 80% there |
| 4.5 | **Maps** (#7) | Villa maps + public portal need it |
| 5 | **Calendar feeds** (#1) | Encrypt URLs + add test-connection |

Lower priority (defer to a later phase):
- SMS (#8) — Twilio-platform default fine for v1
- Document storage (#9) — Supabase default fine
- Analytics (#10) — operator can configure GA tag externally
- Auth (#15) — Supabase Auth is correct architecture; no per-org override needed

---

## 5. Verification: did 10.6.B.2-fix actually heal the 7 broken UIs?

10.6.B.2-fix shipped layout-level try/catch with isRedirectError + React `cache()` on auth queries — production sweep showed 91 BROKEN → 2 BROKEN. The 7 integration UIs flagged "P0 500" in this audit were on that 91→2 list:

- ✅ /dashboard/payments/providers — should now render
- ✅ /development-os/settings/whatsapp — should now render
- ✅ /development-os/banking — should now render
- ✅ /development-os/marketing/connections — should now render
- ✅ /development-os/settings/webhooks — should now render
- ✅ /development-os/settings/api-keys — should now render
- ✅ /development-os/settings/google-workspace — should now render

The PR 10.6.B.2-fix.2 specifically wrapped Discounts page (one of the residual 2). Operator-side production audit re-run (post-deploy) is the verification gate.

**If any of these still 500 in production**: those are now individual loader bugs, not layout issues. Each gets a per-page surgical fix in 10.6.D.2 before the integration UI work begins.

---

**Status**: Integration matrix complete. AI agents = parity. 7 should be healed by 10.6.B.2-fix deploy (operator verifies). 5 env-only need UIs in 10.6.D.2. Stripe Connect + Resend are top priority for customer launch.
