# Channel Manager Architecture

**Stage**: 6.P1 (ACCEPTED).
**Scope**: Booking.com, Airbnb, Trip.com, Agoda, Expedia, VRBO, Hotels.com.

This document is the architectural overview. For per-provider setup
steps (how to obtain credentials), see [PARTNER-PROGRAM-SETUP.md](PARTNER-PROGRAM-SETUP.md).
For the rollup acceptance state, see [STAGE-6-P1-COMPLETE.md](STAGE-6-P1-COMPLETE.md).

---

## High-level shape

```
┌──────────────────┐     push availability/rates     ┌──────────────┐
│  Cron jobs       │ ──────────────────────────────▶ │  Channel API │
│  (every 15 min)  │                                  │ (Booking,    │
└──────────────────┘                                  │  Airbnb, …)  │
         ▲                                            └──────┬───────┘
         │                                                   │
   listActiveConnectionsForCron()                            │ webhook +
         │                                                   │ poll pull
         │                                                   ▼
┌──────────────────────────────────────────────────────────────────┐
│  channel_connections  ─┐                                          │
│  channel_sync_log     ─┼─ encrypted creds via STAY_LINK_KMS       │
│  channel_reservations ─┤   workflow → handleIncomingReservation   │
│  channel_commission_records                                       │
└──────────────────────────────────────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────────────────────┐
│  bookings (existing platform table) — internal_booking_id link   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Provider abstraction

Every channel provider implements the `ChannelManagerProvider` interface
([src/lib/channel-manager/types.ts](../src/lib/channel-manager/types.ts)):

| Method | Purpose |
|---|---|
| `pushAvailability` | Push per-day inventory counts to the channel |
| `pushRates` | Push per-day prices + min/max stay |
| `pushAmenities` | Push amenity codes |
| `pullReservations` | Fetch modified-since reservations |
| `verifyWebhook` | Constant-time HMAC verify on webhook payload |
| `parseWebhook` | Channel-specific event → canonical `WebhookEventType` |
| `testConnection` | Lightweight ping for the Connect modal |

The selector ([select-provider.ts](../src/lib/channel-manager/select-provider.ts))
routes `(channel, credentials)` → real provider when creds present, else
to `DryRunChannelProvider`. **Operators can configure connections without
credentials and the platform still runs end-to-end** — the moment real
credentials arrive, the integration goes live with no code change.

| Channel | Protocol | Auth | Notes |
|---|---|---|---|
| Booking.com | OTA XML | HTTP Basic | Demand API JSON for modern endpoints (reserved for P3+) |
| Airbnb | REST/JSON | OAuth2 Bearer | Auto-refresh on expiry + reactive on 401 |
| Trip.com | REST/JSON | API key + Partner ID headers | HMAC webhook signing |
| Agoda | REST/JSON | Custom signature | `SHA256(timestamp + path + body)` keyed with apiSecret |
| Expedia | SOAP (EQC) + REST (EPC) | HTTP Basic | EQC for inventory/rates/booking pull, EPC for amenities |
| VRBO | Inherits Expedia EQC | HTTP Basic | Different EPC namespace |
| Hotels.com | Inherits Expedia EQC | HTTP Basic | Different EPC namespace |

---

## Architectural decisions (locked at P1 entry)

1. **Unified inbox, multiple sources** — single `channel_reservations`
   table; UI filters by channel. Internal `bookings` is the authoritative
   booking record, linked via `internal_booking_id`.
2. **Provider abstraction follows Stage 3.A AI-provider pattern** — one
   interface, one selector, per-channel implementations behind it,
   DryRun fallback always available.
3. **Inventory push: rapid availability + delayed rates** — 15-min
   availability cron, 30-min rates cron. Channels rate-limit rate pushes
   harder than availability pushes.
4. **Reservation pull: webhook-first, polling fallback** — 5-min cron
   fills gaps for channels that drop or don't offer webhooks.
5. **Calendar conflict resolution: last-write-wins per channel + manual
   review queue** — the second arrival is flagged `conflict_pending`,
   surfaced at `/development-os/channels/conflicts` for operator action.
6. **Channel commission tracking: per-reservation, separate
   reconciliation table** — `channel_commission_records` for the
   bookkeeper to match against monthly commission invoices.

---

## Storage model (4 tables)

| Table | Purpose |
|---|---|
| `channel_connections` | Per `(org, villa, channel)` connection. Encrypted credentials JSONB, rate-plan / amenity / policy mappings, last-sync state, commercial fields (commission %, payment model). RLS via `is_in_user_organization()`. |
| `channel_sync_log` | Per-attempt audit row (inventory push, rates push, reservations pull, webhook receive). Tracks duration, records counts, `api_calls_count` for cost tracking. |
| `channel_reservations` | Every reservation pulled or webhook-pushed. Raw payload preserved + projected fields for the unified inbox. `conflict_pending` flag for operator review. |
| `channel_commission_records` | Per-reservation commission liability (expected vs invoiced vs paid + reconciled flag). |

---

## Encryption

Credentials live in `channel_connections.credentials` (JSONB) wrapped in
an AES-256-GCM envelope keyed via `STAY_LINK_KMS_SECRET` (the same
secret used for guest-stay tokens + Wi-Fi passwords). Production refuses
to encrypt without the secret; dev uses a deterministic fallback with a
loud warning.

The encryption helpers live at
[src/lib/channel-manager/credentials-crypto.ts](../src/lib/channel-manager/credentials-crypto.ts):

- `encryptCredentials(plaintextJson, secret)` → `{v, k, c}` envelope
- `decryptCredentials(blob, secret)` → plaintext JSON string
- `redactCredentials(creds)` — whitelist scrub for safe logging

Decryption only happens at runtime inside the service layer; the UI
never sees plaintext. The Settings tab on the connection detail page
uses `getRedactedCredentials` to show metadata only (channel, hotelId,
environment).

---

## Reservation workflow (P1.F)

`handleIncomingReservation(connectionId, reservation)` is the single
ingestion entry point. Outcomes:

| Outcome | When |
|---|---|
| `created` | New reservation, no conflict, projected to internal booking |
| `updated` | Existing reservation, fields changed, applied to channel_reservations + booking |
| `cancelled` | Status flipped to cancelled, refund calculated per policy, booking status flipped |
| `no_change` | Existing reservation, identical payload, just refresh `lastModifiedAt` |
| `conflict_pending` | Overlaps an existing booking on the same villa — flagged for operator |
| `failed` | Connection not found or bad payload |

Pure helpers in [workflow-helpers.ts](../src/lib/channel-manager/workflow-helpers.ts):

- `mapReservationToBooking` — channel reservation → `bookings` insert shape (deterministic `bookingCode = CB-{CHANNEL}-{ID}` for idempotent re-runs)
- `mapStatusToInternal` — channel status string → internal enum
- `detectChanges` — flat diff between two reservations
- `calculateRefund` — per-policy refund (free / moderate / late / no_show buckets, BigInt half-up rounding)
- `detectOverlap` — calendar-conflict detection with same-day-turnover preserved
- `deriveBookingCode` — deterministic booking code shape

---

## Cron jobs (5 new in P1.G — total 78)

| Cron | Schedule | Purpose |
|---|---|---|
| `channel_inventory_sync` | `*/15 * * * *` | Push availability to every active connection |
| `channel_rates_sync` | `*/30 * * * *` | Push rates (slower cadence — channels rate-limit rate pushes) |
| `channel_reservations_pull` | `*/5 * * * *` | Webhook fallback — pull modified-since reservations |
| `channel_conflict_detector` | `0 * * * *` | Hourly sweep over recent reservations for overlap detection |
| `channel_commission_reconciliation` | `0 2 * * *` | Daily auto-reconcile + flag stale commission records |

Each cron iterates active connections; one bad connection's failure
does not abort the batch.

---

## Webhook routes (7 new in P1.G)

`/api/webhooks/channels/{channel}/route.ts` for each of the 7 real
channels. Each route delegates to
[handleChannelWebhook](../src/lib/channel-manager/webhook-handler.ts) which:

1. Reads raw body + signature header (header name varies per channel).
2. Looks up the connection by `(channel, externalPropertyId)`.
3. Calls `handleWebhookForChannel` → verify HMAC → parse → ingest.
4. Returns 200 quickly so the channel doesn't retry.

Per security best practice: 401 on signature failure (channels back off),
404 on missing connection (config issue), 200 on success.

---

## Status dashboard

`/development-os/integrations` — platform-wide health hub showing:

- Channel manager (active / error / paused / 7-day API call total)
- Communications (P2 placeholder)
- Banking + Payments (P3 placeholder)
- Marketing + Analytics (P4 placeholder)
- Productivity (P5 placeholder)
- AI Agents (P6 placeholder)

---

## How a new channel is added

1. Add a credential variant to `ChannelCredentials` discriminated union ([types.ts](../src/lib/channel-manager/types.ts))
2. Add a CHECK constraint value to the SQL migration (or a new migration if shipping post-P1.G)
3. Implement `client.ts`, `mappers.ts`, `provider.ts` under `providers/{channel}/`
4. Add a `case` to `selectChannelProvider`
5. Add a credential field renderer + collector to `ConnectChannelModal`
6. Add a webhook route under `/api/webhooks/channels/{channel}/`
7. Add channel labels, color class, picker to the per-channel maps
8. Update the still-DryRun assertion in tests/development-stage-6-p1-a.test.ts
