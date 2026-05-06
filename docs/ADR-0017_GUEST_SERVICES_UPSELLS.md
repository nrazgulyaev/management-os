# ADR-0017 — Guest Services Catalog & Upsell Revenue Foundation (v9F)

Status: Accepted · 2026-04-28

## Context

V9E shipped the production guest stay surface: token-gated `/stay/[token]`,
editable villa-guide content, smart-lock stub, and a free-text concierge
form that posted into `service_requests`. That free-text form was a
launch-day MVP — it solved "the guest can ask for anything," but it did
not solve "the guest can buy a known thing at a known price."

V9F adds the production upsell surface:

- An editable **catalog** of guest services with pricing, options, and
  villa / project / global scoping.
- A guest-side **request flow** at `/stay/[token]/services` that pulls
  the catalog through the existing token gate, lets guests pick options
  + dates + quantities, and submits a structured order.
- An admin **lifecycle** at `/dashboard/guest-services/orders/[id]`:
  `requested → reviewing → confirmed → scheduled → fulfilled` with
  `cancelled` / `rejected` absorbing terminals.
- A **finance bridge** that posts a `revenue_lines` row when an order
  is fulfilled, idempotent on `guest_service_finance_links.order_id`.
- Internal-cost + margin tracking at the catalog row, the option, and
  the order — never exposed to guests.
- Notification queue fan-out to the `concierge` and `property_manager`
  roles on every transition (best-effort, deduped).

Hard guardrails:

- **No real payment processing.** No Stripe, no Xendit, no auto-charge.
- **No exposing supplier costs.** `internal_cost_minor` and
  `margin_minor` are admin-only.
- **No new guest auth.** The existing stay-token resolution is the
  only credential.
- **No breaking `/stay/demo` or `/stay/[token]`.** The catalog
  upgrade lives next to the existing concierge form, not over it.

## Decisions

### 1. Six new tables, all internal-only

```
guest_service_categories          ← top-level grouping
guest_services                    ← catalog rows, scoped (global / project / villa)
guest_service_options             ← option deltas (60/90 min, 3/4 course)
guest_service_orders              ← per-guest orders w/ lifecycle + price
guest_service_order_events        ← append-only timeline
guest_service_finance_links       ← idempotency anchor for the bridge
```

Each is `ENABLE` + `FORCE ROW LEVEL SECURITY` with an `internal_read`
policy. `guest_service_orders` and `guest_service_finance_links` get
explicit `internal_write` policies on top — write-sensitive surfaces
where we want belt-and-braces. The guest portal never reads or writes
these tables through an authenticated guest session: the server route
validates a stay token first, then uses the service-role client to
apply changes. RLS is the hard line at the DB layer.

### 2. Money rule

Every monetary column is `BIGINT` minor units paired with a `currency`
text column. Display-time conversion is the renderer's job. Internal
cost stays on the order row + the catalog row — it never leaves the
admin surface. Margin is computed as `guest - internal` and stored on
the order for analytics; the value is `NULL` when internal cost is
unknown.

### 3. Catalog scoping (villa-first → project-fallback → global)

A catalog row's scope is `(project_id, villa_id)`:

- `(NULL, NULL)` → global (offered to every stay).
- `(project, NULL)` → all villas in the project.
- `(NULL, villa)` → that specific villa only.
- `(project, villa)` → that villa only (project is informational).

Resolution to a single guest stay picks the **most specific** row per
`service_key`. A villa-scoped row REPLACES any project- or
global-scoped row with the same key. This lets operators ship a
high-end S2-only chef rate next to the global one without forking the
catalog.

The partial unique index uses `COALESCE(uuid, '00000000-…')` to enforce
"at most one non-archived row per (project, villa, service_key)."
PostgreSQL otherwise treats NULLs as distinct in a unique index.

### 4. Pricing models

Seven supported, all enforced by CHECK constraint and exhaustive in
`pricing.ts`:

```
fixed             base × quantity
per_item          base × quantity
per_day           base × quantity (quantity = days)
per_person        base × guestCount × quantity
per_hour          base × hours × quantity
free              0
quote_required    0 (and `quoteRequired: true`)
```

Option deltas are added per-unit and multiplied by the same multiplier
as the base price, so a $5/person breakfast option for 3 people is
applied 3×.

`quote_required` orders enter `requested` with `guest_price_minor = 0`.
The operator can override the price on transition via
`guestPriceMinorOverride` in `transitionOrderAction`. Admins are
permitted to override price + cost on any transition (e.g. discount
for a regular guest), so the order row remains the source of truth.

### 5. Lifecycle

```
requested → reviewing → confirmed → scheduled → fulfilled
                ↘            ↘          ↘
              cancelled    cancelled   cancelled
                ↘            ↘
              rejected     rejected
```

`fulfilled`, `cancelled`, `rejected` are absorbing terminals. The
status machine is pure (`status.ts`) and unit-tested. The finance
bridge fires once on entering `fulfilled` and never fires from any
non-fulfilled state (`shouldFinanceBridge`).

### 6. Finance bridge

`bridgeOrderToFinance(orderId)`:

