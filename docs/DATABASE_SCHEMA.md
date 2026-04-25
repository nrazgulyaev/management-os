# Arconique Management OS — Database Schema

**Status:** v0 Blueprint
**Target:** PostgreSQL 16+ (Supabase) with RLS
**Last revised:** 2026-04-24

This document is the canonical data contract. It describes schemas, tables, key fields, relationships, and implementation notes. Column types are in PostgreSQL form; every table implicitly carries:

- `id UUID PRIMARY KEY DEFAULT uuid_generate_v7()`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` (trigger-updated)
- `deleted_at TIMESTAMPTZ` (nullable — soft delete where relevant)
- `created_by UUID REFERENCES users(id)` where actor matters
- `version INT NOT NULL DEFAULT 1` for optimistic concurrency on financial tables

Unless noted, foreign keys are `ON DELETE RESTRICT`. All tenant-scoped tables have RLS enabled.

Money rule: **all money is stored as minor units (BIGINT) + currency (TEXT, ISO-4217)**. Never `NUMERIC` for money at rest. Computations use the `currency` crate-style helpers in `lib/currency/`.

---

## 0. Schemas

| Schema | Purpose |
|---|---|
| `public` | Application data |
| `audit` | Append-only audit events |
| `integrations` | External sync state (channel cursors, lock tokens) |
| `ai` | AI logs, embeddings, tool executions |
| `ops_internal` | pg-boss queue tables, internal automations |

Extensions: `uuid-ossp`, `pgcrypto`, `pg_trgm`, `pgvector`, `pgaudit`, `pg_stat_statements`, `pg_cron` (Supabase).

---

## 1. Identity, Roles & Permissions

### 1.1 `users`
System-wide identity. Linked 1:1 with `auth.users` (Supabase Auth).

| Column | Type | Notes |
|---|---|---|
| id | UUID | = `auth.users.id` |
| email | CITEXT UNIQUE | |
| full_name | TEXT | |
| phone_e164 | TEXT | E.164 |
| avatar_url | TEXT | Supabase Storage |
| locale | TEXT | `en`, `id` |
| timezone | TEXT | IANA (default `Asia/Makassar`) |
| display_currency | TEXT | `IDR` \| `USD` |
| status | TEXT | `active`, `invited`, `suspended`, `archived` |
| mfa_enforced | BOOLEAN | |
| last_seen_at | TIMESTAMPTZ | |
| pin_hash | TEXT | For staff mobile PIN |
| notes | TEXT | Internal |

### 1.2 `user_types`
Enum-like, but a table for flexibility:
`super_admin, director, operations_manager, property_manager, accountant, concierge, housekeeping_supervisor, housekeeper, technician, procurement_manager, security, investor_owner, guest, vendor, agent`.

### 1.3 `roles`
Named role bundles.

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| code | TEXT UNIQUE | e.g. `finance_manager` |
| name | TEXT | Display |
| description | TEXT | |
| is_system | BOOLEAN | System-defined |

### 1.4 `permissions`
Atomic capabilities.

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| code | TEXT UNIQUE | dotted, e.g. `finance.statement.read` |
| resource | TEXT | |
| action | TEXT | `read`, `write`, `approve`, `execute` |
| description | TEXT | |

### 1.5 `role_permissions` (M:N)
`role_id`, `permission_id`, PK composite.

### 1.6 `user_roles` (M:N with scope)

| Column | Type | Notes |
|---|---|---|
| user_id | UUID | |
| role_id | UUID | |
| scope_type | TEXT | `global`, `project`, `villa`, `owner` |
| scope_id | UUID | Nullable when scope_type = `global` |
| granted_by | UUID | |
| granted_at | TIMESTAMPTZ | |
| expires_at | TIMESTAMPTZ | |

Indexes: `(user_id)`, `(scope_type, scope_id)`.

### 1.7 `api_keys`

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| user_id | UUID | |
| name | TEXT | |
| hashed_token | TEXT | Argon2 |
| scopes | TEXT[] | Permission codes |
| last_used_at | TIMESTAMPTZ | |
| expires_at | TIMESTAMPTZ | |
| revoked_at | TIMESTAMPTZ | |

### 1.8 `sessions_meta`
Minimal metadata (Supabase manages sessions; we store context):

| Column | Type |
|---|---|
| id | UUID |
| user_id | UUID |
| ip | INET |
| user_agent | TEXT |
| device_id | TEXT |
| created_at | TIMESTAMPTZ |
| last_seen_at | TIMESTAMPTZ |

---

## 2. Tenancy: Company, Projects, Villas

### 2.1 `company`
Single-row table (for now). Contains the operator (Arconique).

| Column | Type |
|---|---|
| id | UUID |
| legal_name | TEXT |
| brand_name | TEXT |
| tax_id | TEXT |
| base_currency | TEXT — `IDR` |
| address | JSONB |
| bank_accounts | UUID[] (FK → bank_accounts) |
| settings | JSONB |

### 2.2 `projects`
A "project" = a villa complex (Eternal Villas, Enso Villas, Ahau Gardens).

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| code | TEXT UNIQUE | e.g. `eternal-villas` |
| name | TEXT | |
| status | TEXT | `development`, `soft_open`, `live`, `archived` |
| location | JSONB | `{ area, coords, address }` |
| description | TEXT | |
| brand_assets | JSONB | logo, palette |
| ownership_model_default | TEXT | `individual`, `pooled`, `hybrid` |
| pool_rules | JSONB | weighting, allocation keys |
| reserve_rules | JSONB | default % |
| management_fee_default | JSONB | % or fixed |
| manager_id | UUID | → users |

### 2.3 `villas`

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| project_id | UUID | |
| code | TEXT UNIQUE | e.g. `EV-07` |
| name | TEXT | |
| status | TEXT | Lifecycle (see operations) |
| bedrooms | INT | |
| max_guests | INT | |
| size_sqm | NUMERIC | |
| pool | BOOLEAN | |
| pet_friendly | BOOLEAN | |
| amenities | JSONB | |
| coords | POINT | |
| address | JSONB | |
| default_nightly_rate | BIGINT | IDR minor |
| cleaning_fee_guest | BIGINT | |
| cleaning_cost_internal | BIGINT | |
| ownership_model | TEXT | |
| pool_weight | NUMERIC | For pool allocation |
| base_currency | TEXT | |
| hero_photo_url | TEXT | |
| gallery | UUID[] | → documents |
| internal_notes | TEXT | |
| is_active | BOOLEAN | |

Indexes: `(project_id)`, `(status)`.

### 2.4 `villa_status_events`
Append-only log of status transitions.

| Column | Type |
|---|---|
| id | UUID |
| villa_id | UUID |
| from_status | TEXT |
| to_status | TEXT |
| reason | TEXT |
| actor_id | UUID |
| source | TEXT — `manual`, `booking`, `task`, `maintenance` |
| at | TIMESTAMPTZ |

### 2.5 `units` (optional, for multi-unit villas)
If a project has sub-units rented separately (not typical for Bali villas, but supported).

### 2.6 `rooms` (bedrooms / bathrooms)
For guests-experience and photo tagging.

### 2.7 `villa_guides`
Internal playbook per villa.

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| villa_id | UUID | |
| wifi_ssid | TEXT | |
| wifi_password_enc | TEXT | Encrypted (pgcrypto) |
| quirks | TEXT | e.g. "sliding door sticks" |
| vendor_contacts | JSONB | |
| emergency_info | JSONB | |

---

## 3. Ownership

### 3.1 `owners`
An owner is a legal / natural entity who holds shares.

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| user_id | UUID | → users (optional — not all owners log in) |
| type | TEXT | `individual`, `company`, `family_office` |
| legal_name | TEXT | |
| display_name | TEXT | |
| email | CITEXT | |
| phone_e164 | TEXT | |
| country | TEXT (ISO 3166) | |
| residency | TEXT | Tax residency |
| tax_id | TEXT | |
| kyc_status | TEXT | `pending`, `verified`, `rejected`, `expired` |
| kyc_verified_at | TIMESTAMPTZ | |
| preferred_currency | TEXT | |
| preferred_language | TEXT | |
| payout_method_id | UUID | → payout_methods |
| agent_id | UUID | → owners where type='agent' or separate |
| status | TEXT | `active`, `archived` |
| notes | TEXT | Internal |

### 3.2 `ownership_shares`

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| owner_id | UUID | |
| villa_id | UUID | Nullable if pool-level |
| project_id | UUID | Required for pool shares |
| share_type | TEXT | `villa`, `pool` |
| percentage | NUMERIC(9,6) | 0–100, validated to sum ≤100 per villa/pool |
| starts_on | DATE | |
| ends_on | DATE | Nullable |
| contract_document_id | UUID | → documents |
| notes | TEXT | |

Constraint: exclusion constraint ensuring percentages per `(villa_id)` or `(project_id, share_type='pool')` do not exceed 100% on any date.

### 3.3 `payout_methods`

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| owner_id | UUID | |
| method | TEXT | `bank_idr`, `bank_intl`, `wise`, `stablecoin` |
| bank_name | TEXT | |
| account_holder | TEXT | |
| account_number_enc | TEXT | Encrypted |
| iban | TEXT | |
| swift | TEXT | |
| currency | TEXT | |
| verified | BOOLEAN | |
| default | BOOLEAN | |

### 3.4 `owner_approvals`
Approvals for large expenses, capex, renovations.

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| owner_id | UUID | |
| subject_type | TEXT | `expense`, `capex`, `renovation`, `allocation_change` |
| subject_id | UUID | |
| threshold_breached | BIGINT | amount minor |
| requested_by | UUID | |
| status | TEXT | `pending`, `approved`, `rejected`, `withdrawn` |
| decided_at | TIMESTAMPTZ | |
| decision_note | TEXT | |

---

## 4. Bookings, Guests, Channels

### 4.1 `channels`

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| code | TEXT UNIQUE | `airbnb`, `booking`, `agoda`, `expedia`, `direct`, `agent`, `owner` |
| name | TEXT | |
| commission_type | TEXT | `percent`, `fixed`, `tiered` |
| commission_value | JSONB | |
| payment_model | TEXT | `ota_holds_payment`, `we_collect`, `host_only` |
| is_active | BOOLEAN | |

### 4.2 `guests`

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| full_name | TEXT | |
| email | CITEXT | |
| phone_e164 | TEXT | |
| country | TEXT | |
| date_of_birth | DATE | Nullable |
| id_document | JSONB | Encrypted fields |
| vip_flag | BOOLEAN | |
| preferences | JSONB | Allergies, prefs |
| dedupe_hash | TEXT | Matching hints |
| marketing_opt_in | BOOLEAN | |

### 4.3 `bookings`

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| reference | TEXT UNIQUE | Human code |
| villa_id | UUID | |
| channel_id | UUID | |
| external_id | TEXT | OTA booking id |
| external_url | TEXT | |
| primary_guest_id | UUID | |
| total_guests | INT | |
| check_in | DATE | Bali time |
| check_out | DATE | |
| nights | INT GENERATED | `check_out - check_in` |
| status | TEXT | `inquiry`, `tentative`, `confirmed`, `checked_in`, `checked_out`, `cancelled`, `no_show` |
| booked_at | TIMESTAMPTZ | |
| cancelled_at | TIMESTAMPTZ | |
| cancel_policy | TEXT | |
| nightly_rate_avg | BIGINT | |
| gross_amount | BIGINT | Guest-facing total |
| currency | TEXT | Guest-paid currency |
| fx_to_base | NUMERIC(18,9) | |
| cleaning_fee_guest | BIGINT | |
| extras_amount | BIGINT | Upsells |
| refund_amount | BIGINT | |
| notes_internal | TEXT | |
| stay_token | TEXT UNIQUE | Signed token for guest portal |
| stay_token_expires_at | TIMESTAMPTZ | |
| agent_id | UUID | |
| agent_commission | BIGINT | |

Indexes: `(villa_id, check_in)`, `(status)`, `(external_id)`, exclusion on `(villa_id, daterange(check_in, check_out))` where `status IN ('confirmed','checked_in')` to prevent double-booking.

### 4.4 `booking_guests` (M:N additional guests)

### 4.5 `booking_events`
Lifecycle trail (confirmed, modified, channel update received, etc.).

### 4.6 `upsells_catalog`

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| code | TEXT | |
| name | TEXT | |
| description | TEXT | |
| category | TEXT | `transfer`, `massage`, `chef`, `laundry`, `breakfast`, `scooter`, `driver`, `cleaning`, `other` |
| unit | TEXT | `per_person`, `per_booking`, `per_night`, `per_hour` |
| price | BIGINT | |
| currency | TEXT | |
| supplier_id | UUID | |
| commission_percent | NUMERIC | |
| is_active | BOOLEAN | |

### 4.7 `booking_upsells`
Per-booking purchases: `booking_id`, `upsell_id`, `quantity`, `amount`, `status`, `service_date`.

---

## 5. Finance

### 5.1 `accounts` (Chart of Accounts — simplified)

| Column | Type |
|---|---|
| id | UUID |
| code | TEXT UNIQUE |
| name | TEXT |
| type | TEXT — `revenue`, `expense`, `reserve`, `tax`, `fee`, `payout`, `asset`, `liability` |
| normal_side | TEXT — `debit` \| `credit` |

### 5.2 `revenue_lines`
One line per recognized revenue component of a booking.

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| booking_id | UUID | |
| villa_id | UUID | |
| project_id | UUID | |
| category | TEXT | `nightly`, `cleaning`, `upsell`, `refund`, `penalty`, `adjustment` |
| amount_minor | BIGINT | |
| currency | TEXT | |
| fx_to_base | NUMERIC(18,9) | |
| base_amount_minor | BIGINT | IDR |
| recognition_date | DATE | |
| period | DATERANGE | Canonical accounting period |
| description | TEXT | |
| metadata | JSONB | |

### 5.3 `fee_lines`
OTA, payment, bank, FX, agent, manager commissions.

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| booking_id | UUID | |
| villa_id | UUID | |
| fee_type | TEXT | `ota`, `payment`, `bank`, `fx`, `agent`, `manager`, `other` |
| source_ref | TEXT | Channel / processor ref |
| amount_minor | BIGINT | |
| currency | TEXT | |
| base_amount_minor | BIGINT | |
| recognition_date | DATE | |
| description | TEXT | |

### 5.4 `expense_lines`

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| project_id | UUID | |
| villa_id | UUID | Nullable for pool/company |
| supplier_id | UUID | |
| category | TEXT | `utilities`, `cleaning`, `laundry`, `toiletries`, `staff_allocation`, `maintenance`, `repair`, `capex`, `renovation`, `landscaping`, `pest`, `pool_chemicals`, `other` |
| amount_minor | BIGINT | |
| currency | TEXT | |
| base_amount_minor | BIGINT | |
| incurred_date | DATE | |
| recognition_date | DATE | |
| allocation_key | TEXT | `villa`, `project_pool`, `company`, `shared_custom` |
| allocation_rule_id | UUID | → allocation_rules |
| description | TEXT | |
| receipt_document_id | UUID | |
| purchase_order_id | UUID | |
| approved_by | UUID | |
| metadata | JSONB | |

### 5.5 `allocation_rules`
Immutable, versioned. Historical statements always reference the rule version active at the period.

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| project_id | UUID | |
| effective_from | DATE | |
| effective_to | DATE | |
| basis | TEXT | `per_villa`, `per_share`, `per_revenue`, `custom` |
| weights | JSONB | e.g. `{ villa_id: weight }` |
| description | TEXT | |

### 5.6 `expense_allocations`
How an expense was split into villas after rule application.

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| expense_line_id | UUID | |
| villa_id | UUID | |
| percent | NUMERIC | |
| base_amount_minor | BIGINT | |

### 5.7 `taxes`
PPN, PHR (Bali hospitality tax), withholding, tourism levy.

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| villa_id | UUID | Nullable for company-level |
| tax_code | TEXT | `PPN`, `PHR`, `WHT`, `tourism_levy`, `corporate` |
| base_amount_minor | BIGINT | Taxable base |
| rate | NUMERIC | |
| amount_minor | BIGINT | |
| currency | TEXT | |
| period | DATERANGE | |
| filed_at | TIMESTAMPTZ | |
| filed_reference | TEXT | |
| status | TEXT | `pending`, `filed`, `paid` |

### 5.8 `reserves`
Movements into/out of reserve funds.

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| villa_id | UUID | Nullable for project-level |
| project_id | UUID | |
| reserve_type | TEXT | `renovation`, `ffe`, `operating`, `emergency` |
| amount_minor | BIGINT | +contribution / -use |
| reason | TEXT | |
| recognition_date | DATE | |
| source_expense_id | UUID | |
| source_statement_id | UUID | |

### 5.9 `bank_accounts`

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| holder | TEXT | |
| bank_name | TEXT | |
| currency | TEXT | |
| account_number_enc | TEXT | |
| purpose | TEXT | `operating`, `payout`, `reserve`, `tax` |
| owner_id | UUID | Nullable |
| is_active | BOOLEAN | |

### 5.10 `bank_transactions`
Imported statements for reconciliation.

| Column | Type |
|---|---|
| id | UUID |
| bank_account_id | UUID |
| posted_at | TIMESTAMPTZ |
| amount_minor | BIGINT |
| currency | TEXT |
| description | TEXT |
| external_ref | TEXT |
| reconciled_with_type | TEXT (`revenue`, `expense`, `payout`) |
| reconciled_with_id | UUID |

### 5.11 `payouts`

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| owner_id | UUID | |
| period | DATERANGE | |
| statement_id | UUID | → statements |
| amount_minor | BIGINT | |
| currency | TEXT | |
| payout_method_id | UUID | |
| status | TEXT | `draft`, `approved`, `sent`, `paid`, `failed` |
| sent_at | TIMESTAMPTZ | |
| paid_at | TIMESTAMPTZ | |
| bank_reference | TEXT | |
| failure_reason | TEXT | |

### 5.12 `statements`

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| owner_id | UUID | |
| villa_id | UUID | Nullable if pool-only |
| project_id | UUID | |
| scope | TEXT | `villa`, `pool`, `combined` |
| period | DATERANGE | Monthly typically |
| generated_at | TIMESTAMPTZ | |
| approved_at | TIMESTAMPTZ | |
| approved_by | UUID | |
| published_at | TIMESTAMPTZ | |
| status | TEXT | `draft`, `approved`, `published`, `amended` |
| revenue_total | BIGINT | |
| fees_total | BIGINT | |
| taxes_total | BIGINT | |
| expenses_total | BIGINT | |
| shared_alloc_total | BIGINT | |
| management_fee | BIGINT | |
| reserves_total | BIGINT | |
| net_payout | BIGINT | |
| currency | TEXT | IDR base; display variant stored separately |
| pdf_document_id | UUID | |
| hash_sha256 | TEXT | Immutable hash |
| amended_from_id | UUID | |
| notes | TEXT | |

### 5.13 `statement_lines`
Fully denormalized, human-readable breakdown saved with the statement (so regenerating code cannot change history).

| Column | Type |
|---|---|
| statement_id | UUID |
| display_order | INT |
| section | TEXT — `revenue`, `fees`, `taxes`, `expenses`, `shared`, `reserves`, `fee_mgmt`, `payout` |
| label | TEXT |
| amount_minor | BIGINT |
| drilldown_refs | UUID[] — revenue_line / expense_line ids |

### 5.14 `fx_rates`

| Column | Type |
|---|---|
| date | DATE |
| from_currency | TEXT |
| to_currency | TEXT |
| rate | NUMERIC(18,9) |
| source | TEXT — `xe`, `bi`, `manual` |

PK: `(date, from_currency, to_currency)`.

### 5.15 `invoices` (operator-issued)
Cleanup invoices, long-stay invoices, ad-hoc.

---

## 6. Operations

### 6.1 `tasks`

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| project_id | UUID | |
| villa_id | UUID | Nullable for common-area |
| type | TEXT | `housekeeping`, `maintenance`, `preventive`, `inspection`, `owner_stay_prep`, `inventory`, `other` |
| title | TEXT | |
| description | TEXT | |
| priority | TEXT | `p1`, `p2`, `p3`, `p4` |
| status | TEXT | `new`, `assigned`, `in_progress`, `awaiting_approval`, `approved`, `completed`, `returned`, `cancelled` |
| due_at | TIMESTAMPTZ | |
| sla_due_at | TIMESTAMPTZ | |
| assignee_id | UUID | |
| supervisor_id | UUID | |
| booking_id | UUID | |
| maintenance_ticket_id | UUID | |
| checklist_template_id | UUID | |
| checklist_instance_id | UUID | |
| started_at | TIMESTAMPTZ | |
| completed_at | TIMESTAMPTZ | |
| approved_at | TIMESTAMPTZ | |
| photos | UUID[] | → documents |
| metadata | JSONB | |

### 6.2 `checklist_templates`

| Column | Type |
|---|---|
| id | UUID |
| scope | TEXT — `villa`, `project`, `common_area` |
| type | TEXT — `housekeeping`, `maintenance`, `preventive`, `inspection` |
| name | TEXT |
| items | JSONB — ordered list `{ id, label, requires_photo, requires_note, critical }` |
| is_active | BOOLEAN |

### 6.3 `checklist_instances`
Realized instance for a task. Stores item-by-item results.

| Column | Type |
|---|---|
| id | UUID |
| template_id | UUID |
| task_id | UUID |
| results | JSONB — `{ item_id, passed, note, photo_ids[] }` |
| supervisor_review | JSONB |

### 6.4 `maintenance_tickets`

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| villa_id | UUID | |
| reporter_id | UUID | Staff / guest / AI |
| source | TEXT | `guest`, `staff`, `preventive`, `inspection`, `ai` |
| category | TEXT | `plumbing`, `electrical`, `ac`, `pool`, `structural`, `appliance`, `it`, `other` |
| severity | TEXT | `minor`, `major`, `critical` |
| description | TEXT | |
| priority | TEXT | |
| sla_policy_id | UUID | |
| status | TEXT | `open`, `triaged`, `in_progress`, `waiting_parts`, `resolved`, `closed` |
| opened_at | TIMESTAMPTZ | |
| resolved_at | TIMESTAMPTZ | |
| root_cause | TEXT | |
| resolution_notes | TEXT | |
| cost_estimate | BIGINT | |
| cost_actual | BIGINT | |
| linked_expense_id | UUID | |
| photos_before | UUID[] | |
| photos_after | UUID[] | |

### 6.5 `preventive_schedules`

| Column | Type |
|---|---|
| id | UUID |
| scope_type | TEXT — `villa`, `project`, `common_area` |
| scope_id | UUID |
| name | TEXT |
| cadence | TEXT — cron expression or `monthly/quarterly/annual` |
| checklist_template_id | UUID |
| next_due_at | TIMESTAMPTZ |
| last_completed_at | TIMESTAMPTZ |
| is_active | BOOLEAN |

### 6.6 `damage_reports`

| Column | Type |
|---|---|
| id | UUID |
| villa_id | UUID |
| booking_id | UUID (nullable — guest-attributable) |
| reported_by | UUID |
| item_description | TEXT |
| photos | UUID[] |
| estimated_cost | BIGINT |
| status | TEXT — `reported`, `charged_guest`, `absorbed`, `claimed` |
| linked_expense_id | UUID |

### 6.7 `lost_found`
Item, found_at, villa_id, finder, guest_id (likely owner), status.

### 6.8 `complaints`
Guest complaints with severity, resolution, linked booking, escalation level.

### 6.9 `staff_performance` (materialized view)
Aggregates per staff per month: tasks completed, on-time %, rework, supervisor approval %, photo compliance %, guest rating mentions.

### 6.10 `rotas`
Shifts, staff-on, swap requests.

---

## 7. Inventory & Procurement

### 7.1 `inventory_items`

| Column | Type |
|---|---|
| id | UUID |
| sku | TEXT UNIQUE |
| name | TEXT |
| category | TEXT — `linen`, `toiletries`, `cleaning`, `f_and_b`, `consumable`, `spare_parts`, `equipment` |
| unit | TEXT — `piece`, `set`, `kg`, `liter`, `pack` |
| par_level_default | INT |
| reorder_threshold | INT |
| cost_estimate_minor | BIGINT |
| image_url | TEXT |
| is_active | BOOLEAN |

### 7.2 `inventory_locations`

| Column | Type |
|---|---|
| id | UUID |
| name | TEXT |
| type | TEXT — `warehouse`, `villa`, `vehicle`, `vendor_hold` |
| scope_type | TEXT |
| scope_id | UUID |
| address | JSONB |

### 7.3 `inventory_stock`
Current stock per item × location.

| Column | Type |
|---|---|
| item_id | UUID |
| location_id | UUID |
| quantity | NUMERIC |
| par_level | INT |
| threshold | INT |

PK: `(item_id, location_id)`.

### 7.4 `inventory_movements`

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| item_id | UUID | |
| from_location_id | UUID | |
| to_location_id | UUID | |
| type | TEXT | `receive`, `transfer`, `consume`, `writeoff_damage`, `writeoff_linen`, `return`, `adjust` |
| quantity | NUMERIC | |
| actor_id | UUID | |
| reason | TEXT | |
| task_id | UUID | |
| po_id | UUID | |
| damage_report_id | UUID | |
| at | TIMESTAMPTZ | |

### 7.5 `suppliers`

| Column | Type |
|---|---|
| id | UUID |
| legal_name | TEXT |
| brand_name | TEXT |
| category | TEXT[] |
| contact | JSONB |
| tax_id | TEXT |
| payment_terms | TEXT |
| default_bank_account | JSONB |
| rating | NUMERIC |
| is_active | BOOLEAN |

### 7.6 `purchase_requests`

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| requester_id | UUID | |
| project_id | UUID | |
| villa_id | UUID | Nullable |
| reason | TEXT | |
| items | JSONB | proposed items / qtys / estimate |
| status | TEXT | `submitted`, `approved`, `rejected`, `ordered`, `cancelled` |
| approver_id | UUID | |
| approved_at | TIMESTAMPTZ | |
| po_id | UUID | |

### 7.7 `purchase_orders`

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| number | TEXT UNIQUE | Human |
| supplier_id | UUID | |
| requested_by | UUID | |
| approved_by | UUID | |
| status | TEXT | `draft`, `sent`, `partial`, `received`, `cancelled` |
| currency | TEXT | |
| total_amount_minor | BIGINT | |
| allocation_key | TEXT | default allocation |
| notes | TEXT | |
| sent_at | TIMESTAMPTZ | |

### 7.8 `purchase_order_lines`
Item × qty × unit price × allocation override.

### 7.9 `supplier_invoices` / `receipts`
Document-based; link to expense line.

---

## 8. Documents & Storage

### 8.1 `documents`

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| storage_bucket | TEXT | |
| storage_path | TEXT | |
| filename | TEXT | |
| mime | TEXT | |
| size_bytes | BIGINT | |
| sha256 | TEXT | |
| category | TEXT | `contract`, `invoice`, `receipt`, `photo`, `statement`, `kyc`, `certificate`, `policy`, `guide`, `other` |
| scope_type | TEXT | `villa`, `project`, `owner`, `booking`, `supplier`, `task`, `maintenance` |
| scope_id | UUID | |
| visibility | JSONB | `{ roles: [], users: [], owners: [] }` |
| uploaded_by | UUID | |
| is_confidential | BOOLEAN | |
| retention_policy | TEXT | |
| tags | TEXT[] | |

### 8.2 `document_access_log`
Every view (especially statements and financial docs) is logged.

---

## 9. CRM & Communication

### 9.1 `leads`

| Column | Type |
|---|---|
| id | UUID |
| source | TEXT — `website`, `referral`, `agent`, `meta`, `instagram`, `whatsapp`, `import` |
| type | TEXT — `owner_prospect`, `investor`, `guest` |
| name | TEXT |
| contact | JSONB |
| status | TEXT — `new`, `qualified`, `in_progress`, `proposal`, `won`, `lost`, `archived` |
| owner_manager_id | UUID |
| notes | TEXT |
| utm | JSONB |
| first_contact_at | TIMESTAMPTZ |
| converted_to_owner_id | UUID |

### 9.2 `threads`
Unified-inbox thread across channels.

| Column | Type |
|---|---|
| id | UUID |
| channel | TEXT — `whatsapp`, `email`, `sms`, `telegram`, `instagram`, `webform`, `internal` |
| external_thread_id | TEXT |
| subject | TEXT |
| participants | JSONB |
| linked_booking_id | UUID |
| linked_owner_id | UUID |
| linked_lead_id | UUID |
| assignee_id | UUID |
| status | TEXT — `open`, `pending`, `resolved`, `snoozed` |
| last_message_at | TIMESTAMPTZ |

### 9.3 `messages`

| Column | Type |
|---|---|
| id | UUID |
| thread_id | UUID |
| direction | TEXT — `inbound`, `outbound` |
| sender | JSONB |
| body_text | TEXT |
| body_html | TEXT |
| attachments | UUID[] |
| provider_message_id | TEXT |
| sent_at | TIMESTAMPTZ |
| delivered_at | TIMESTAMPTZ |
| read_at | TIMESTAMPTZ |
| ai_generated | BOOLEAN |

### 9.4 `templates`
Reply templates (EN/ID), per channel.

---

## 10. Access, Keys, Cameras

### 10.1 `access_codes`

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| villa_id | UUID | |
| lock_id | UUID | → access_devices |
| code_hash | TEXT | Never store plaintext after issuance |
| code_hint | TEXT | Last 4 digits for UX |
| purpose | TEXT | `guest`, `staff_shift`, `owner`, `vendor`, `emergency` |
| subject_type | TEXT | |
| subject_id | UUID | |
| valid_from | TIMESTAMPTZ | |
| valid_to | TIMESTAMPTZ | |
| issued_by | UUID | |
| issued_via | TEXT | `manual`, `auto_booking`, `auto_shift` |
| revoked_at | TIMESTAMPTZ | |
| revoked_by | UUID | |

### 10.2 `access_devices`
Smart locks, card readers, gates.

| Column | Type |
|---|---|
| id | UUID |
| villa_id | UUID |
| project_id | UUID |
| type | TEXT — `smart_lock`, `card_reader`, `gate`, `keypad` |
| vendor | TEXT |
| external_id | TEXT |
| location_label | TEXT |
| last_heartbeat_at | TIMESTAMPTZ |
| is_active | BOOLEAN |

### 10.3 `key_assets`
Physical keys.

| Column | Type |
|---|---|
| id | UUID |
| villa_id | UUID |
| label | TEXT |
| serial | TEXT |
| status | TEXT — `in_safe`, `checked_out`, `lost`, `retired` |
| holder_user_id | UUID |
| last_movement_at | TIMESTAMPTZ |

### 10.4 `access_events`
Every code use, every key movement.

| Column | Type |
|---|---|
| id | UUID |
| villa_id | UUID |
| device_id | UUID |
| code_id | UUID |
| key_id | UUID |
| actor_user_id | UUID |
| actor_guest_id | UUID |
| result | TEXT — `granted`, `denied` |
| reason | TEXT |
| at | TIMESTAMPTZ |
| raw | JSONB |

### 10.5 `cameras`

| Column | Type |
|---|---|
| id | UUID |
| villa_id | UUID |
| project_id | UUID |
| location_label | TEXT — no-interior rule enforced at review |
| vendor | TEXT |
| rtsp_url_enc | TEXT |
| resolution | TEXT |
| retention_days | INT |
| privacy_notes | TEXT |
| is_active | BOOLEAN |

### 10.6 `camera_access_rules`
`camera_id`, `user_id_or_role`, `allow`, `effective_window`, `reason`.

### 10.7 `camera_view_log`
Every view of a camera is logged (who, when, reason, duration).

---

## 11. AI

### 11.1 `ai.assistants`
Registry of assistants (see `AI_ASSISTANTS_STRATEGY.md`).

| Column | Type |
|---|---|
| id | UUID |
| code | TEXT UNIQUE — `guest_concierge`, `investor`, `operations`, `finance`, `crm`, `maintenance`, `procurement`, `report_writer` |
| name | TEXT |
| version | TEXT |
| prompt_version | TEXT |
| allowed_roles | TEXT[] |
| tools | TEXT[] |
| is_active | BOOLEAN |

### 11.2 `ai.assistant_events`
Every turn logged.

| Column | Type |
|---|---|
| id | UUID |
| assistant_id | UUID |
| user_id | UUID |
| session_id | UUID |
| request_id | UUID |
| input_text | TEXT |
| retrieval_refs | JSONB — list of `(table, id)` cited |
| tool_calls | JSONB |
| output_text | TEXT |
| provider | TEXT |
| model | TEXT |
| tokens_prompt | INT |
| tokens_completion | INT |
| latency_ms | INT |
| safety_flags | JSONB |
| feedback | JSONB |
| at | TIMESTAMPTZ |

### 11.3 `ai.embeddings`

| Column | Type |
|---|---|
| id | UUID |
| source_type | TEXT — `villa_guide`, `house_rules`, `policy`, `statement_narrative`, `maintenance_playbook`, `supplier_catalog`, `message` |
| source_id | UUID |
| chunk | INT |
| content | TEXT |
| embedding | VECTOR(1536) |
| scope | JSONB — scope keys used at retrieval for RLS alignment |
| updated_at | TIMESTAMPTZ |

Index: IVFFlat on `embedding`.

### 11.4 `ai.tool_registry`
Declarative tools (name, schema, handler, required permission).

### 11.5 `ai.guardrail_incidents`
Flagged incidents: fabrication attempts, policy violations, escalations.

---

## 12. Notifications

### 12.1 `notifications`

| Column | Type |
|---|---|
| id | UUID |
| user_id | UUID |
| owner_id | UUID (nullable — external owners) |
| channel | TEXT — `email`, `push`, `sms`, `whatsapp`, `in_app` |
| category | TEXT — `statement`, `payout`, `task`, `alert`, `message`, `approval`, `ai` |
| title | TEXT |
| body | TEXT |
| link | TEXT |
| payload | JSONB |
| is_read | BOOLEAN |
| sent_at | TIMESTAMPTZ |
| read_at | TIMESTAMPTZ |

### 12.2 `notification_preferences`
Per user / per category / per channel: `allowed`, `quiet_hours`.

### 12.3 `push_subscriptions`
Web Push endpoints.

---

## 13. Audit & Compliance

### 13.1 `audit.events`
Append-only. Never updated, never deleted.

| Column | Type |
|---|---|
| id | UUID |
| at | TIMESTAMPTZ |
| actor_user_id | UUID |
| actor_api_key_id | UUID |
| request_id | UUID |
| ip | INET |
| user_agent | TEXT |
| action | TEXT — dotted (`statement.publish`, `payout.send`) |
| resource_type | TEXT |
| resource_id | UUID |
| before | JSONB |
| after | JSONB |
| diff | JSONB |
| reason | TEXT |
| severity | TEXT — `info`, `warning`, `critical` |

Partitioned by month. Retained 7 years minimum for financial events.

### 13.2 `audit.auth_events`
Sign-in, sign-out, MFA challenges, suspicious logins.

### 13.3 `audit.data_access_log`
Reads of sensitive data (finance, cameras, documents). Sampled for non-sensitive reads.

---

## 14. Integrations State

### 14.1 `integrations.connections`

| Column | Type |
|---|---|
| id | UUID |
| provider | TEXT |
| scope_type | TEXT — `company`, `project`, `villa` |
| scope_id | UUID |
| credentials_enc | TEXT |
| status | TEXT |
| last_sync_at | TIMESTAMPTZ |
| cursor | JSONB |
| error | TEXT |

### 14.2 `integrations.webhook_events`
Inbound events queue for replay / debug.

### 14.3 `integrations.listing_map`
Map our `villa_id` ↔ external OTA listing ids per provider.

### 14.4 `integrations.price_snapshots`
Dynamic pricing input & applied price log.

---

## 15. System / Settings

### 15.1 `settings`
Key-value per scope (`company`, `project`, `user`).

### 15.2 `feature_flags`
Name, rollout %, targeting rules.

### 15.3 `webhooks_out`
Outbound webhooks we publish (for customer integrations).

### 15.4 `pdf_templates`
Names, versions, storage pointer for the React-PDF / Puppeteer templates.

### 15.5 `reports` & `report_runs`
Saved queries, scheduled runs, last results, output document id.

---

## 16. Key Relationships (abridged)

```
projects ─┬─< villas ─┬─< bookings ─┬─< revenue_lines
          │           │             ├─< fee_lines
          │           │             ├─< booking_upsells
          │           │             └─< booking_guests >─ guests
          │           ├─< tasks >─ checklist_instances
          │           ├─< maintenance_tickets
          │           ├─< access_codes >─ access_events
          │           ├─< cameras >─ camera_view_log
          │           └─< documents (scope=villa)
          ├─< ownership_shares >─ owners >─ users
          ├─< allocation_rules >─ expense_allocations >─ expense_lines
          └─< reserves

