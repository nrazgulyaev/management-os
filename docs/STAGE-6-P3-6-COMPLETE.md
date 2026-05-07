# Stage 6.P3.6 — Targeted CRUD Coverage Closure · COMPLETE

**Status**: ACCEPTED
**Closed**: 2026-05-07
**Mode**: verification + test-pinning (no new entity tables, no new providers, no new migrations)

---

## What landed

The P3.5 audit's heuristic flagged 81 sections as 🔴 across Tier 1
(critical operator workflow) + Tier 2 (bulk-pattern entity pages) +
Tier 3 (settings / admin). P3.6 walked the prompt's prioritized
subset and **verified every section against the actual page file +
its detail / modal / sub-route counterparts**.

The dominant finding: most 🔴s were **heuristic misses**. The audit
script can't see inside client components or detail pages, so list
views that delegate workflow to `[id]/page.tsx` or to a mounted
`<XModalForm>` consistently failed the regex. After verification:

| Disposition | Count | Description |
|---|---|---|
| 🟢 HEURISTIC_MISS | 18 | Page existed; wiring was in a child component, modal mount, or sibling sub-route |
| 🟢 RO_BY_DESIGN | 14 | List view / reference catalog / status dashboard — workflow legitimately elsewhere |
| 🟢 FIXED_IN_P3_6 | 0 | No code changes needed — heuristic misses don't require fixes |
| 🟡 DEFERRED_TO_P5 | 2 | Genuine gaps in settings — routed to P5 (Productivity Tools) |
| 🟡 DEFERRED_TO_P6 | 10 | AI Agents Activation territory |
| 🟡 DEFERRED_TO_P7 | 2 | Investor Portal Enhancement |
| 🟡 DEFERRED_TO_P8 | ~10 | Polish / comprehensive testing pass |
| ⚫ REMOVED_FROM_SIDEBAR | 1 | `/development-os/sales` legacy |

**Net effect**: ~32 sections flipped from 🔴 / 🟡 to 🟢 in the
post-P3.6 view. The headline metric: **the platform is much more
functional than the P3.5 audit suggested** — the audit noise was
load-bearing.

## Per-section disposition

Full table in [tmp/coverage-audit-decisions.md](../tmp/coverage-audit-decisions.md).

### Tier 1 — Critical operator workflow (15 sections — all verified 🟢)

- Direct Bookings × 4 (holds, requests, deposits, messages) — RO_BY_DESIGN; workflow on `/[id]` detail
- Front Office × 3 (arrivals, departures, in-house) — RO_BY_DESIGN; check-in lives on booking detail
- Operations × 3 (housekeeping, checklists, service-requests) — heuristic miss (housekeeping has cross-namespace `/tasks/new`); checklists is RO catalog by design
- Guest Services × 1 (orders) — RO_BY_DESIGN; `[id]` mounts `AddOrderNoteForm` + `BridgeOrderForm` + `OrderTransitionForm` + `CreateFulfilmentForOrderButton`
- Capital Dev OS × 3 (investors, commitments, investor-requests) — investors mounts `<InvestorModalForm>`; commitments + investor-requests use detail-page workflow
- Owner Stays × 1 (requests) — `[id]` mounts `<OwnerStayDecisionBar>`

### Tier 2 — Bulk-pattern entity sections (~17 sections — all heuristic misses)

Every Tier 2 section follows the **list + `<Link href=".../new">` +
`/[id]` detail** pattern. The audit's regex didn't recognize the
unwrapped Link pattern. Sections verified:

- Knowledge Base × 5 (drawings, boq, specifications, method-statements, quality-standards)
- Villa Guides × 4 (sections, wifi, emergency-contacts, neighborhood)
- Inventory × 5 (items, movements, locations, suppliers, counts)
- Service Fulfilment × 1 (vendors), Maintenance Intelligence × 1 (templates)
- Procurement × 2 (requests, orders), Owner Stays × 1 (policies)

### Tier 3 — Settings / admin (8 sections — 6 heuristic misses + 2 deferred)

Heuristic misses (page mounts a modal client component):
- `/development-os/settings/api-keys` — `<ApiKeyModalForm>`
- `/development-os/settings/webhooks` — `<WebhookModalForm>`
- `/development-os/settings/notifications` — `<NotificationRulesTabs>`
- `/dashboard/notifications/preferences` — `<SelfPreferenceForm>`
- `/dashboard/settings/responsibility-scopes` — `<ResponsibilityScopeForm>`
- `/development-os/settings/data-export` — RO audit log; new exports trigger from per-entity bulk-export buttons (P0.5)

**Deferred to P5** (genuine gaps):
- `/development-os/settings/approval-thresholds` — table view exists; admin edit UI not yet wired. P5 (Productivity Tools) is already scoped to touch settings pages.
- `/development-os/settings/whatsapp` — connection status displays; credential CRUD + test-connection + disconnect not yet wired. Belongs alongside the messaging connection UI in P5 / P2.G.

## Tests

### New: [tests/development-stage-6-p3-6.test.ts](../tests/development-stage-6-p3-6.test.ts)

44 real-functionality assertions:
- 4 direct-bookings detail-workflow tests
- 3 front-office service-layer tests
- 3 operations affordance tests (Create button + drill-in + RO catalog)
- 1 guest-services detail-workflow test
- 3 capital affordance tests (modal + detail sub-routes)
- 1 owner-stays decision-bar test
- 5 knowledge-base list+/new+/[code] tests
- 4 villa-guides list+/new tests
- 5 inventory list+/new tests
- 5 service-fulfilment / maintenance / procurement / policies tests
- 5 settings modal-mount tests
- 1 data-export RO audit-log test
- 2 deferral integrity tests (approval-thresholds + whatsapp)
- 2 decisions-doc + arch-doc integrity tests

These are **real-functionality assertions**, not file-presence stubs:
each one pins a specific workflow component (`<XModalForm>`,
`ApproveRequestForm`, etc.) so a future refactor that removes the
affordance fails the test loudly.

### Final test gate

- **4386/4386 tests pass · zero regressions** (4342 baseline + 44 new P3.6 tests)
- `npm run typecheck` clean
- `npm run check:cron` → OK (87 routes; no cron change)

## Audit re-snapshot

Re-running `scripts/audit-coverage.ts` + `scripts/audit-coverage-classify.ts` after P3.6 would still show ~80 sections as 🔴 in the raw output — the heuristic itself didn't change. The **decisions doc is now the canonical source** for which 🔴s are real vs. noise. Future audits should diff against `tmp/coverage-audit-decisions.md` rather than treating the script's classification as final.

## Routing of remaining work

| Stage | Sections to address | Estimated impact |
|---|---|---|
| P5 (Productivity Tools) | settings/approval-thresholds + settings/whatsapp credential CRUD + ~2 deferred utility sections | 2–3 days inside P5 |
| P6 (AI Agents Activation) | All `/development-os/ai-agents/*` (10 sections) | already in P6 scope |
| P7 (Investor Portal Enhancement) | `/dashboard/owner-intelligence/{reviews, preferences}` | already in P7 scope |
| P8 (Polish + Testing) | risk-radar / digests / strategic dashboards / pricing workflow / utilities readings & payments / maintenance windows | already in P8 scope |
| Cleanup | `/development-os/sales` removal from sidebar | trivial — bundled with P5 or P8 |

**No remediation sub-stage between P3.6 and P4.B is required.** The P5–P8 plans already cover every remaining gap.

## What's next

Stage 6.P4.B — **GA4 + Meta Pixel analytics ingestion** is unblocked
with the P4.A foundation intact. Estimated 3 days.
