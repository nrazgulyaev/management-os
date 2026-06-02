# Management OS · Finance · Statements — pixel build prompt

> **Read `../00-MASTER.md` first.** It carries the token tables, primitive map, hard rules and the
> pixel-verify loop. This file is ONLY the orientation for this one design. Do one cabinet per session.

## Source of truth
- **Mockup (pixel target):** `cabinets/mgmt-p1/finance.html`
- Open it in the design project. It is **self-documenting**: read its in-page
  **`anchor-nav`** (the `↓ …` chips = the sub-screens) and the **"↓ For Claude Code" (`#spec`)**
  block at the bottom — the mockup already specifies columns, KPIs, copy, states and data shape.
  Treat `#spec` as the functional brief; treat the rendered pixels as the visual target.
- **Mobile target:** `mobile-pass-mgmt-p1.html`

## Product / palette
`[data-product="management"]` — Newsreader display, Inter body, JetBrains Mono. Accent **terra `#C4583C`**, inverted band = forest `#1F3A33`.

## Routes (GitHub-verified — `feature-gaps/_ground-truth-2026-05-29.md`)
- `/dashboard/finance`
- `/dashboard/finance/statements`
- `/dashboard/finance/statements/[id]`
- `/dashboard/finance/statements/[id]/pdf`
- `/dashboard/finance/payouts`
- `/dashboard/finance/transparency`
- `/dashboard/finance/expenses`
- `/dashboard/finance/fees`
- `/dashboard/finance/reserves`
- `/dashboard/finance/taxes`

**Repo status:** ✅ built very deep — `/dashboard/finance` 31 pages incl. transparency+warnings. **Gold-standard cabinet.** Redesign to match mockup.

## Sub-screens to deliver (pixel-match each)
- **Statement state machine (draft→prepared→approved→paid)**
- **Statements list**
- **Statement detail · 3 states**
- **Prepare flow**
- **Approve modal**
- **Payouts queue**

## Primitive mapping — screen-specific (on top of MASTER §3)
Statement detail uses `Detail*` bricks (3 detail bricks already in repo) · numeric tables = `table.data` with `td.num` tabular · approve = `<ConfirmModal>` · status = `.badge` semantic variants mapped to state-machine states.

## Gotchas
- The 3 detail states (draft / prepared / approved) change which actions show — gate them.
- `statement-preparer` / `draft-replier` agents are **fiction** (cab 23) — do not add agent UI unless a real agent exists.
- Transparency + warnings sub-cabinet already exists — match its row style.

## Acceptance (in addition to MASTER §7)
- [ ] Every sub-screen above is visually indistinguishable from the mockup at **1366px**.
- [ ] Mobile pass matches the mobile target at **390px**.
- [ ] All values are Layer-B tokens/utilities; no `style={{…}}`; new tokens added to `tokens.css` + `@theme`.
- [ ] Bound to the real route(s) + the right nav entry; existing data wiring preserved.
- [ ] State machine gating matches mockup per-state
- [ ] PDF route preserved
