# Staff & service-cost model — design (2026-06-11)

> Extends the basic payroll module (PR #220) into a two-axis staff-cost model for villa-complex
> operations, grounded in Bali/Indonesia villa-management reality (research + code audit in the
> staff-cost-model-analysis run). Founder decisions: full accounting (management-borne → company P&L
> **and** staff report; owner-borne → owner statement); comp modes = salaried + **per-villa-fixed** +
> per-service + shared-pool.

## The core insight: two orthogonal axes (which #220 conflated)

**Axis 1 — Compensation mode** (how the monthly cost is computed):
| mode | formula | example |
|---|---|---|
| `salaried` | flat monthly amount | dedicated manager, housekeeper, guard, cook (≥ UMK floor) |
| `per_villa_fixed` | rate × number of assigned villas | pool tech / gardener: fixed per villa, one person serves N villas |
| `per_service` | variable, posted per occurrence (not in the monthly run) | turnover cleaning, repair call, transfer — often guest-charged |

**Axis 2 — Cost bearer** (who actually pays, *independent* of which villa/complex it's attributed to):
| bearer | effect | who |
|---|---|---|
| `owner` | itemised on the owner's statement at cost, **reduces net payout** | on-site villa-specific staff: dedicated manager, housekeeper, villa pool/garden/security, laundry, repairs |
| `management` | absorbed by the company; **does NOT reduce owner payout**; appears as a cost in the **company P&L** (reduces management margin) | head-office: portfolio manager (multi-complex), concierge/guest-relations, bookkeeper, marketing, software, maintenance coordination |
| `shared_pool` | apportioned across the owners of a complex (per villa), like a service charge / banjar | shared complex security/garden/roads, communal pool |

**Bali rule (3+ sources):** the test is the *output*, not the title — what the owner is itemised and re-billed for at cost = owner-borne; what the company funds from its 13-20% fee and does not line-item = management-borne. The same role can land on either side by dedication (manager on one villa = owner; manager on 30 villas = management). Re-billing a service the commission already covers = "double-dipping".

## Preset roles (editable defaults)

| role | default comp_mode | default bearer |
|---|---|---|
| Villa/estate manager (dedicated) | salaried | owner |
| Portfolio/operations manager (multi-complex) | salaried | management |
| Housekeeper / cleaner | salaried | owner |
| Pool technician | per_villa_fixed | owner |
| Gardener / landscaper | per_villa_fixed | owner |
| Security guard (villa) | salaried | owner |
| Security (complex) | salaried | shared_pool |
| Maintenance technician / handyman | per_service | owner |
| MEP engineer (oversight) | salaried | management |
| Front-office / concierge | salaried | management |
| Driver (dedicated) | salaried | owner |
| Laundry | per_service | owner |
| Chef / cook (dedicated) | salaried | owner |
| Accountant / bookkeeper | salaried | management |
| IT / network | per_service | management |

## Data model

`staff` (extend): add
- `comp_mode` text NOT NULL default 'salaried' CHECK in (salaried, per_villa_fixed, per_service)
- `cost_bearer` text NOT NULL default 'owner' CHECK in (owner, management, shared_pool)
- `per_villa_rate_minor` bigint NULL (used when comp_mode='per_villa_fixed'; `monthly_rate_minor` stays for salaried)
- keep `monthly_rate_minor`, `currency`, `active`. `allocation_scope`/`villa_id`/`project_id` become **fallback** for single-target staff; multi-target uses the new join table.

`staff_assignments` (NEW): `id, organization_id, staff_id FK, villa_id NULL, project_id NULL, weight numeric default 1, active, created_at` — one staff → N villas/complexes. per_villa_fixed cost = `per_villa_rate_minor × count(active assignments)`; fan-out posts one expense line per assignment.

`expense_lines` (extend): add `cost_bearer` text default 'owner' (decoupled from `allocation_scope`, which stays as the geographic target). This is the column that lets a *villa-attributed* cost be management-borne.

## Posting (Run payroll for `<month>`)

For each active staff member, by comp_mode:
- `salaried` → one line of `monthly_rate_minor`, attributed to its single target (villa/project/company) per assignments (or fallback scope).
- `per_villa_fixed` → one line **per active assignment** of `per_villa_rate_minor` (× weight), each attributed to that assignment's villa/project.
- `per_service` → **skipped** in the monthly run (these are posted ad-hoc via charges/expenses).

Each posted `expense_lines` row carries `cost_bearer` from the staff member. `owner_chargeable = (cost_bearer === 'owner' || 'shared_pool')`. Idempotent per (org, month). Period-lock respected.

## Statement + P&L integration (the fixes)

1. **owner-borne reaches BOTH statement generators.** Today the cron/production path (`statement-generation.ts`) reads `dev_transactions` and ignores `expense_lines`, so payroll costs never hit monthly statements. Fix: the production path must also pull owner-chargeable `expense_lines` (villa-attributed + `cost_bearer` in owner/shared_pool) for the period, share-split per ownership, and deduct from net payout — matching the manual generator (`statement-generator.ts`).
2. **shared_pool** lines apportion across the complex's owners per villa (not silently dropped for individually-owned villas).
3. **management-borne → company P&L.** Lines with `cost_bearer='management'` (incl. villa-attributed ones) are summed into a **management P&L / company-margin report**: `management commission earned − management-borne costs = company net margin`. They never touch owner payout. Also listed in the staff/payroll report.
4. **fixed-per-villa is NOT share-split below 100%** unless co-owned: a per_villa_fixed line is the full per-villa amount; share-split still applies for co-owned villas (each co-owner bears their %) — consistent with how a real per-villa cost is shared by co-owners.

## Out of scope (this pass)
- Effective-dating / mid-month proration of rate changes (every active staff posts full month).
- Per-service automation (stays ad-hoc via existing charges/expenses).
- Indonesian payroll statutory (BPJS/PPh21) withholding — future tax pass.
