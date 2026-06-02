# Feature inventory · Owner Portal

Mark **Status**: ✅ Have · 🟡 Partial · 🔴 Missing · ➖ Skip. Tags: `[core] [detail] [ai] [mobile] [design-only] [cross]`.
Palette = Management (shared); differentiation is density + bigger type + narrative tone. Mobile: `mobile-pass-owner-p1.html`.

---

### Home — `/owner` `[mobile]`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Portfolio at-a-glance `[core]` | net payout, occupancy, ADR across owned villas | |
| 2 | "What needs you" `[ai][cross]` | owner_insights surfaced (renewal, maintenance, trend) | |
| 3 | Recent statement card `[cross]` | latest statement + sign-off CTA | |
| 4 | Upcoming personal stays `[cross]` | from calendar | |
| 5 | Villa performance tiles | per-villa mini KPIs | |

### Statements — `/owner/statements` `[mobile]`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Statement list `[core]` | monthly, by villa | |
| 2 | Statement detail `[id]` `[detail]` | owner-safe line items + source groups | |
| 3 | PDF download | `[id]/pdf` route | |
| 4 | Explainers | plain-language "why this number" | |
| 5 | State machine `[design-only]` | pending→viewed→acked→disputed + auto-ack | |
| 6 | Dispute flow | raise dispute → owner_threads | |
| 7 | Distributions + revenue | `/owner/distributions` · `/owner/revenue` | |

### Villas — `/owner/villas` `[mobile]`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Villa list `[core]` | owned villas | |
| 2 | Hero + gallery `[detail]` | villa_photos (0115) | |
| 3 | Health `[id]/health` | condition + maintenance history | |
| 4 | Calendar `[id]/calendar` | bookings + blocks | |
| 5 | Revenue `[id]/revenue` | per-villa revenue | |
| 6 | Timeline `[id]/timeline` | activity log (owner_activity_log) | |

### Calendar — `/owner/calendar` `[mobile]`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Month calendar `[core]` | bookings + personal stays + blocks | |
| 2 | Personal stay request | book own villa within quota | |
| 3 | Quota tracking | remaining owner-stay nights | |
| 4 | Pipeline list | upcoming bookings | |
| 5 | Calendar prefs | `/owner/preferences/calendar` | |

### Inbox — `/owner/inbox` `[mobile]`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Thread list `[core]` | owner_threads (0114) | |
| 2 | Thread view + messages | owner_messages | |
| 3 | Owner-concierge agent `[ai]` | formal investor-tone replies | |
| 4 | Compose / reply | message bubble + composer | |

### Documents — `/owner/documents` `[mobile]`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Document list `[core]` | grouped, owner-visible only | |
| 2 | Bundle download | generate doc bundle | |

### Settings — `/owner/preferences` `[mobile]`
| # | Feature | What it does | Status |
|---|---|---|---|
| 1 | Notification prefs `[core]` | 6 toggles (owner_notification_prefs 0114) | |
| 2 | Payout edit (2FA-gated) `[design-only]` | change payout method behind 2FA — verify built | |
| 3 | Profile | name, contact | |

---

## App-only extras (Owner)
> Anything your live Owner Portal does that no design covers:
- …
