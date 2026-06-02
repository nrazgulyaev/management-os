# CLAUDE-CODE-PROMPT — build loop (format v2)

> Your format review (2026-06-02) is folded in. `00-format.md` is now v2 (Inputs manifest · Schema
> canonical-names block · Events table with payload+transport · inventory columns API/file/admin-pixel ·
> arrange→act→assert acceptance with seed + time-travel · single-owner-per-flow · lite template). The
> gold standard `owner/02-statements.md` is **reconciled against `main`** (real names, re-derived tags) —
> use it as the template. Every other cabinet file is **PROVISIONAL** and carries a banner.

## The per-cabinet loop

For each cabinet, in this order:

**1. Reconcile (Rule 0 — do this first, it's the whole point).**
- Open `src/lib/db/schema/*.ts` + the cabinet's query/action files.
- Fill/replace the contract's **Schema** block with canonical names.
- **Re-derive every `Status` against `main`, citing the file** that makes a row `Have`. Only truly absent
  code is `Build`. Flag `Build` rows that need new admin UI with their pixel source (or "mockup TODO").
- Names not in `main` → `proposed` + migration.

**2. Build.** Look from the mockup (`cabinets/…html`) + pixel prompt; behavior from the contract;
storage from the migration. Honor MASTER §6 DoD: state on the named field, illegal transitions rejected
at the **API** layer, domain events with a named **transport**, read-only invariants server-side.

**3. Prove.** Run the contract's Acceptance as arrange (named seed) → act (route+control) → assert
(route/DB/event). Use the time-travel hook for timers.

One cabinet per session. One PR per contract. Inputs to paste are listed at the top of each contract.

## Build order (cross-surface flows first — that's where parity breaks)

1. `owner/02-statements.md` (reconciled) + `management/02-finance.md` — statement lifecycle, both ends
2. `guest/01-stay-portal.md` + `management/07-front-office.md` — check-in → villa code
3. `management/05-channels.md` — channel cell-sync FSM + conflict
4. `development/06-investors.md` + `investor/01-investor-portal.md` — capital calls / waterfall
5. remaining cabinets per `README.md`

## Two things still open for you to decide in-repo
- **Event transport** (postMessage / queue / DB-poll / realtime) — pick one; it unblocks every
  "no manual refresh" acceptance check.
- **Statement supersede link** — `main` has no `revised_from_id`; propose `superseded_by_id` (+migration).

## Non-negotiables
Primitives-first · no `style={{…}}` · no new palette/font · new token → `tokens.css` → `@theme inline` ·
mobile-first ≤900/≤600 · don't recreate any third-party product's UI.
