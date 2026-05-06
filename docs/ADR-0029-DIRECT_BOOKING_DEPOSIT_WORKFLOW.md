# ADR-0029 — Direct Booking Deposit Workflow + Payment Provider Stub (Prompt 106)

## Status
Accepted. Implemented in migration `0028_direct_booking_deposit_workflow.sql`,
the `src/features/direct-booking/deposits*` + `src/features/payments/*`
modules, the public API at `/api/v1/holds/[token]/deposit*`, the public
payment + status pages under `/book/hold/[token]/{payment,status}`, and
the admin surfaces under `/dashboard/direct-bookings/deposits*` +
`/dashboard/payments`.

## Context
Prompt 105 gave us hold → request → manual concierge approval →
canonical booking. The conversion always issued a (`tentative` or
`confirmed`) booking the moment a booking_manager approved the
request, with no money side-effect.

We need a **deposit gate** that:
- calculates an amount from policy (default: 30% of total, $300
  minimum, capped at the total),
- creates a provider session (manual stub today; future Stripe /
  Xendit / Wise / bank_transfer slots),
- exposes a guest-safe payment page that does not collect card data,
- requires staff to verify and mark the deposit paid before a
  confirmed booking can issue,
- supports a director-tier override that converts WITHOUT a paid
  deposit but always lands the booking as `tentative`,
- captures provider webhook events idempotently so future PSP wiring
  is additive.

We want NONE of:
- Real Stripe / Xendit / Wise / crypto integration.
- Card-data collection on any public surface.
- Auto-redirects to live PSP checkout.
- Auto-confirmation by webhook signature alone.

## Decision

### 1. Schema additions
Four new tables, all internal-only RLS:

- **payment_provider_accounts** — provider config rows. CHECK on
  `provider_key ∈ {manual_stub, stripe, xendit, wise, bank_transfer}`.
  Private credentials live in `config_private_encrypted` and never
  surface in any UI. Public fields go in `config_public_json`.
- **direct_booking_deposits** — 1:n attached to `(hold_id,
  request_id)`. UNIQUE `deposit_code`. Status enum has 9 values
  including the new `manually_marked_paid`. CHECK `amount_minor >= 0`.
- **direct_booking_deposit_events** — append-only timeline; CHECK
  `actor_type ∈ {guest, internal, system, provider}`.
- **payment_webhook_events** — idempotent envelope; UNIQUE partial
  index on `(provider_key, external_event_id) WHERE external_event_id
  IS NOT NULL`. The manual stub never writes here.

### 2. Deposit policy
`calculateDepositAmount(totalMinor, policy)` is a pure helper. The
default platform policy is `{ kind: 'percent', percent: 0.30,
minimumMinor: 30000n }` ($300 minimum, 30% of total). The amount is
always clamped to `[0, total]` so we never charge more than the
booking total — even when the minimum exceeds the total (mostly
short / cheap stays).

### 3. Manual stub provider
`ManualStubProvider` (in `src/features/payments/manual-stub-provider.ts`)
implements the `PaymentProvider` interface. It:
- Generates a deterministic `man_<deposit_id>` session id.
- Returns a `payment_url` that points back to our own
  `/book/hold/<token>/payment` page — never to a real PSP host.
- `getStatus()` always reports `pending` — the manual flow flips
  status via the admin "Mark paid" action; webhooks are not used.
- `cancelSession()` is a no-op success.

Future Stripe / Xendit / Wise / bank_transfer providers can register
in `provider-selector.ts` without touching call sites.

### 4. Hook points
- **Submit** (`POST /api/v1/holds/[token]/submit`): after the request
  is created, `ensureDepositForRequest` runs idempotently — it
  computes the amount, creates a provider session, persists the
  deposit, and returns the public-safe summary (deposit code,
  amount, status, payment URL) on the response. The handler also
  queues an internal `direct_booking.deposit_created` notification
  to finance_manager.
- **Approve** (`approveDirectBookingRequestAction`): unchanged —
  the deposit row already exists from submit, and approval just
  moves the request status. The guest-facing payment page surfaces
  the deposit when the request is `approved` or any earlier state.
- **Convert** (`convertDirectBookingRequestToBookingAction`): NEW
  gate. Reads the linked deposit; if `paid` or `manually_marked_paid`,
  conversion proceeds with the requested final status (default
  `tentative`, admin can pick `confirmed`). If the deposit is not
  paid, the conversion **rejects** unless the form passes
  `convertWithoutDeposit=true` AND the actor holds
  `direct_booking.manage` (booking_manager / director / super_admin).
  Override always lands the booking as `tentative` — never
  `confirmed`. The audit row carries `{depositPaid, convertWithoutDeposit,
  overrideReason}` so the trail is explicit.

