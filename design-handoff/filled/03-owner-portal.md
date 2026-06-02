# Feature inventory · Owner Portal — FILLED 2026-05-29

Status: ✅ Have · 🟡 Partial · 🔴 Missing · ➖ N/A. Verdicts cite real files. See `../_current-app-routes.md`.

> **Headline:** the read surfaces (home/statements/villas/calendar/distributions/revenue) are solidly built. The **write/interactive** surfaces are where the phase-2 owner tables (0114/0115) shipped but the UI hasn't caught up: **inbox threads, dispute flow, villa gallery, notification-prefs UI, payout/profile editing** are the real owner-side gaps.

---

### Home — `/owner` `[mobile]`
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Portfolio at-a-glance `[core]` | ✅ Have | `owner/page.tsx:99-125` (net/occ/ADR KPI strip) |
| 2 | "What needs you" `[ai][cross]` | 🔴 Missing | `owner_insights` table (0112) exists but **not surfaced on home**; home AI text is a 12-mo-average placeholder (`owner/page.tsx:60-69`) |
| 3 | Recent statement card `[cross]` | ✅ Have | `owner/page.tsx:127-195` + PDF CTA |
| 4 | Upcoming personal stays `[cross]` | ✅ Have | `owner/page.tsx:235-279` (quota widget) |
| 5 | Villa performance tiles | ✅ Have | `owner/page.tsx:283-359` |

### Statements — `/owner/statements` `[mobile]`
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Statement list `[core]` | ✅ Have | `owner/statements/page.tsx:160-199` |
| 2 | Statement detail `[id]` `[detail]` | ✅ Have | `owner/statements/[id]/page.tsx:78` (StatementDetail) |
| 3 | PDF download | ✅ Have | `/api/finance/statements/[id]/pdf` (`[id]/page.tsx:63`) |
| 4 | Explainers | ✅ Have | `[id]/page.tsx:80-84` StatementExplanationCard |
| 5 | State machine `[design-only]` | ✅ Have | **Shipped:** `owner-statements/state-machine.ts` (pending→viewed→acked→disputed, AUTO_ACK 14d) + `owner_statements` owner_state cols (0112). 🟡 caveat: auto-ack sweeper job unverified |
| 6 | Dispute flow | 🟡 Partial | `components/owner-portal/dispute-modal.tsx` exists (4 reasons + detail) but **not wired into the statement detail page**; `owner_threads` (0114) is the intended sink |
| 7 | Distributions + revenue | ✅ Have | `owner/distributions/page.tsx`, `owner/revenue/page.tsx` |

### Villas — `/owner/villas` `[mobile]`
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Villa list `[core]` | ✅ Have | `owner/villas/page.tsx:50-99` |
| 2 | Hero + gallery `[detail]` | 🔴 Missing | `villa_photos` table (0115) exists but **no gallery UI** — list uses gradient placeholders |
| 3 | Health `[id]/health` | ✅ Have | `owner/villas/[id]/health/page.tsx` |
| 4 | Calendar `[id]/calendar` | ✅ Have | `owner/villas/[id]/calendar/page.tsx` |
| 5 | Revenue `[id]/revenue` | ✅ Have | `owner/villas/[id]/revenue/page.tsx` |
| 6 | Timeline `[id]/timeline` | ✅ Have | `owner/villas/[id]/timeline/page.tsx` + `owner_activity_log` (0115) |

### Calendar — `/owner/calendar` `[mobile]`
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Month calendar `[core]` | ✅ Have | `owner/calendar/page.tsx` (bookings+stays+blocks) |
| 2 | Personal stay request | ✅ Have | `owner/calendar/page.tsx` request form + `owner/stays/new` |
| 3 | Quota tracking | ✅ Have | `owner/calendar/page.tsx` remaining-nights |
| 4 | Pipeline list | 🟡 Partial | Upcoming bookings shown in calendar; no distinct pipeline list view — verify |
| 5 | Calendar prefs | ✅ Have | `owner/preferences/calendar/page.tsx` |

### Inbox — `/owner/inbox` `[mobile]`
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Thread list `[core]` | 🟡 Partial | `owner/inbox/page.tsx` lists **in-app notifications**, not `owner_threads` (0114). Thread schema exists; thread UI does not |
| 2 | Thread view + messages | 🔴 Missing | **No `[threadId]` page; no messaging UI.** `owner_threads`/`owner_messages` (0114) unused by the owner UI |
| 3 | Owner-concierge agent `[ai]` | 🔴 Missing | `ai-agents/owners/owner-concierge.ts` stub returns `"human"` always; **no trigger** on `owner_messages` insert |
| 4 | Compose / reply | 🔴 Missing | No composer (depends on thread UI above) |

### Documents — `/owner/documents` `[mobile]`
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Document list `[core]` | ✅ Have | `owner/documents/page.tsx` (owner-visible only; `documents` visibility widen 0114) |
| 2 | Bundle download | 🟡 Partial | `src/lib/pdf/` generate-bundle wired (recent commit); confirm owner-facing download button is exposed here |

### Settings — `/owner/preferences` `[mobile]`
| # | Feature | Status | Note (file checked) |
|---|---|---|---|
| 1 | Notification prefs `[core]` | 🔴 Missing | `owner_notification_prefs` (0114, 6 toggles) exists in schema but **no prefs UI** — only `/owner/preferences/calendar` exists |
| 2 | Payout edit (2FA-gated) `[design-only]` | 🔴 Missing | No payout-edit form / 2FA gate under `/owner/preferences` |
| 3 | Profile | 🔴 Missing | No `/owner/preferences/profile` (name/contact edit) |

---

## App-only extras (Owner) — built, no design coverage → send back to design
- **`/owner/bookings`** (+`[id]`) — owner-facing booking views (`features/owner-bookings`), no design row.
- **`/owner/stays`** (+`[id]`, `new`) — the owner-stay request flow as its own route (design folds it into Calendar).
- **`/owner/revenue`** as a standalone page (design lists it only as a sub-item of Statements).
