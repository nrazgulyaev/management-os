# Task — Phase 2.3 PR 2 — Owner · Statements (gold standard)

**Reference doc:** `_handoff/cabinets/owner-p1/02-statement.html`

The most consequential Owner cabinet. Read the cabinet doc carefully — especially the owner state machine and the 3 detail bricks.

## Files

ROUTES:
- `src/app/(owner-portal)/owner/statements/page.tsx` · list
- `src/app/(owner-portal)/owner/statements/[id]/page.tsx` · detail
- `src/app/(owner-portal)/owner/statements/[id]/dispute/page.tsx` · dispute flow (mobile alt to modal)

PRIMITIVES:
- `src/components/owner-portal/net-hero.tsx` · `<NetHero amount currency wire />` · 48px display number
- `src/components/owner-portal/statement-list-row.tsx` · 4 status variants (pending elevated gold; rest flat)
- `src/components/owner-portal/owner-status-pill.tsx` · pending / viewed / acked / disputed / auto
- `src/components/owner-portal/why-link.tsx` · "why this number?" link, opens drawer
- `src/components/owner-portal/why-drawer.tsx` · side-drawer with category explainer text

STATE MACHINE:
- `src/features/owner-statements/state-machine.ts` · `OwnerStatementState = "pending" | "viewed" | "acknowledged" | "disputed" | "auto_acknowledged" | "revised"` · transition fns + 14d auto-ack scheduler cron
- `src/features/owner-statements/explainers.ts` · per-category text (PHR, pool-shared, reserves, etc.)

SCHEMA:
- New columns on `statements`: `owner_state`, `owner_viewed_at?`, `owner_acked_at?`, `owner_disputed_at?`, `auto_ack_at?`, `dispute_reason_kind?`, `dispute_thread_id?`
- All writes through state-machine transitions (no direct UPDATE from Owner UI)

MODALS:
- `src/components/owner-portal/acknowledge-modal.tsx` · ConfirmModal (template 06) · default focus = primary
- `src/components/owner-portal/dispute-modal.tsx` · form-md · 4-radio reason + textarea + dispute_reason_kind enum

CROSS-CABINET EVENTS:
- `statement-disputed` → creates thread in Mgmt Inbox (assigned Director) + flags statement in Mgmt Finance list (status badge "Disputed")
- `statement-acknowledged` → updates Mgmt Finance list status column · no Mgmt notification
- Auto-ack at 14d → silent · visible in audit log only

## Validation

- All 4 owner states render correctly in list (pending elevated; rest flat)
- Detail Net-hero card · 17-line table · why-links open drawer with category text
- Acknowledge flow: button → modal → confirm → status flips to acked + emits event
- Dispute flow: 4-radio + textarea → submit → status flips + opens Mgmt Inbox thread
- Mobile detail: category-accordion replaces full table · 2-button action bar

## Commit

`phase-2.3(owner-statements): list + 3-state detail + dispute flow + state machine + why-explainers + 2 modals`
