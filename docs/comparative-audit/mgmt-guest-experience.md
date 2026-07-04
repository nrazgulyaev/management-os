# Comparative Functional Audit — Management: Guest Experience

**Cluster:** Guest experience (dashboard: guest-services, service-fulfilment, guest-journey, guest-ai, villa-guides, concierge, guests, guest-stays) **plus** the external Guest Portal (`src/app/(guest)/stay/[token]/…`, 27 pages).
**App:** Next.js 15 + Drizzle multi-tenant villa SaaS.
**Date:** 2026-07-02. **Scope note:** cross-tenant/IDOR NOT re-audited (covered by prior tenancy waves). This audit = functional completeness + mock/dead surfaces + competitive benchmark.

## Headline

This cluster is **strong and largely real**. The guest lifecycle — token access → OTP verification gate → catalog/free-text service request → operator order transition → fulfilment → finance bridge into `revenue_lines` — is genuinely wired end-to-end with server-side re-pricing, scope validation, idempotency and period-lock awareness. The **AI concierge is a real Anthropic-backed RAG system** (context builder + safety layer + citations + deterministic fallback), which is a genuine differentiator vs the "canned-reply" bots most competitors shipped 12–18 months ago. The only demo/mock surface (`/stay/demo/*`) is an intentional, clearly-labeled marketing preview never reachable from a real `/stay/[token]`.

Two real product gaps vs Duve/Guesty/Hostfully: **(1) no in-portal guest payment** on service orders (staff-collected only — matches the deferred-PSP decision), and **(2) verification is OTP-only, no ID/KYC document capture**. One accepted stub: **smart-lock is intent-only, no hardware call**.

---

## (A) Status Table

### Guest Portal (`src/app/(guest)/stay/[token]/…`) — sampled representatively

| Surface | File | Status | Notes |
|---|---|---|---|
| Stay home | `stay/[token]/page.tsx` | **WORKS** | `resolveGatedStay` (rate-limit → verify redirect → resolve + access-log); live suggestions, wifi, countdown from booking data. |
| OTP verification gate | `stay/[token]/verify/page.tsx` | **WORKS** | Real `issueVerificationCode` / `canAccessStayWithoutVerification`; every content page redirects unverified tokens here. |
| Services catalog + order | `stay/[token]/services/page.tsx`, `components/stay/services-catalog.tsx` | **WORKS** | `listGuestVisibleServices` (villa/project/global scope); order via `submitGuestOrderAction` with server-side re-price. |
| Free-text service request | `components/stay/service-request-form.tsx` → `guest-stays/actions.ts:333` | **WORKS** | `createGuestServiceRequestAction`, real persistence. |
| Order history / detail | `stay/[token]/services/orders/page.tsx`, `orders/[id]/page.tsx` | **WORKS** | `listFulfilmentsForStayToken`; guest-facing status mapping. |
| Concierge AI chat | `stay/[token]/concierge/page.tsx`, `components/stay/concierge-chat.tsx` | **WORKS** | Real Anthropic call (`provider.ts`) + RAG context + safety + citations + fallback; session + rate limits. |
| Villa guide | `stay/[token]/guide/page.tsx` | **WORKS** | Live `summary.sections` markdown; graceful "being prepared" empty state. |
| Check-in / door code | `stay/[token]/check-in/page.tsx` | **PARTIAL** | Real check-in lifecycle + gated code reveal (`status='code_issued'`), but door code is operator-entered — **no real smart-lock issuance** (see IOT-001). |
| Wifi / house-rules / emergency / neighborhood / requests / offline | `stay/[token]/{wifi,house-rules,emergency,neighborhood,requests,offline}/page.tsx` | **WORKS** | All read live stay summary/sections behind the shared gate. |
| Service payment | (none) | **MISSING** | No in-portal pay/deposit; guest pays staff. Matches deferred-PSP (Indonesia/Xendit) decision. |
| Demo preview | `stay/demo/*` (13 pages) | **MOCK (intentional)** | Static content + "Mock chat with five canned replies" (`demo/page.tsx:238`). Linked only from public marketing + demo nav; **not** reachable from real token. Not a defect. |

### Dashboard (operator side)

| Surface | File | Status | Notes |
|---|---|---|---|
| Guest services catalog / categories / options | `dashboard/guest-services/{catalog,categories}/…` | **WORKS** | Full CRUD via `upsert*Action`. |
| Orders + transition + finance bridge | `dashboard/guest-services/orders/…`, `actions.ts:559,781` | **WORKS** | `transitionOrderAction` (perm-gated `.fulfill`), auto `bridgeOrderToFinance` on fulfilment. |
| Order→revenue bridge | `guest-services/finance-bridge.ts` | **WORKS** | Idempotent (unique `order_id`), skips no-charge, respects locked periods → `revenue_lines`. |
| Fulfilment→expense bridge | `service-fulfilment/finance-bridge.ts` | **WORKS** | Separate idempotent bridge keyed on `fulfilment_id`. |
| Service fulfilment (vendors/invoices/ratings/fulfilments) | `dashboard/service-fulfilment/…` | **WORKS** | Live reads + vendor CRUD + fulfilment detail. |
| Guest journey (rules/suggestions/runs/reviews) | `dashboard/guest-journey/…`, `guest-journey/runner.ts` | **WORKS** | Real trigger engine: rules → suggestions → notifications → review requests (`runner.ts`, `owner-events-rebuild.ts` explicitly replaces the P101 stub). |
| Guest-AI (sessions/handoffs/storage/metrics) | `dashboard/guest-ai/…`, `guest-ai-concierge/handoff-services.ts` | **WORKS** | Real sessions, handoff lifecycle + metrics, attachment storage (EXIF strip + private bucket). |
| Villa guides (sections/wifi/emergency/neighborhood) | `dashboard/villa-guides/…` | **WORKS** | CRUD feeding the guest guide/wifi pages. |
| Concierge cabinet | `dashboard/concierge/page.tsx` | **WORKS** | Comment `:18` confirms 5 former mock arrays replaced with live reads. |
| Guest stays (tokens/security/verifications/events) | `dashboard/guest-stays/…` | **WORKS** | Token issuance, verification + security-event views. |
| Guests directory | `dashboard/guests/page.tsx` | **WORKS** | `listGuests()` live; `source ?? "mock"` (`:25`) is a data-provenance **badge** (live vs demo tenant), not a mock-data defect. |

