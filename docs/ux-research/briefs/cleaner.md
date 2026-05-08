# Cleaner brief — Stage 10.D

**Status:** draft (interviews pending)
**Last updated:** 2026-05-08
**Stage 10 phase consumer:** 10.D Cleaner Mobile Workflow
**Existing surfaces (codebase):**
- `/development-os/operations/site-reports` — generic site reports, not cleaner-specific
- (no dedicated cleaner cabinet today — Stage 10.D builds it)
- Adjacent: `/development-os/schedule` (turnover scheduling)
- Server actions: `src/lib/development/server/operations/site-reports-actions.ts`
- Existing role: `housekeeper` + `housekeeping_supervisor` in permission-matrix

---

## 1. Who is this person?

- **Title variants:** cleaner, housekeeper, turnover team, room attendant
- **Tenure / skill profile:** 0-5 years in role; mixed literacy with English text; comfortable with WhatsApp + camera
- **Device profile:** **phone-only** (Android dominant in Bali context). Office computer access rare to none.
- **Working context:** in the field, between cleanings. May lose connectivity (villa basements, remote properties).
- **Volume:** 2-6 turnovers/day per cleaner; 30-60 min cleaning + 15-30 min documentation
- **Reports to:** housekeeping supervisor / property manager. Team size: usually 1-3 cleaners per villa cluster.

## 2. Top-3 daily tasks (placeholder — interviews to confirm)

1. **See today's turnovers** — order, addresses, special instructions — currently WhatsApp messages
2. **Complete checklist with photo evidence** — currently paper or WhatsApp photos
3. **Report damage / missing items** — currently WhatsApp message to supervisor

## 3. Friction (verbatim from interviews — TBD)

> "{quote}" — placeholder

Pattern hypothesis: WhatsApp coordination loses photos in chat history; checklists are not enforced; supervisor spends hours each evening reconstructing what happened.

## 4. Refusal points (hypothesis — verify in interviews)

- Anything that requires typing more than a sentence
- Multi-screen wizards for daily tasks
- Login that takes >5 seconds
- Forms that fail silently when offline
- English-only UI when Bahasa Indonesia is the native language

## 5. Reference-app patterns to adopt

From `docs/ux-research/reference-apps/cleaner.md` (TBD by background research):
- **Pattern A** — bottom-nav with task-count badge ("Today: 4 turnovers, 1 in progress")
- **Pattern B** — photo-required checklist completion (cannot mark done without photo)
- **Pattern C** — offline-first with sync indicator (queue persists across app restart)

Anti-patterns:
- Multi-tap to mark a checklist item done
- Photo upload that blocks UI
- Reports that scroll for 3+ pages

## 6. Proposed flow (sketch — fill from interviews)

### Flow 1: Day-of dashboard (target: <2 sec to see what's next)

```
Open app → bottom-nav: [Today] [Issues] [Profile]
Today shows:
  ┌──────────────────────────┐
  │ Villa A — 11:00 (next)   │
  │ ▶ Start                  │
  ├──────────────────────────┤
  │ Villa B — 14:30          │
  ├──────────────────────────┤
  │ Villa C — 17:00          │
  └──────────────────────────┘
Sticky on bottom: "1 of 3 done"
```

### Flow 2: Checklist completion with photo gate

```
Tap turnover → checklist screen:
  ☐ Bedroom 1 — bed made [📷 photo required]
  ☐ Bathroom — towels replaced [📷]
  ☐ Kitchen — surfaces wiped [📷]
  ☐ Damage check [✓ none / 📷 + note]
Tap item → camera opens → photo → auto-mark-done → next item
Bottom bar: "Done (8/12)" — disabled until all done or marked-skip with reason
```

### Flow 3: Damage report

```
On checklist: "Report damage" button → opens
  - Photo (required)
  - Location dropdown (rooms in this villa)
  - Severity (minor / major / urgent)
  - Voice memo button (optional, for low-literacy)
  - Send → goes to supervisor + appended to turnover record
```

## 7. Acceptance criteria (consumed by Stage 10.D)

- [ ] Cleaner sees today's schedule in ≤2 seconds from app open (cached + offline-first)
- [ ] Checklist completion takes ≤8 minutes for a standard 2BR villa (vs. unstructured today)
- [ ] 100% of completed turnovers have photo evidence per checklist item (or explicit skip-with-reason)
- [ ] Offline-queued submissions sync within 60 seconds of regaining connectivity
- [ ] Damage report reaches supervisor within 30 seconds of submission (push or visible inbox bump)
- [ ] UI works in Bahasa Indonesia with full content parity (i18n keys ship before launch)

## 8. Out of scope for Stage 10

- Cleaner pay/hours integration (separate finance flow)
- Inventory / consumable tracking from cleaner side (warehouse role owns it)
- AI photo-analysis for "is this clean enough" (Stage 11+)
- Voice-to-text damage descriptions in non-English (deferred)

## 9. Open questions

- Are cleaners issued company phones or BYOD? Affects whether we can require app install + biometric.
- Do supervisors want to see live progress, or end-of-day rollups? Determines whether we ship live tracking now.
- How are turnovers currently assigned — round-robin, geographic, supervisor-picked?

---

## Provenance

- Reference-app catalog: `docs/ux-research/reference-apps/cleaner.md`
- Interview synthesis: `docs/ux-research/interviews/cleaner/synthesis.md` (pending — sample 3-5 cleaners + 2 supervisors)