owners ─┬─< statements >─ statement_lines
        ├─< payouts
        └─< owner_approvals

suppliers ─< purchase_orders >─ purchase_order_lines
procurement_requests ─> purchase_orders
inventory_items >─ inventory_stock >─ inventory_locations
inventory_movements

threads >─ messages
leads  (optionally → owners)

ai.assistants >─ ai.assistant_events
ai.embeddings

audit.events  (everything emits here)
```

---

## 17. Indexing Strategy (selected)

- `bookings(villa_id, check_in, check_out)` — availability queries.
- Exclusion constraint on `bookings(villa_id, daterange(check_in, check_out)) WHERE status IN ('confirmed','checked_in')`.
- `revenue_lines(villa_id, recognition_date)` and `(period)` for statement generation.
- `expense_lines(villa_id, recognition_date)`, `(project_id, recognition_date, allocation_key)`.
- `tasks(status, due_at)` + partial indexes on open tasks.
- `messages(thread_id, sent_at DESC)` for inbox.
- `audit.events(actor_user_id, at)`, `audit.events(resource_type, resource_id, at)`.
- `ai.embeddings(embedding)` IVFFlat.
- Full-text: `tsvector` on guests(full_name), villas(name, code), documents(filename + extracted text).

---

## 18. RLS Policy Approach

For every tenant-scoped table, a `SELECT` / `INSERT` / `UPDATE` / `DELETE` policy is written that references the calling user's roles and scope. Patterns:

- **Owner-scoped read:** `EXISTS (SELECT 1 FROM ownership_shares s WHERE s.owner_id = owner_from_jwt() AND s.villa_id = row.villa_id AND daterange(s.starts_on, s.ends_on) @> CURRENT_DATE)`.
- **Staff project scope:** `EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.scope_type IN ('global','project') AND (ur.scope_id IS NULL OR ur.scope_id = row.project_id) AND ur.role_id IN (...))`.
- **Financial write:** additionally requires `has_permission('finance.write')` (function) and logs an audit event via trigger.

Policies are codified under `lib/db/rls/*.sql`, reviewed per PR, and tested with `pgtap` in CI (impersonate each role, expect allowed/denied matrices).

---

## 19. Triggers & Functions (selected)

- `trg_updated_at` — updates `updated_at` on every row update.
- `trg_audit_write` — for finance / access / ownership tables, captures before/after into `audit.events`.
- `fn_villa_status_transition(p_villa_id, p_from, p_to, p_reason)` — writes `villa_status_events` + updates villa.
- `fn_generate_statement(p_owner_id, p_period)` — orchestrates statement draft generation inside a transaction.
- `fn_allocate_expense(p_expense_id)` — applies the allocation rule version active for the expense date.
- `fn_check_share_sum` — deferred constraint that verifies shares per villa/pool never exceed 100% on any date.
- `fn_lock_closed_period(p_date)` — blocks writes to revenue/expense rows with `recognition_date` in a closed period unless an override flag is set by an authorized user.

---

## 20. Data Retention & PII

| Data | Retention | Notes |
|---|---|---|
| Audit events (financial) | 7 years | Legal |
| Audit events (non-financial) | 2 years | |
| Camera recordings | 30 days default, configurable | Privacy |
| Camera view log | 2 years | |
| Guest PII (passport scans) | 1 year after stay, then purge | Unless legal hold |
| Messages | 3 years | Unless involved in dispute |
| AI assistant events | 1 year; 90 days for high-sensitivity | |
| Soft-deleted rows | 30-day recovery | Then hard-purge |

PII encryption: `id_document`, `code_hash`, `wifi_password_enc`, `account_number_enc` use `pgcrypto` symmetric encryption with keys held in Supabase Vault.

---

## 21. Seeding (v0 → v1)

The initial seed includes:
- Company (Arconique) and three projects (Eternal Villas, Enso Villas, Ahau Gardens).
- Villas per project with real codes and base configs.
- Channels: Airbnb, Booking.com, Agoda, Expedia, Direct, Agent.
- Roles + permissions matrix (see `USER_ROLES_AND_PERMISSIONS.md`).
- Checklist templates for housekeeping and maintenance.
- Upsells catalog (transfer, massage, chef, laundry, scooter, driver, breakfast, private cleaning).
- Tax codes (PPN 11%, PHR 10% — configurable).
- Default allocation rules per project.

Seed is idempotent (ON CONFLICT DO NOTHING on deterministic codes) and runs in `pnpm db:seed`.
