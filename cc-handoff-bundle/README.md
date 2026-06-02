# Arconique — Claude Code handoff bundle

Self-contained package for building **functional + pixel parity** in the live repo
`nrazgulyaev/management-os@main`. The folder structure **mirrors the repo root**, so every relative
reference inside the specs resolves. Drop these folders at the repo root (or keep them together
anywhere) and the cross-links work.

## What's inside

| Folder / file | Layer | Use |
|---|---|---|
| `feature-contracts/` | **Behavior** — what every function does, end-to-end, across surfaces | the new layer; start at `feature-contracts/CLAUDE-CODE-PROMPT.md` |
| `cc-pixel-prompts/` | **Pixel** — how each screen looks, token + primitive mapping | paired 1:1 with the contracts |
| `cabinets/` | **Mockups** — the actual HTML reference screens (the *pixel source of truth*). CSS is inlined, so each file opens standalone. Shared CSS also here (`chrome.css`, `p24-primitives.css`) | open beside your build to diff |
| `Guest Stay Portal.html`, `Investor Portal.html` | Mockups — the two portal surfaces | pixel truth for guest/investor |
| `design-system.html` | The primitive vocabulary (tokens, components, 3 product tabs) | the component/token reference |
| `feature-gaps/` | **Ground truth** — GitHub-verified route + table + agent inventory (`_ground-truth-2026-05-29.md`) | what already exists in `main` |
| `feature-inventory/` | The Have/Partial/Missing feature checklists the contracts were derived from | provenance |

> Storage layer (the `drizzle/00xx` migrations) is **already in the repo** — not duplicated here.

## The mapping (per cabinet, everything pairs by name)

```
feature-contracts/management/01-bookings.md   ← behavior (what it does)
cc-pixel-prompts/management/01-bookings.md     ← pixel  (how it looks)
cabinets/mgmt-p1/bookings.html                 ← mockup (the actual screen)
drizzle/ (in repo)                             ← storage (tables/fields)
```

## How to use (per session)

1. Read `feature-contracts/CLAUDE-CODE-PROMPT.md` first — it routes you through the format and asks you
   to confirm it's buildable **before** writing code.
2. Then, one cabinet per session, paste together:
   - `feature-contracts/00-MASTER-CONTRACT.md` (behavior rules)
   - the cabinet's `feature-contracts/…md` (behavior) + `cc-pixel-prompts/…md` (pixel)
   - open the cabinet's `cabinets/…html` mockup beside your build to diff pixels.
3. Build look from the mockup, behavior from the contract, storage from the repo migrations.
4. Use `feature-contracts/CROSS-SURFACE-MATRIX.md` to see every both-ends flow + proposed event names.

## Build order (cross-surface flows first — that's where parity breaks)

1. Owner statements ↔ Mgmt finance — `feature-contracts/owner/02-statements.md` (gold standard) + `management/02-finance.md`
2. Guest check-in → villa code ↔ Mgmt front office — `guest/01-stay-portal.md` + `management/07-front-office.md`
3. Channels cell-sync — `management/05-channels.md`
4. Capital calls / waterfall ↔ Investor portal — `development/06-investors.md` + `investor/01-investor-portal.md`
5. Everything else, per `feature-contracts/README.md`.
