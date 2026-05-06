# Partner Program Setup

How to obtain credentials for each channel the platform integrates with.
Operator-facing — share with whoever holds the property's commercial
relationships with each channel.

**Estimated approval timelines** (vary by region + property type):
- Booking.com: 2–4 weeks (Booking Partner Hub onboarding)
- Airbnb: 1–2 weeks (Hosting API consent + verification)
- Trip.com: 1–3 weeks (Partner Connect)
- Agoda: 2–4 weeks (YCS partnership review)
- Expedia: 2–4 weeks (EQC certification + sandbox testing)
- VRBO: shares Expedia track (extra sub-account approval)
- Hotels.com: shares Expedia track

The platform code is **ready today**. The waiting period is the partner
program approval — operators apply in parallel with platform deployment.

---

## Booking.com

**API**: OTA XML (Demand API JSON for some endpoints).
**Where to apply**: https://partner.booking.com/ → Connectivity → "Apply for connectivity".

Required from Booking after approval:
- Hotel ID (numeric, e.g. `12345678`)
- XML username + password (set inside Booking Partner Hub → Connectivity)
- Sandbox + production environment URLs (Booking provides — defaults baked into the client)

Connect modal fields: username, password, hotel_id, environment.

---

## Airbnb

**API**: Hosting API (REST/JSON, OAuth2).
**Where to apply**: https://www.airbnb.com/partner — request Hosting API access.

Required from Airbnb after approval:
- OAuth2 access_token + refresh_token (one-time grant via consent flow)
- Listing ID per property (visible in your Airbnb host dashboard URL)

Connect modal fields: access_token, refresh_token, listing_id, expires_at.

**OAuth flow note**: Full in-app OAuth lands in Stage 6.P5 (Productivity
Tools). For now, paste tokens manually after running the OAuth consent
flow externally (e.g. via the Airbnb developer console).

---

## Trip.com

**API**: Partner Connect (REST/JSON).
**Where to apply**: https://group.trip.com/partner-connect/ → Apply.

Required from Trip.com after approval:
- Partner ID
- API key (rotate every 90 days per Trip.com policy)
- Hotel ID

Connect modal fields: partner_id, api_key, hotel_id.

---

## Agoda

**API**: YCS (Yield Control System) — REST/JSON modern + SOAP legacy.
**Where to apply**: https://ycs.agoda.com/ → Connectivity Partner.

Required from Agoda after approval:
- Hotel ID
- API key
- API secret (used for the `X-Agoda-Signature` HMAC scheme)
- Sandbox + production environment

Connect modal fields: hotel_id, api_key, api_secret, environment.

---

## Expedia (also covers VRBO + Hotels.com)

**API**: EQC SOAP (legacy, still supported) + EPC REST (modern).
**Where to apply**: https://expediapartnercentral.com/ → Connectivity → Apply for EQC.

Required from Expedia after approval:
- Hotel ID
- EQC username + password (set in Expedia Partner Central → Connectivity)
- Sandbox + production environment

VRBO + Hotels.com share EQC infrastructure but require **separate
sub-account approval** through the same partner channel. Use the same
fields per channel — the platform routes by `channel` to the right EPC
namespace.

Connect modal fields: hotel_id, eqc_username, eqc_password, environment.

---

## After credentials arrive

1. Open `/development-os/channels` in the platform.
2. Find the villa row + channel column → click "Connect".
3. Paste credentials. Submit.
4. The platform encrypts → calls `testConnection` → persists with
   `status='active'` if test passed, `status='error'` if it failed (the
   row is preserved either way so the operator can re-test or update
   credentials without re-typing).
5. Within 15 minutes the inventory cron pushes availability for the next
   18 months. Within 30 minutes rates push if rate plans are configured.
   Within 5 minutes any new reservations start landing in the unified
   inbox at `/development-os/channels/inbox`.

For end-to-end troubleshooting, see the integration health hub at
`/development-os/integrations`.