1. Order must be `fulfilled`. Otherwise no-op.
2. If `guest_price_minor === 0` → `skipped_no_charge`. We still
   record a finance link row so the admin sees an explicit answer.
3. If the service date is inside a `closed` or `locked` accounting
   period → `skipped_locked_period`. Operators must reach for a
   finance adjustment instead of bridging.
4. Otherwise insert a `revenue_lines` row with
   `revenue_type = 'guest_service'`, `source = 'guest_service_order'`,
   `source_reference = order_code`. Update the order's
   `linked_revenue_line_id` and `finance_bridge_status = 'bridged'`.
5. The finance link row (`guest_service_finance_links`) is the
   idempotency anchor — `UNIQUE (order_id)`. Re-bridging a bridged
   order is a no-op.

We deliberately **do not** post `expense_lines` for the internal cost.
Internal cost stays on the order row and rolls up through the catalog
analytics views (added in v9G if needed). Posting both sides would
double-count and obscure the platform's COGS narrative.

### 7. Order code mint

Format: `GSO-YYYYMMDD-NNNN`. Day-counter sourced via
`nextGuestServiceOrderCounter()` (a local helper kept inside the
guest-services module to avoid widening the operations.nextDailyCounter
signature).

### 8. Permissions

Seven new keys, owners + agents excluded everywhere:

```
guest_services.read              concierge, finance, ops, …
guest_services.write             ops, property_manager, concierge
guest_services.manage            ops, property_manager (catalog admin)
guest_service_orders.read        concierge, finance, ops
guest_service_orders.write       ops, property_manager, concierge
guest_service_orders.fulfill     adds housekeeping_supervisor
guest_service_orders.finance_bridge  finance_manager + ops only
```

`finance_bridge` is the narrowest — the bridge can post into the
ledger so we keep it to the finance team + operations leadership.

### 9. Notifications

`notifications.ts` queues an in-app notification to `concierge` and
`property_manager` on:

- Order created.
- Confirmed / scheduled / fulfilled / cancelled / rejected.

`reviewing` is intentionally quiet — it's an internal triage state.
Each notification carries a deterministic `dedupeKey` of the form
`gso_<event>:<orderId>:<role>` so a flapping admin re-transition
never floods the inbox.

### 10. Optional `operation_tasks` link

The order has an `operation_tasks` FK (`linked_operation_task_id`)
left null in v9F. v9G can wire it up so housekeeping / drivers see a
fulfilment task in their existing inbox. We didn't ship it now to
keep v9F focused on the catalog + lifecycle + revenue path.

## Trade-offs

- **No payment integration**. v9F handles "guest asked for and got
  this service" through to revenue posting. Collection lives offline
  for now (concierge takes the payment). v9G can layer Stripe /
  Xendit on top without changing the storage shape.
- **No tax / fee modelling**. `guest_price_minor` is the all-in price
  shown to the guest. The finance bridge writes that single number
  to `revenue_lines`. v9G splits net + tax + fees into `fee_lines`
  if required.
- **No supplier model**. Internal cost is a number, not a supplier
  invoice. v9G can introduce a supplier table + match `expense_lines`
  to a fulfilled order; v9F stays on per-order COGS.
- **Quote workflow is manual**. `quote_required` orders enter at
  guest_price=0; operators quote a price in the transition form. A
  fancier "quote sent → guest accepts" loop is deferred.
- **Image upload missing**. The catalog's `image_url` is a URL field;
  upload + storage live with v9G's media layer.

## Out of scope (deferred)

- Real payment + refund flow.
- Supplier invoicing / matching expense lines to fulfilled orders.
- Owner-portal exposure of guest-service revenue.
- WhatsApp / Telegram inbound from the catalog.
- AI concierge runtime (price suggestions, upsell recommendations).
- Public marketing surface for the catalog (not in `(guest)`).

## Operational runbook

- **Apply migration**: `npm run db:migrate` (idempotent).
- **Seed sample data**: `npm run db:seed` adds:
  - 7 categories, 12 catalog services (10 global, 1 project-scoped,
    1 villa-scoped override).
  - 8 service options (massage, chef menus, transfer pickup vs
    dropoff).
  - 4 sample orders bound to the existing Enso S2 demo booking — one
    `requested` daily breakfast, one `confirmed` couple massage, one
    `fulfilled` airport transfer (already bridged into
    `revenue_lines`), and one `requested` quote-required cruise.
  - Six `guest_service_order.*` notification templates.

  Visit `http://localhost:3000/stay/arconique-v9e-demo-stay-token-aaaaaaaaaaaaaaaaaaaaaaaa/services`
  to walk through the guest catalog + order modal.

- **Issue an order from the admin side**: not supported — orders
  originate from the guest portal (or seed). Admin can override price
  + cost, assign, transition, add notes, and trigger the bridge.

- **Bridge retry**: `/dashboard/guest-services/finance-bridge` lists
  pending + locked-period rows. Open one and use "Retry bridge."

- **Edit catalog**: `/dashboard/guest-services/catalog` (search +
  status filter) and `/dashboard/guest-services/catalog/[id]` (with
  inline option editor).
