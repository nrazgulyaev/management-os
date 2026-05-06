# ADR-0026 — Service Fulfilment & Vendor Ops (Prompt 103)

## Status
Accepted. Implemented in migration `0025_service_fulfilment_vendor_ops.sql`
plus the `src/features/service-fulfilment/*` module, the
`/dashboard/service-fulfilment/*` admin surface, the new guest
order-detail pages under `/stay/[token]/services/orders[/id]`, and the
vendor portal at `/vendor/service/[token]`.

## Context
The `guest_service_orders` table — introduced in v9F — already captures
*what* a guest asked for, *what we'll charge*, and *what we paid* (catalog
defaults). It does NOT capture the operational follow-through: which
vendor we routed it to, when it's actually scheduled, what the vendor
quoted on the day, when they confirmed, when the guest confirmed, when
the ETA was last updated, and what the guest thought after delivery. Nor
does it cover vendor invoices and the resulting pair of revenue +
expense rows in finance.

We want all of that without duplicating the order itself, without
breaking the existing in-portal services flow, and without letting the
new vendor portal see anything beyond the specific request it's been
issued a token for.

## Decision

### 1. Fulfilment is a separate row from the order
A new `guest_service_fulfilments` table sits 1:1 next to
`guest_service_orders`. The order keeps its catalog price, internal
cost default, status (`requested → confirmed → fulfilled → ...`), and
the original v9F finance bridge. The fulfilment row is the operational
overlay: assigned vendor, schedule, ETA, quote, internal cost on the
day, vendor-confirmed-at, guest-confirmed-at, and a richer status set
(`new / triage / awaiting_vendor / vendor_confirmed / guest_confirmed /
scheduled / in_progress / completed / cancelled / failed / no_show`).
Idempotency anchor: UNIQUE on `order_id` — every order has at most one
fulfilment.

### 2. Vendor-safe projection
`buildVendorSafeFulfilmentView` is the single seam for the vendor
portal. By construction it returns a fixed shape that contains:
fulfilment code, service name, schedule, ETA, masked guest label
(`maskGuestName`, e.g. `"Emma W."`), guest count, optional guest note,
and villa label + service area.

It NEVER returns guest emails, guest phones (default), owner identity,
margin, internal notes, vendor quotes from other vendors, lock codes,
Wi-Fi, token hashes, or any other booking the villa has had. Phone is
gated behind an explicit `allowGuestContact: true` argument so an admin
must opt in per fulfilment — the demo defaults to `false`.

### 3. Request-to-confirm services
`guest_services.requires_admin_confirmation` (existing) flows through:
the fulfilment is created in `triage` status with
`requires_guest_confirmation = true`. Our concierge has to actively
move the row through `awaiting_vendor → vendor_confirmed →
guest_confirmed → scheduled` — the guest sees `Pending confirmation`
the entire time, never `awaiting_vendor` or any internal state. We
never auto-confirm a request-to-confirm service.

### 4. Finance bridge rules
`bridgeFulfilmentToFinance(fulfilmentId)`:
- Fulfilment must be `completed`. Otherwise no-op.
- `(guestPriceMinor, internalCostMinor) = (0, 0)` →
  `skipped_no_amount`.
- Service-date period locked → `skipped_locked_period`. Operators can
  backfill via finance adjustments after the period reopens.
- Otherwise: writes one `revenue_lines` row (source =
  `guest_service_fulfilment`, sourceReference = fulfilment code) for
  the guest price and one `expense_lines` row for the internal cost.
  `allocationScope` defaults to `booking` when present, else `villa`.
- Idempotency anchor: `service_fulfilment_finance_links.fulfilment_id`
  UNIQUE. Re-running a bridged row returns `skipped_already_bridged`.
- Reversal is logical: we mark the link `reversed` and write a
  compensating event. Existing finance rows stay because the finance
  ledger is append-only.

This is intentionally separate from the v9F order-level bridge, which
writes a `revenue_lines` row only — fulfilments need both legs because
they're the layer that knows the vendor cost.

### 5. Invoice handling
`service_vendor_invoices` is the canonical record of vendor cost.
Invoices can be submitted via the vendor portal (`/vendor/service/[token]/invoice`)
or entered manually in the admin. State machine: `draft → received →
approved | rejected | paid`. Document upload is deferred (the
`documents` linkage column is in place, but the upload flow rides on
the existing v9K storage hardening so we'll wire it in Prompt 104+).

### 6. Guest rating
After completion, the stay portal renders a 1–5 star form with optional
comment and sentiment. Ratings are unique on `(fulfilment_id,
stay_token_id)` — each guest token can rate the same fulfilment exactly
once; submitting twice updates the existing row. The vendor's average
rating + count auto-recalculate from the published rows after each
submission.

### 7. Privacy contract enforced at multiple seams
- DB: every new table is `FORCE` RLS, internal-only policies. Vendor
  and guest access flow through token-gated server actions; PostgREST
  has no public surface here.
- Pure layer: `buildVendorSafeFulfilmentView` strips by construction.
- UI: the admin order-detail panel shows margin / vendor quote /
  internal cost; the guest-side detail page never references those
  identifiers (covered by the static source-grep test).
- Permission matrix: investor roles are excluded from every
  `service_*` permission; field roles too. Only `concierge`,
  `property_manager`, and the manager / director set get dispatch
  rights. Finance bridge is gated behind `service_fulfilment.finance_bridge`
  which only finance / accountant / director / super_admin hold.

### 8. What is deferred
- Document upload for vendor invoices (the schema accepts
  `document_id`, but the upload flow is queued for Prompt 104).
- Real WhatsApp / Telegram dispatch — channel default stays `in_app`
  until provider + consent infra ships.
- Vendor SLA scoring beyond the simple rating average.
- Vendor payouts / reconciliation. Our finance bridge writes the
  expense leg; payment runs are a separate workflow.
- Smart-lock / OTA REST integrations.
- AI write tools for vendor briefings.

## Consequences
- Every non-trivial seam (status transitions, pricing math, vendor
  token format, projection) is testable as a pure function. The
  test suite proves idempotency + privacy without touching Postgres.
- Adding a new vendor type or service mapping is an `INSERT` into
  `service_vendors` + `service_vendor_services`; no code change.
- Finance reports stay honest: a completed fulfilment without a vendor
  invoice still produces revenue + expense rows because the internal
  cost is captured on the fulfilment row itself; the vendor invoice
  is the *paper trail*, not the *cost source*.

## Roll-out
- Migration `0025` is forward-only.
- Seed adds 8 vendors, 4 vendor↔service mappings, 5 demo
  fulfilments across statuses (triage / awaiting_vendor /
  vendor_confirmed / completed / scheduled), 2 vendor invoices, 2
  guest ratings, 1 bridged finance link.
- Permissions: `service_vendor.{read,write}`,
  `service_fulfilment.{read,write,dispatch,finance_bridge}`,
  `service_invoice.{read,write}`, `service_rating.{read,manage}`.
