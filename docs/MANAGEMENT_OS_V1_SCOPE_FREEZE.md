# Management OS v1 — Scope Freeze

> Companion to ADR-0038. Established at Prompt 115.

This is the authoritative list of **what is in v1** and **what is
explicitly excluded**. After Prompt 115, no new business domains land
in v1. Polish, bug-fix, and deployment work continue.

## 1. Included in v1

### Surfaces
- Public marketing site
- Admin dashboard (every CRUD listed in `MANAGEMENT_OS_V1_PRODUCT_MAP.md`)
- Owner / investor portal
- Guest stay portal (token-scoped)
- Direct booking flow (hold → status → manual deposit stub)
- Field staff PWA (online-first)
- Vendor portal (token-scoped)

### Modules
- Finance engine + owner statements + transparency
- Owner intelligence (calendar, revenue, health)
- Operations runtime (housekeeping, maintenance, damage, preventive)
- Maintenance intelligence + utilities risk scanner
- Inventory + procurement
- Guest services (catalog, orders, finance bridge)
- Service fulfilment + vendor portal
- Dynamic pricing engine + channel-push *simulation*
- Integrations (inbound iCal sync + conflict detection)
- Notifications (in_app + email + SMS + dry-run default)
- AI Operations Co-pilot (read-only)
- Guest AI Concierge (handoff at low confidence)
- Security baseline (TOTP MFA, recovery codes, login throttle,
  sensitive-table audit)
- Jobs / cron runtime (16 cron routes, durable locks)
- Deployment readiness (env / gates / health / storage / smoke)

### Tooling
- 8 static check scripts
- `npm run preflight:deploy`
- `npm run staging:report`
- `npm run db:migrate` + `db:seed` (demo seed)
- `seed:production:minimal` documented stub

### Documentation
- README + 8 product / architecture docs
- 38 ADRs (ADR-0001 … ADR-0038)
- 6 deployment / staging / storage / cron / seed runbooks
- Demo walkthrough + scope freeze + product map + role-surface matrix
  + route map + launch readiness + post-v1 backlog (this prompt)

## 2. Explicitly excluded from v1

These are tracked in `MANAGEMENT_OS_POST_V1_BACKLOG.md`:

- Real PSP integration (Stripe / Xendit / Midtrans)
- Real OTA write back (Booking.com / Airbnb / channel manager)
- Real smart-lock provider (Aqara / TTLock / SchlageIO)
- WhatsApp Business API + Telegram bot
- AI write tools (any tool that mutates DB / external state)
- WebAuthn / passkeys
- Multi-currency (FX rates, USD / EUR display)
- Full i18n (EN / ID / RU / JA)
- Full PWA offline-first task runner
- Anti-virus / content-moderation on uploads
- Vendor payout rails (Wise / Indonesian banks)
- Xero / QuickBooks export
- Native mobile apps
- Voice concierge
- Predictive-maintenance ML
- Camera integrations beyond placeholders
- Statement accounting rewrites (current model is frozen)

## 3. Stubs included in v1

Stubs ship with explicit "DEMO" / "STUB" copy in the UI and a
documented post-v1 upgrade path:

| Stub | Path | Replaced by |
|---|---|---|
| Manual payment provider | `src/features/payments/manual-provider.ts` | Stripe / Xendit / Midtrans |
| Smart-lock issuance | `src/features/guest-stays/smart-lock-stub.ts` | Aqara / TTLock / SchlageIO |
| Channel push simulation | `src/features/dynamic-pricing/channel-push.ts` | PriceLabs / Hostex / Hostaway |
| Notification dry-run | `NOTIFICATIONS_DRY_RUN=1` (default) | live Resend + Twilio + WhatsApp + Telegram |
| AI dry-run | `AI_DRY_RUN=1` (default) | live Anthropic with rate / cost limits |
| Vendor portal payout | n/a (manual settlement) | Wise / Mandiri / BCA payout rails |
| Production-minimal seed | `scripts/seed-production-minimal.ts` | thin SQL applier |

## 4. Security baseline included

- TOTP MFA + recovery codes (RFC 6238, dependency-free)
- Login throttle per email + per IP (app-level)
- Sensitive-table audit trigger across 14 tables
- AES-256-GCM encryption for MFA secrets and Wi-Fi passwords (scrypt
  KDF, namespaced salts)
- SHA-256 salted hashing for IPs / user-agents / recovery codes
- `Authorization: Bearer <CRON_SECRET>` on every cron route
- Storage buckets are private; signed URLs only
- Production gates: 8 (no demo mode, no bare DEMO_MODE, no demo
  security fallbacks, no dev cron bypass, security secrets present,
  notifications mode explicit, AI mode explicit, bootstrap secret
  strong)

## 5. Deployment readiness included

- Typed env registry (every var classified)
- 8 static checks wired into `preflight:deploy`
- Markdown readiness report (`npm run staging:report`)
- 6 deployment runbooks
- 8 production gates
- System health + storage + deployment dashboards
- Backup / restore runbook

## 6. What counts as a v1 blocker

A **v1 blocker** must be one of:

1. A failing static check (`preflight:deploy` non-zero).
2. A failing test in the existing 600+ test suite.
3. A typecheck or lint error.
4. A build failure.
5. A demonstrable security regression — RLS off, cron secret leaked,
   service-role-style key in a public module, MFA bypass.
6. An empty-state or fallback that crashes a stakeholder-facing page
   (admin / owner / guest / field / vendor) instead of degrading
   gracefully.

Anything else — copy polish, additional integration, additional
feature, FX, i18n, PWA — is **not** a v1 blocker.

## 7. What is accepted post-v1

See `MANAGEMENT_OS_POST_V1_BACKLOG.md` for the prioritised list (P0 →
P3). The summary:

- **P0** before production: any remaining security / env / staging
  blockers (none open today).
- **P1** early production: real PSP, real smart-lock, real email /
  SMS go-live, full server-side throttle, AV scanning, prod-minimal
  seed automation, SIEM / Sentry.
- **P2** business growth: OTA write API, PriceLabs, Xero / QuickBooks,
  WhatsApp / Telegram, owner mobile PWA, vendor payouts, FX, i18n,
  WebAuthn, full direct-booking checkout, guest email confirmations.
- **P3** later: AI write tools, smart cameras, native apps, voice
  concierge, predictive-maintenance ML.

## 8. Criteria for moving to Development OS / Construction OS

Management OS v1 is the *first* of three adjacent operating systems
in the Arconique family. Move on when:

1. Management OS staging is **green** for two consecutive weeks
   (no fatals, no failed gates, no failed cron auth checks).
2. At least one paying owner is using the owner portal weekly and at
   least one operator is using the admin dashboard daily.
3. The known-issues registry has no `severity: blocker, status:
   deferred` entries.
4. The deployment runbook has been executed end-to-end at least once
   in production (even on a small footprint).
5. The next OS gets its own scope-freeze ADR before code lands.
