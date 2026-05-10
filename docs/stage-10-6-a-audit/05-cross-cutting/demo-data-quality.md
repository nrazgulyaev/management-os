# 05 — Cross-cutting / Demo data quality audit

**Operator request**: "максимально заполнить демо-данными" — every
section should have rich, realistic demo data so cabinets render
populated, dashboards show real numbers, and the customer-launch
demo experience feels alive.

**Method**: cross-reference production sweep results (USABLE pages
that nonetheless render empty states like "No villas yet" / "No
snapshots yet" / "Nothing pending") with the existing seed scripts
in `scripts/`.

---

## Existing seed infrastructure

| Script | Scope | Last touched (heuristic) |
|---|---|---|
| `scripts/seed.ts` | Mgmt OS data — villas, projects, owners, bookings | Stage 4-5 |
| `scripts/seed-dev-os.mjs` | Dev OS data — projects, transactions, vendors | Stage 6 |
| `scripts/seed-production-minimal.ts` | Bare-minimum production seed (single org, one user) | Stage 8 |
| `scripts/demo-rebuild.ts` | Tear down + reseed Mgmt OS demo | Unknown |
| `scripts/generate-sample-invoices.ts` | Sample invoice generator | Stage 6 |
| `scripts/validate-demo-data.ts` | Demo-data integrity check | Unknown |

**Gap**: no script targets the audit-bot org specifically. Production
audit-bot org has zero application data → empty cabinets, empty
dashboards, empty alerts.

---

## What's empty in production for audit-bot org

Cross-referenced from CHECKPOINT 2 + 3 cabinet screenshots:

| Surface | Empty state copy | Required seed data |
|---|---|---|
| Owner cabinet `/dashboard/owner` | "No villas yet — When ownership shares are linked..." | `villas` + `ownership_shares` linked to audit-bot user |
| Owner cabinet alerts | "Nothing pending" | `villa_health_snapshots` + `guest_reviews` (negative samples) |
| Front Office | (renders fine) | `bookings` arriving today + `villa_readiness_states` |
| CFO cabinet | "No snapshots yet — daily executive metrics cron..." | `executive_metrics_snapshots` (or trigger cron) |
| CFO recent transactions | (would be empty) | `dev_transactions` |
| PM cabinet | "No active projects yet" | `projects` + `qa_qc_issues` + `risk_register` |
| PM at-risk | (empty) | populated from above |
| Sales cabinet | "All quiet on the pipeline front" | `leads` + `sales_conversation_threads` for audit-bot manager |
| Sales weekly snapshot | (empty) | `manager_performance_metrics` |
| Marketing cabinet | (empty) | `content_pieces` + `campaigns` + `leads` (week-recent) |
| Procurement cabinet | (empty) | `dev_os_purchase_requests` + `procurement_quotations` + `material_purchase_orders` |
| QS cabinet | "No BOQs" | `boq_documents` |
| Warehouse cabinet | (empty) | `dev_os_inventory_items` + `dev_os_inventory_movements` |
| Site Supervisor cabinet | "No reports filed yet" | `site_reports` + photos |
| Maintenance Plans page | (likely empty) | `maintenance_templates` + `villa_maintenance_plans` |
| Wi-Fi credentials | (likely empty) | `villa_wifi_credentials` |
| Owner intelligence reviews | (likely empty) | `guest_reviews` |
| AI agent outputs (per cabinet AI tile) | All show "No output yet" | `agent_outputs` rows per agent + invocation log |

---

## Cross-references intact?

Demo data must respect FK chains: bookings → villas → projects;
owners → ownership_shares → villas; service_orders → service_requests
→ villas; etc. The existing `seed.ts` scripts respect these — but
they target `ARCONIQUE_DEFAULT` org (the bootstrap tenant), not the
audit-bot org.

If the audit-bot user is part of `ARCONIQUE_DEFAULT`, the existing
seeds may already populate data the audit-bot can see. Need to
verify:

```sql
-- Which org does the audit-bot user belong to?
SELECT u.id, u.email, u.organization_id, o.organization_code
  FROM app_users u
  LEFT JOIN organizations o ON o.id = u.organization_id
 WHERE u.email = 'audit-bot@arconique.com';
```

If `organization_code = 'ARCONIQUE_DEFAULT'` AND the demo seeds have
been run against production: the cabinets should be NON-empty.
Operator-side verification needed.

---

## Date sensibility

Some seed data uses fixed dates from 2024 / 2025. By 2026 these are
stale. The dashboard pages compute "today's bookings" / "this week's
content" against `now()` — a date-frozen seed produces zero results.

Two fixes:
- (a) **Date-relative seed** — generate booking dates `now() - random(0, 30 days)` so they look fresh on every reseed
- (b) **Manual reseed cron** — daily cron that regenerates demo data based on `now()`. Heavyweight; only worth it if the demo experience is critical.

Recommendation: (a) for the production-minimal seed; (b) only if
running a public-facing demo URL.

---

## Phase 10.6.B demo-data seed task (recommended)

| Step | Effort |
|---|---|
| **1.** Audit which org the audit-bot belongs to in production (operator-side SQL) | 5min |
| **2.** Write `scripts/seed-audit-bot-demo.ts` — production-safe demo seed scoped to audit-bot's org. Include: 5 villas, 3 projects, 10 active bookings, 5 owners, 20 sample reviews (mix +/-), 15 maintenance templates + plans, 10 dev_transactions, 5 BOQs, 8 leads + manager_performance_metrics | ~6h |
| **3.** Trigger executive_metrics cron + agent run-once for each of 7 connectable agents (so `agent_outputs` rows exist) | ~1h (after seed) |
| **4.** Operator review — confirm cabinets render rich | ~30min |
| **5.** Document seed contract in `docs/audit-bot-demo-seed.md` | ~1h |

**Total**: ~8-10h. Should ship as the FIRST 10.6.B task so subsequent
visual modernization (10.6.C) can be reviewed against populated
surfaces.

---

## Long-term: per-customer demo seed for new signups

When a new customer signs up via `/sign-up`, their org starts empty.
Stage 11.A trial-onboarding could ship a "seed sample data" toggle
during onboarding so trials don't see the same empty cabinets the
audit-bot sees today.

Phase 10.6.B candidate (or 10.6.E SubscriptionOS pre-launch task).
Effort: ~4h to add the toggle + reuse the audit-bot seed scoped to
the new org.

---

## Verdict

The empty-cabinet problem is a **data problem, not a code problem**.
Cabinets are functionally correct; they just have nothing to render.
A single seed script + 1 trigger of the daily metrics cron solves
~80% of the visual emptiness for audit-bot. Then 10.6.C visual
modernization is reviewed against meaningful content.