**Status counts:** WORKS ~26 · PARTIAL 1 (check-in/smart-lock) · MOCK 1 (intentional demo) · MISSING 1 (in-portal payment) · BROKEN 0.

---

## Prioritized Defects / Gaps (file:line)

1. **[P1] Smart-lock is intent-only** — `check-in/page.tsx` (code reveal) + accepted issue `prelaunch/known-issues.ts:180` (IOT-001): "Lock-code issuance + revoke records intent. No real Aqara/TTLock/SchlageIO call." Door code is operator-typed. Competitors ship native mobile-key/lock-code release. Accepted for v1; post-v1 integration.
2. **[P1] No in-portal payment / deposit on service orders** — no pay surface under `stay/[token]/services/*`; `submitGuestOrderAction` (`guest-services/actions.ts:333`) creates a priced order but collection is staff-side. Every competitor collects card in-store (Duve upsells, Hostfully Marketplace via Stripe). Consistent with deferred-PSP (Xendit/QRIS) decision but is a functional gap vs benchmark.
3. **[P2] Verification is OTP-only, no ID/KYC capture** — `verify/page.tsx` + `verification-form.tsx` issue/verify a code; no passport/ID/selfie upload. Duve/Guesty do ID verification "before the lobby." Gap for regulated markets.
4. **[P2] Check-in flow lacks structured guest registration data** — `guest-checkin-form.tsx` exists but there is no full digital-registration wizard (party details, ETA, signatures) equivalent to Duve's Online Check-In Wizard.

No BROKEN surfaces, no dead buttons (all `disabled` states are legitimate pending/loading), no mock data leaked to real guests.

---

## (B) Competitor Benchmark — Duve · Guesty · Hostfully (2025–26)

| Capability | Duve | Guesty | Hostfully | **Us** | Verdict |
|---|---|---|---|---|---|
| Online check-in | Wizard (ID+payment pre-lobby) | Instructions + door-code release | Basic | OTP gate + check-in page + form | **PARITY-** (no full wizard) |
| Digital guidebook | Yes (white-label app) | GuestyGuides auto-sync | Guidebook (core product) | Villa guide + wifi/rules/neighborhood, live sections | **PARITY** |
| Upsell store | Tailored upsells, real-time price adjust | AI-timed upsells, post-stay | Guidebook Marketplace (Stripe) | Priced catalog + order + finance bridge | **PARITY on catalog; GAP on in-portal payment** |
| Guest messaging / AI | AI Agents across WhatsApp/SMS/OTA | ReplyAI (suggest/improve/summary) | Basic | **Anthropic RAG concierge + citations + safety + fallback + human handoff** | **DIFFERENTIATION** |
| ID / KYC verification | Yes (pre-lobby) | Payment + fraud detection | Limited | OTP only | **GAP** |
| Smart-lock / mobile key | Native mobile key | GLM (Salto codes) | Integrations | Intent-only stub | **GAP (P1)** |
| Guest app (no download) | Yes | Native app | Web guidebook | Web `/stay/[token]` PWA-style | **PARITY** |
| In-portal payment | Yes | Automated collection + fraud | Marketplace via Stripe | None (staff-collected) | **GAP (P1)** |

**Differentiation:** our concierge is a real LLM-RAG system grounded in per-villa content with citations, a safety/secret-leak layer, human-handoff, and a deterministic offline fallback — deeper than the "suggest/summarize" ReplyAI-style bots. Lean into this.

### Recommendations (priority)
- **P0:** none — cluster is launch-viable; guests never see mock data on a real token.
- **P1:** (a) integrate one smart-lock provider (TTLock/Salto) to close IOT-001; (b) add in-portal payment/deposit on service orders using the planned Xendit/QRIS rails so upsell revenue is captured, not just priced.
- **P2:** (a) add ID/KYC document capture to `/verify` for regulated markets; (b) build a full online check-in wizard (party, ETA, signature) matching Duve.
- **P3:** surface the AI concierge as a marketed differentiator; consider multi-channel (WhatsApp) reach beyond the in-portal chat.

---

## Sources
- [Duve — guest experience platform](https://duve.com/), [Duve $60M Series B / AI (Skift)](https://skift.com/2025/12/09/duve-60-million-series-b-hotels-guest-management/), [Duve Product Updates](https://helpcenter.duve.com/hc/en-us/articles/7769709812765-Duve-Product-Updates)
- [Guesty AI Agents](https://www.guesty.com/features/ai-for-short-term-rentals/), [Guesty 2025 releases](https://help-lite.guesty.com/hc/en-gb/articles/24924445858461-New-releases-2025), [Guesty guest communication 2026](https://www.guesty.com/blog/7-high-impact-guest-communication-strategies/)
- [Hostfully Digital Guidebooks](https://www.hostfully.com/digital-guidebooks/features/), [Hostfully Guidebook Marketplace upsells](https://help.hostfully.com/en/articles/3056477-upsell-your-services-on-the-guidebook-marketplace)
