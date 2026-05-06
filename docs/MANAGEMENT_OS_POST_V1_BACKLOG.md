# Management OS — Post-v1 Backlog

> Established at Prompt 115.  Companion to `MANAGEMENT_OS_V1_SCOPE_FREEZE.md`.

Items are organised by priority band.  P0 must clear before
production; P1 is early-production work; P2 is business growth; P3
is later strategic bets.

The canonical machine-readable form lives in
`src/features/prelaunch/known-issues.ts`.

## P0 — Before production

> Any v1 blocker that would prevent production go-live.

Today: **none open.**  Track new entries here as they surface during
staging + production cutover.

| ID | Title | Notes |
|---|---|---|
| (none) | — | The known-issues registry currently has no `severity: blocker, status: deferred` entries. |

If a P0 lands during staging, it must be fixed before continuing the
launch checklist.

## P1 — Early production (first 90 days)

| Priority | Title | Why | Effort |
|---|---|---|---|
| P1-01 | **Real payment provider** (Stripe / Xendit / Midtrans) — replace manual stub | Direct-booking deposits + balance need real card capture, webhooks, refunds, payouts | M |
| P1-02 | **Real smart-lock provider** (Aqara / TTLock / SchlageIO) — replace stub | Issue + revoke door codes per stay | M |
| P1-03 | **Production go-live for email + SMS** | Flip `NOTIFICATIONS_DRY_RUN=0`; verify Resend + Twilio templates; warm-up sender domain | S |
| P1-04 | **Server-side login throttle** (auth proxy / Cloudflare Turnstile) | Today's throttle is best-effort at the app layer | M |
| P1-05 | **Storage AV / content moderation** on uploads | ClamAV in-process or vendor moderation API | M |
| P1-06 | **Production-minimal seed automation** | Replace the documented stub with a thin SQL applier | S |
| P1-07 | **SIEM / Sentry / Logtail integration** | Wire the structured logger to a real ingest endpoint; configure alerts | S |
| P1-08 | **Direct booking guest email confirmations** | Hold confirm + deposit paid + check-in email templates | S |
| P1-09 | **Statement automatic rebuild** on every line change | Today operator-triggered; automate via job + audit | M |
| P1-10 | **Vendor SLA enforcement** | Lights-on alerts when a vendor breaches schedule | M |

## P2 — Business growth (3–12 months)

### Integrations
| Priority | Title | Notes |
|---|---|---|
| P2-01 | **OTA write API / channel manager** (Hostex, Hostaway, PriceLabs) | Outbound rate + availability writes |
| P2-02 | **PriceLabs full integration** | Replace internal pricing with PriceLabs as source-of-truth |
| P2-03 | **Xero / QuickBooks export** | CSV today; native API later |
| P2-04 | **WhatsApp Business API + Telegram bot** | Concierge + booking notifications |

### Owner / investor experience
| Priority | Title | Notes |
|---|---|---|
| P2-05 | **Owner mobile PWA polish** | Native-feel install + better offline |
| P2-06 | **FX conversion** in owner revenue + statement views | Display USD / EUR alongside IDR |
| P2-07 | **Owner-side messaging UI** | In-portal message threads with operator |

### Vendor experience
| Priority | Title | Notes |
|---|---|---|
| P2-08 | **Vendor payout rails** (Wise + Indonesian banks) | Automated weekly settlement |
| P2-09 | **Vendor rating workflow** visible to vendor | Two-way rating + dispute flow |

### Booking
| Priority | Title | Notes |
|---|---|---|
| P2-10 | **Full direct-booking checkout** | Cards + Apple Pay + bank transfer with provider |
| P2-11 | **Hold-to-confirm SLAs** | Operator-side dashboards for slow holds |

### Internationalisation / accessibility
| Priority | Title | Notes |
|---|---|---|
| P2-12 | **i18n** EN / ID / RU / JA | Externalise copy via next-intl |
| P2-13 | **WebAuthn / passkeys** | Add to MFA factor types |
| P2-14 | **Accessibility audit** | WCAG 2.2 AA across operator + owner surfaces |

## P3 — Later strategic bets

| Priority | Title | Notes |
|---|---|---|
| P3-01 | **AI write tools with human-in-the-loop approval** | Compose draft replies, tag tasks; operator approves before mutation |
| P3-02 | **Smart-camera integrations** | Read-only camera tiles in front-office |
| P3-03 | **Native iOS / Android apps** | Capacitor or React Native shell over the PWA |
| P3-04 | **Voice concierge** | Twilio voice + LLM transcription |
| P3-05 | **Predictive-maintenance ML** | Forecast preventive task scheduling from utility readings + ticket history |

## Tracking

- Add new entries to `src/features/prelaunch/known-issues.ts` first
  (typed, testable).
- Mirror them in this doc under the right priority band.
- The P115 test suite enforces that the file exists and that every
  issue has severity / status / target.
- Promote items between P0 / P1 / P2 / P3 only with an explicit ADR
  if the change affects scope.

## Out of scope for this OS entirely

These are tracked under sibling operating systems, not the Management
OS backlog:

- Construction OS — project + investor management for the
  pre-handover phase
- Development OS — pre-acquisition land + due-diligence pipeline
- Brand / marketing OS — public-facing campaign tooling
