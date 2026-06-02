# Feature-gap audit — series legend

## Purpose

Cross-reference every designed cabinet against the live `management-os` repo. Surface:
- ✅ features that exist end-to-end
- 🟡 UI that ships against stubs or mocks
- 🟠 agent code that's a stub
- 🔴 designed features with no code at all
- ⚪ design-only (decorative, marker for future)

Priority for each gap:
- 🔥 **P0** — without this the cabinet's core promise is broken / misleading
- ⭐ **P1** — meaningful product feature, ship in the next slice
- 💭 **P2** — nice-to-have, ship when nearby work touches it

## Audit per file

One markdown per cabinet at `feature-gaps/<NN>-<cabinet>.md`.

Sections every audit follows:

1. **Header** — design files, repo paths, route, schema files
2. **TL;DR** — one paragraph: what's solid, what's hollow, what's missing
3. **Section-by-section** — walk every section of the design, status + gap + priority
4. **Cross-cutting** — agents, data wiring, mobile parity
5. **Recommended additions** — sorted by priority

## Sequence

| # | Cabinet | Product | Source |
|---|---|---|---|
| 01 | Front office | Mgmt P2 | mgmt-p2/front-office.html + mobile-pass-2.4-cabinets.html |
| 02 | Channels & direct bookings | Mgmt P2 | mgmt-p2/channels.html + mobile pass |
| 03 | Dynamic pricing | Mgmt P2 | mgmt-p2/dynamic-pricing.html + mobile pass |
| 04 | Concierge | Mgmt P2 | mgmt-p2/concierge.html + mobile pass |
| 05 | Bookings | Mgmt P1 | mgmt-p1/bookings.html + mobile pass |
| 06 | Finance / Statements | Mgmt P1 | mgmt-p1/finance.html + mobile pass |
| 07 | Owners | Mgmt P1 | mgmt-p1/owners.html + mobile pass |
| 08 | Operations | Mgmt P1 | mgmt-p1/operations.html + mobile pass |
| 09 | Site supervisor | Dev P2 | dev-p2/site-supervisor.html + mobile pass |
| 10 | Sales | Dev P2 | dev-p2/sales.html + mobile pass |
| 11 | Investors | Dev P2 | dev-p2/investors.html + mobile pass |
| 12 | Projects + PM | Dev P1 | dev-p1/projects.html + mobile pass |
| 13 | CFO / Finance | Dev P1 | dev-p1/cfo.html + mobile pass |
| 14 | BOQ + QS | Dev P1 | dev-p1/boq-qs.html + mobile pass |
| 15 | Procurement + Vendors | Dev P1 | dev-p1/procurement.html + mobile pass |
| 16 | Owner · Home | Owner P1 | owner-p1/01-home.html + mobile pass |
| 17 | Owner · Statements | Owner P1 | owner-p1/02-statement.html + mobile pass |
| 18 | Owner · Villas | Owner P1 | owner-p1/03-villas.html + mobile pass |
| 19 | Owner · Calendar | Owner P1 | owner-p1/04-calendar.html + mobile pass |
| 20 | Owner · Inbox | Owner P1 | owner-p1/05-inbox.html + mobile pass |
| 21 | Owner · Documents | Owner P1 | owner-p1/06-documents.html + mobile pass |
| 22 | Owner · Settings | Owner P1 | owner-p1/07-settings.html + mobile pass |

## Master rollup (added after all 22 audits complete)

`feature-gaps/00-rollup.md` — every P0 across cabinets, grouped by what kind of work they need (schema, agent impl, UI primitive, data fn wiring). Drives the next phase's prompt batch for Claude Code.
