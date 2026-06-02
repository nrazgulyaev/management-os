# Feature gap · 20 · Owner · Inbox (Owner P1)

> ## ⚠️ GROUND-TRUTH CORRECTION (2026-05-29 · GitHub pull · see `_ground-truth-2026-05-29.md`)
> Built. Route `/owner/inbox` → `page.tsx` 4.3kb. **Discard "not built".** This is one of the thinner owner pages (4.3kb) — if the audit flagged missing thread/message depth, that may be a **real partial gap**; verify against the owner-portal messaging feature + drizzle before trusting either way.

**Design sources**
- Desktop: `cabinets/owner-p1/05-inbox.html`
- Phase: 2.3 owner-05 · commit `53fe07d`

**Repo paths**
- Route: `src/app/(owner)/owner/inbox/page.tsx` (4.3kb)
- Components: `thread-list.tsx`, `thread-view.tsx`, `msg-bubble.tsx` (owner-portal scope)
- Feature: `src/features/owner-portal/get-inbox.ts`
- Agent: `owner-concierge` referenced in CLAUDE.md
- Schema · uses concierge data sources (mig 0018 in-stay concierge sessions, mig 0019 handoffs, mig 0024 journey events) filtered to owner-relevant signals

## TL;DR

Owner Inbox surfaces ThreadList + ThreadView + MsgBubble + owner-concierge agent. Read-mostly cabinet — owners receive notifications + can reply to Mgmt about their portfolio. Reuses the concierge data layer with owner-scoped read filtering. Modest 4.3kb route + 3 components. **0 P0** if owner-concierge agent is registered.

---

## Section-by-section

### Thread list
| Element | Status |
|---|---|
| `thread-list.tsx` | ✅ |
| Grouped by villa or by topic | ✅ likely |

### Thread view + composer
| Element | Status |
|---|---|
| `thread-view.tsx` + `msg-bubble.tsx` | ✅ |
| Composer for owner reply | ✅ |

### Owner-concierge agent
| Element | Status |
|---|---|
| Designed (per CLAUDE.md) | 🟡 verify location |
| Auto-drafts replies for routine owner queries | 🟡 |

---

## Recommended additions

### 🔥 P0
1. **Verify owner-concierge agent exists** — referenced in CLAUDE.md commit `53fe07d`.

### ⭐ P1
2. **Thread filters** — by villa, by topic, unread.
3. **Owner-to-owner messaging block** — owners should NEVER see other owners' threads; verify RLS.

## Open questions
- **owner-concierge tone** — formal investor-language per CLAUDE.md "investor-spokoynyy"?
- **Notification fan-out** — what triggers a thread (statement issued, P1 incident, comp offered)?