### 5. Public surface
- `GET /book/hold/[token]/payment` — shows hold code + deposit code
  + amount + currency + the public status label. NO card fields.
  When the deposit is payable, a "I have paid / request confirmation"
  button posts to `/api/v1/holds/[token]/deposit/notify-paid`. That
  endpoint NEVER flips the deposit row paid — it only records a
  `guest_claimed_paid` event and queues internal notifications to
  finance_manager + booking_manager.
- `GET /book/hold/[token]/status` — public timeline (hold +
  request + deposit) with collapsed labels. No staff names, no
  internal IDs except the public codes, no provider session IDs.
- `GET /api/v1/holds/[token]/deposit` — JSON projection of the
  deposit suitable for the public UI.

### 6. Admin routes
- `/dashboard/direct-bookings/deposits` (list + filter by status)
- `/dashboard/direct-bookings/deposits/[id]` (detail with
  Mark paid / Mark failed / Cancel / Refund placeholder buttons)
- `/dashboard/direct-bookings/requests/[id]` now shows a Deposit
  panel with the same actions.
- `/dashboard/payments` (hub with deposit metrics)
- `/dashboard/payments/providers` (provider catalog)
- `/dashboard/payments/webhooks` (idempotent webhook history)

### 7. Permissions
Seven new keys:
- `payments.{read,write,manage}` — finance / accountant / director.
- `direct_booking.deposit.read` — concierge can read; finance,
  ops, property, booking_manager can read.
- `direct_booking.deposit.write` — finance / accountant /
  booking_manager / director / super_admin.
- `direct_booking.deposit.mark_paid` — finance / accountant /
  director / super_admin only.
- `direct_booking.deposit.refund` — finance_manager / director /
  super_admin only.

Investor + all field roles excluded from every key.

### 8. Privacy / safety contract
- `PublicDepositView` (the JSON projection returned to guests)
  carries no `providerSessionId`, no `providerPaymentId`, no
  `providerAccountId`, no `createdBy`. Pinned by source-grep test.
- `sanitizeProviderPayloadForPublic` strips any field name matching
  `secret | private | key | token | card | cvv | iban | account_number
  | client_id | webhook_secret` (case-insensitive, recursive).
- Public payment page tests grep for `card_number`, `cvv`,
  `cardholder` — must not appear.
- No source file imports the Stripe / Xendit SDK; the migration
  forward-only adds the schema, but the runtime stays manual-stub.

### 9. Future PSP integration
When Stripe / Xendit / Wise lands:
1. Add a new provider class implementing `PaymentProvider`; register
   in `provider-selector.ts`.
2. The `payment_provider_accounts` row stores credentials
   encrypted-at-rest in `config_private_encrypted`.
3. `direct_booking_deposits.provider_session_id` /
   `provider_payment_id` / `payment_url` are written by the new
   provider's `createSession`.
4. `payment_webhook_events` is the idempotent envelope: a `POST
   /api/v1/payments/webhooks/<provider_key>` route validates the
   signature, inserts the row (UNIQUE on `(provider_key,
   external_event_id)` skips duplicates), and a worker flips the
   deposit row to `paid` based on the event type.
5. The public payment URL changes from our local stub page to the
   PSP's hosted checkout. The conversion gate stays unchanged.

### 10. What is deferred
- All real PSP integrations.
- Refund actually moving money — the placeholder action just flips
  the deposit row.
- Hold-expiry-aware deposit cancellation: today the expiry job
  only releases the calendar block; the deposit moves to `failed`
  / `expired` only via admin action. Adding deposit-expiry to the
  cron is a small follow-up.
- Multi-currency support beyond per-deposit currency strings.

## Consequences
- The deposit row is the gate that decouples "request approved"
  from "booking confirmed". We can demo confirmed bookings via the
  override path while still requiring a deposit on the happy path.
- Source-grep tests + the `PublicDepositView` shape lock the
  privacy contract today and continue to lock it when a real PSP
  drops in.
- The conversion action is now the single seam where booking
  status is decided. Audit metadata is explicit so post-mortems
  can answer "why did this booking go straight to confirmed?".

## Roll-out
- Migration `0028` is forward-only. Existing direct-booking flows
  continue to work because the deposit gate falls back to the
  override path until deposits are required by policy.
- Seed adds: 1 manual_stub provider account, 4 deposits across
  statuses (pending / manually_marked_paid / failed / cancelled),
  the deposit-event timeline, and 2 sample webhook envelopes
  (processed + ignored).
- Permissions update is additive — existing roles unchanged.
