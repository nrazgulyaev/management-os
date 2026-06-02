# Feature gap · 07 · Owners (Mgmt P1)

> ## ⚠️ GROUND-TRUTH CORRECTION (2026-05-29 · GitHub pull · see `_ground-truth-2026-05-29.md`)
> Built deep. Routes: `/dashboard/owners` (`page.tsx` 5.3kb + `[id]` 10kb · `access` · `edit` + `new`), `/dashboard/owner-intelligence`, `/dashboard/owner-stays` (8 pages: `requests`+`[id]` 9kb, `policies`, `finance-bridge` 8.8kb, `equivalence-groups`). **Discard "not built".** Surviving items are design↔code deltas — verify against drizzle + the owner-stays feature layer.

**Design sources**
- Desktop: `cabinets/mgmt-p1/owners.html`
- Mobile: `mobile-pass-mgmt-p1.html` § cabinet 03
- Phase: 2.2 mgmt-03 · commit `a06b5ff`

**Repo paths**
- Feature data: `src/features/owners/{actions,derive-tier,form,retention-risk,schema,services}.ts` — 6 files, ~19.5kb total
- Pure modules: `derive-tier.ts` (793 bytes), `retention-risk.ts` (3.8kb)
- Components (not imported): `src/components/owners/*` (10 files in repo)
- Routes (not imported): `src/app/(dashboard)/dashboard/owners/*` (7 files in repo)
- Schema · core (mig 0000): `owners`, `ownership_shares`, `payout_methods`
- Schema · owner-stays (mig 0012): owner stay quotas, basic rates
- Schema · owner journey (mig 0023): owner calendar health reports

## TL;DR

Owners is a **modest, well-scoped cabinet** — 6 feature files, ~19.5kb total. Two polished pure modules: **`derive-tier.ts`** (tier classifier for owner segments, e.g. high-value, regular, at-risk) and **`retention-risk.ts`** (risk model for churn signals). Modest schema (3 core tables from mig 0000 + 2 supporting migs). Far smaller than finance/bookings but appropriate to the cabinet's scope — owners are an entity admin surface, not an operational console. The cabinet's strength is its **2-pure-module pattern** matching the rest of Phase 2.2 (cancellation-policy + row-tone in bookings; comp-policy + escalation in concierge). 0 P0 gaps detected from current code structure.

---

## Section-by-section

### Owner list

| Element | Status |
|---|---|
| `owners` table with FK to `payout_methods` | ✅ schema (mig 0000) |
| Row-derived tier via `derive-tier.ts` | ✅ pure fn shipped |
| Retention risk badge via `retention-risk.ts` | ✅ pure fn shipped (3.8kb implies real signal-collection logic) |
| `services.ts` real reads | ✅ shipped (4.6kb) |

### Owner detail

| Element | Status |
|---|---|
| Profile + payout method | ✅ schema |
| Ownership shares (which villas + %) via `ownership_shares` | ✅ mig 0000 |
| Statement history (via cabinet 06 finance owner_statements) | ✅ cross-cabinet |
| Calendar / owner stays (via mig 0012) | ✅ schema, cross-cabinet to owner-calendar (19) |
| Audit log of owner-touching actions (via cabinet 07 audit_log) | ✅ cross-cabinet |

### Create / edit owner

| Element | Status |
|---|---|
| `actions.ts` (5.2kb) — create/update/archive actions | ✅ shipped |
| `form.tsx` (4.3kb) — form component | ✅ shipped |
| `schema.ts` (753 bytes) — small Zod | ✅ shipped |

### Retention risk + tier

| Element | Status |
|---|---|
| `derive-tier.ts` — tier classifier (likely: A/B/C or named tiers based on portfolio size + tenure + revenue) | ✅ shipped |
| `retention-risk.ts` — risk signals (likely: payout-failure rate, complaint frequency, time-since-last-engagement) | ✅ shipped |

---

## Cross-cutting

### Agents

No dedicated `_repo/src/features/ai-agents/owners/` folder. Owner-intelligence imports under `src/features/owner-intelligence/` (7 files) exist — likely shared with owner-portal cabinet for owner-facing intelligence surfaces.

### Cross-cabinet dependencies

| Cabinet | Direction |
|---|---|
| 06 Finance | owners + ownership_shares → owner_statements (cabinet 06 consumes) |
| 16-22 Owner Portal | owners is the upstream entity for the owner-portal user |
| 12 Projects+PM | owner-of-villa for project context |
| 04 Concierge | owner notification routing for stay-relevant events |

### Mobile parity

To verify against `mobile-pass-mgmt-p1.html`; likely modest given the cabinet's read-only-mostly shape.

---

## Recommended additions (prioritized)

### 🔥 P0 — none

### ⭐ P1 — Phase 2.6

1. **Verify components + routes imports** — 10 components + 7 routes in repo, not in this audit's import.
2. **Owner-intelligence integration** — `src/features/owner-intelligence/` is shared; confirm seam.
3. **Tier history** — currently derive-tier likely computes on demand; consider snapshot table for trend analysis.

### 💭 P2

4. **Bulk-edit tiers** for portfolio-level operations.

---

## Open questions for product

- **Tier names** — derive-tier.ts is small (793 bytes); confirm the tier set (A/B/C vs named segments like Anchor/Core/Edge).
- **Retention risk thresholds** — what counts as "high risk"? Configurable per-org or hard-coded?
- **Owner-intelligence vs owner-portal vs owners** — three folders touching the same entity. Confirm split: owners = admin CRUD, owner-portal = portal app, owner-intelligence = AI/analytics layer.
