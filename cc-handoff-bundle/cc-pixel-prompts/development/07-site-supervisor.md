# Development OS · Site supervisor — pixel build prompt

> **Read `../00-MASTER.md` first.** Token tables, primitive map, hard rules, pixel-verify loop live there.
> This file is ONLY the orientation for this one design. Do one cabinet per session.

## Source of truth
- **Mockup (pixel target):** `cabinets/dev-p2/site-supervisor.html`
- Open it in the design project. It is **self-documenting**: read its in-page **`anchor-nav`**
  (`↓ …` chips = sub-screens) and the **"↓ For Claude Code" (`#spec`)** block — it already specifies
  columns, KPIs, copy, states, data shape. `#spec` = functional brief; rendered pixels = visual target.
- **Mobile target:** `mobile-pass-2.4-cabinets.html`

## Product / palette
`[data-product="development"]` — Space Grotesk display (500), Inter body, IBM Plex Mono. Accent **amber `#FF6B35`**, inverted band = carbon `#14130E`.

## Routes (GitHub-verified — `feature-gaps/_ground-truth-2026-05-29.md`)
- `/development-os/site-reports`
- `/development-os/site-reports/[id]`
- `/development-os/site-reports/new`
- `/development-os/operations/site-reports/quick-photo`

**Repo status:** ✅ built deep — `/development-os/site-reports` + [id] 15kb + new 19.2kb + quick-photo. Redesign.

## Sub-screens to deliver (pixel-match each)
- Read the mockup's `anchor-nav` row — each `↓ …` link is a sub-screen you must deliver.

## Primitive mapping — screen-specific (on top of MASTER §3)
**`StoryboardLog`** (2.4 primitive) for the photo storyboard · `CaptureFlow`/`VoiceInput`/`IncidentDetail`/`WeeklyReportPDF` · severity classifier output as badge.

## Gotchas
- `severity.ts` + `weekly-composer.ts` are pure fns (confirmed) — render output.
- quick-photo is a fast capture flow — match its minimal UI.

## Acceptance (in addition to MASTER §7)
- [ ] Every sub-screen above is visually indistinguishable from the mockup at **1366px**.
- [ ] Mobile pass matches the mobile target at **390px**.
- [ ] All values are Layer-B tokens/utilities; no `style={{…}}`; new tokens added to `tokens.css` + `@theme`.
- [ ] Bound to the real route(s) + the right nav entry; existing data wiring preserved.
- [ ] StoryboardLog matches mockup
- [ ] Weekly report PDF layout matches
