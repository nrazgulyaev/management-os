# Task — Phase 2.3 PR 7 — Owner · Settings (2FA-gated payout)

**Reference doc:** `_handoff/cabinets/owner-p1/07-settings.html`

## Files

ROUTES:
- `src/app/(owner-portal)/owner/settings/page.tsx` · single page · 5 sections
- `src/app/(owner-portal)/owner/settings/payout/edit/page.tsx` · dedicated 2FA-gated payout edit flow

PRIMITIVES:
- `src/components/owner-portal/settings-section.tsx` · wrapper with title + sub
- `src/components/owner-portal/settings-row.tsx` · grid row with label / value / action (button or toggle)
- `src/components/owner-portal/toggle.tsx` · the on/off switch

2FA FLOW:
- `src/features/auth/owner-2fa.ts` · new
- Edit payout opens `/owner/settings/payout/edit` which:
  1. Prompts current 2FA code (SMS)
  2. Shows edit form
  3. On submit · sends email confirmation link
  4. Email click confirms change · writes new payout method · logs to audit
- Direct edit on main settings page is blocked

REVEAL MASKED FIELD:
- Account number masked client-side (`US••••8842`)
- Click "Reveal" → server-side decrypt + 60s display + audit log entry
- Same pattern as Mgmt Owner detail IBAN reveal

SCHEMA:
- `owner_notification_prefs` · FK owner_id · 6 boolean fields matching screen toggles · defaults all true except SMS arrivals
- Audit log entries via existing `audit_log` table

TERMINATION FLOW:
- "Request termination call" opens Inbox compose pre-filled "I'd like to discuss MSA termination" routed to Director
- No self-service termination — always human-mediated
- Visual: warm warning (terra-bordered card), NOT destructive (red) button

## Validation

- Profile fields editable inline · saves on blur
- Notification toggles persist immediately to `owner_notification_prefs`
- Payout edit gated: clicking "Change method" navigates to /payout/edit · 2FA prompt blocks until confirmed
- Account reveal: 60s display · audit log entry visible in Mgmt audit view
- "Request termination call" opens Inbox with pre-filled message

## Commit

`phase-2.3(owner-settings): 5 sections + 2FA-gated payout edit + masked-reveal pattern + notification prefs + termination contact flow`
