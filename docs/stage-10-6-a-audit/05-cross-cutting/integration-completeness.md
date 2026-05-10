# 05 — Cross-cutting / Integration completeness matrix

**Question**: For each external service the platform integrates with,
is there a per-org configuration UI that lets an operator add their
own credentials?

**Stage 10.5.B set the bar**: per-agent provider/key UI + encrypted
storage + test-connection. Other integrations should match.

---

## Matrix

Legend: ✅ shipped · ⚠️ partial / no UI · 🔴 absent · 🟡 multi-tenant
ready (env-based, not per-org)

| # | Integration | Per-org config UI | Encrypted storage | Test connection | Status indicator | Multi-provider |
|---|---|---|---|---|---|---|
| 1 | Calendar feeds (iCal: Booking.com, Airbnb, Vrbo) | ✅ `/dashboard/integrations/calendar-feeds` | n/a (URL only) | ⚠️ none surfaced | ⚠️ sync-status table only | n/a (open standard) |
| 2 | Payment providers (Stripe) | ⚠️ `/dashboard/payments/providers` 🔴 P0 500 | env-only today | ⚠️ N/A | n/a | 🔴 Stripe only |
| 3 | WhatsApp (Twilio / Meta) | ⚠️ `/development-os/settings/whatsapp` 🔴 P0 500 | partial (encrypted via STAY_LINK_KMS_SECRET when set) | 🔴 absent | 🔴 absent | 🟡 provider abstraction exists |
| 4 | AI agents (Anthropic / OpenAI / Gemini) | ✅ Stage 10.5.B `/development-os/settings/ai-agents/[agent_key]` | ✅ AES-256-GCM | ✅ shipped | ✅ last_test_status / last_test_at / last_test_error | ✅ 3 providers, per-agent |
| 5 | Email (Resend) | 🔴 absent (env-only) | n/a | 🔴 absent | 🔴 absent | 🔴 Resend only |
| 6 | Maps (Google Maps / Mapbox) | 🔴 absent (env-only or unused) | n/a | 🔴 absent | 🔴 absent | 🔴 unknown |
| 7 | Channel managers (Booking.com / Airbnb / Vrbo OAuth) | ⚠️ `/dashboard/integrations/channels` (operator: "cannot add new channel") | ✅ AES-256-GCM via Stage 6.P1.B | ⚠️ varies | ⚠️ partial | 🟡 provider abstraction exists |
| 8 | SMS providers (Twilio?) | 🔴 absent | n/a | 🔴 absent | 🔴 absent | 🔴 |
| 9 | Document storage (S3 / Cloudflare R2) | 🔴 absent (env-only) | n/a | 🔴 absent | ⚠️ `/dashboard/system/storage` shows health metrics | 🟡 abstracted via attachment store |
| 10 | Analytics (PostHog / Mixpanel / Amplitude) | 🔴 absent | n/a | n/a | n/a | 🔴 unknown if integrated |
| 11 | Google Workspace (OAuth) | ⚠️ `/development-os/settings/google-workspace` 🔴 P0 500 | partial | 🔴 absent | 🔴 absent | n/a |
| 12 | Banking (Open Banking aggregators) | ⚠️ `/development-os/banking` 🔴 P0 500 | likely encrypted | 🔴 absent | 🔴 absent | 🟡 connection abstraction |
| 13 | Marketing connections (Mailchimp / HubSpot / Klaviyo) | ⚠️ `/development-os/marketing/connections` 🔴 P0 500 | likely encrypted | 🔴 absent | 🔴 absent | 🟡 connection abstraction |
| 14 | Webhooks (outbound) | ⚠️ `/development-os/settings/webhooks` 🔴 P0 500 | n/a (HMAC signing) | 🔴 absent | ⚠️ delivery log somewhere | n/a |
| 15 | API keys (inbound) | ⚠️ `/development-os/settings/api-keys` 🔴 P0 500 | likely encrypted | 🔴 absent | n/a | n/a |

---

## Compliance score

- **Fully shipped to Stage 10.5.B bar (✅ all 5 columns)**: 1 of 15 (AI agents — and that's only because Stage 10.5.B was THE benchmark)
- **Partial**: 9 (most have a UI surface but it's broken in production OR missing test-connection / multi-provider)
- **Absent (no UI)**: 5 (Email, Maps, SMS, Document storage, Analytics)

**Top integrations that SHOULD reach Stage 10.5.B parity for customer launch**:

1. **Stripe** — payment processor, customer-revenue critical. Currently broken (P0 500) + env-only.
2. **WhatsApp** — guest communication, marketed feature. Currently broken + partial encryption.
3. **Resend** — transactional email, every signup uses it. Currently env-only.
4. **Channel managers** — core booking pipeline. Operator: "cannot add new channel".
5. **Google Workspace** — operator productivity features. Currently broken (P0 500).

These 5 + the existing AI agents = 6 integrations at Stage 10.5.B
parity = sufficient for customer launch. The remaining 9 (Maps / SMS
/ Analytics / Banking / Marketing / Webhooks / API keys) can ship in
Phase 10.6.D or later.

---

## Phase 10.6.D recommended scope (~2 weeks per master plan)

### Step 1 — Fix the 11 P0 500s (~10-15h)
Per [`02-dev-os-by-section/_p0-500-diagnoses.md`](../02-dev-os-by-section/_p0-500-diagnoses.md).
After this step, every integration's UI surface is at least RENDER
parity (operator can see what's there, even if Add/Edit doesn't yet
work).

### Step 2 — Apply Stage 10.5.B pattern to top 4 integrations (~16-20h)
- Stripe payment provider — per-org Stripe Connect / direct API key + test connection
- WhatsApp — per-org provider config (Twilio vs Meta) + key + test
- Resend / email — per-org API key + test (from-domain) + multi-provider (Resend / SendGrid / Postmark)
- Channel managers — fix the "cannot add channel" gap; per-channel test-OAuth-flow

### Step 3 — Wire AI agent runner per-org config (~6-12h)
The Stage 10.5.B carry-over. Single fix unblocks all 9 agents +
Concierge AI (per
[`02-dev-os-by-section/_per-cabinet-ai-connectivity.md`](../02-dev-os-by-section/_per-cabinet-ai-connectivity.md)).

### Step 4 — Lower-priority integrations (defer to Phase 10.6.F or beyond)
- Maps API key UI (likely 4-6h)
- SMS provider (likely 4-6h)
- Document storage per-org config (defer until customer requests S3)
- Analytics integration (defer; no operator demand surfaced)

**Phase 10.6.D total**: ~32-50h ≈ 1-2 weeks. Matches master plan
estimate ✓.

---

## What "per-org integration parity" buys customers

- **Trust**: customer brings their own keys; data flows through their
  account, not Arconique's
- **Cost transparency**: customer sees their own AI / SMS / email
  spend directly with the provider
- **Compliance**: customer-supplied credentials enables their own
  audit trail (SOC2, GDPR data-controller obligations)
- **Multi-provider**: customer can switch AI provider per agent or
  email provider entirely without leaving Arconique

This is also the foundation for SubscriptionOS — see
[`subscription-os-gap.md`](subscription-os-gap.md). If every customer
needs to bring their own provider keys, the platform owner's
dashboard needs to surface "X% of customers have configured key Y"
as a customer-success metric.
