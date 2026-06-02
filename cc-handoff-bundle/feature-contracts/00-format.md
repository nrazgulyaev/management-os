# Functional Contracts — the behavior layer (format v2)

> The third fidelity layer. Not *how a screen looks* (`cc-pixel-prompts/`), not *where data lives*
> (`drizzle/00xx`) — but **what every function does end-to-end, across surfaces.**
> v2 incorporates Claude Code's review (2026-06-02): names come from the schema, events carry payload +
> transport, every row carries file path + API, and statuses are re-derived against `main`.

## Why this layer exists

The requirement is **functional parity**: "check-in → villa code appears AND status shows in the
manager panel"; "owner disputes → ticket appears in admin"; "admin records an expense → it splits into
revenue/fee/reserve/tax → shows in the owner cabinet". These are **cross-surface contracts** joined by a
shared row, a state transition, and an **event**. Pixel and data specs each see one half; the contract
writes the whole flow so both ends get built and actually work together.

## ⚠️ Rule 0 — reconcile against `main` BEFORE you trust a contract

A contract is extracted from the prototype, **then must be reconciled against `main`**. The prototype's
`#spec` block is closer to the code than prose memory, but identifiers still drift. At session start,
for the cabinet you're building:

1. Open the real schema (`src/lib/db/schema/*.ts`) and the cabinet's query/action files.
2. **Replace every identifier** in the contract's *Schema* block with the canonical name from code.
3. **Re-derive every `Status` tag against `main`** — cite the file that makes a row `Have`. A row is only
   `Build` if no code implements it. (In the v1 draft, several `Build`/`Wire` rows were already `Have`.)
4. Any name the contract proposes that isn't in `main` → tag it `proposed` and add a migration.

The whole value of this layer is correct `Have/Wire/Build` + exact names + runnable checks. A drifted
name sends the build down a false path. **Reconcile first.**

---

## Contract anatomy (v2 — every file follows this)

### 1. Inputs (paste together) — manifest at the very top
The 4 things to load for one session: `00-MASTER-CONTRACT.md` · this contract · the paired pixel prompt
path · the migration id(s). So the builder assembles the session in one glance.

### 2. Header
Surfaces involved · routes · paired pixel prompt · backing migration(s). No stray tables — list only
what the cabinet actually touches.

### 3. Schema — canonical names *(copied from `src/lib/db/schema/*.ts`)*
A verbatim block of the real table/column/enum names + the file they live in. This is the **source of
truth for identifiers** in the rest of the file — so the builder never has to open the migration just to
get a column name. Names not yet in `main` are marked `proposed → migration`.

### 4. State machine — on the canonical field
Every state + transition + trigger + actor + side-effect, using the **schema names from §3**. Store on
the named field; only listed transitions reachable; reject illegal ones at the API layer; gate
side-effects on the transition, not a render. Timers are server-side and cancellable.

### 5. Function inventory *(table — columns are mandatory)*

| # | Function | What it does | Tags | API / endpoint | File path | Admin pixel source | Status (vs `main`) |
|---|---|---|---|---|---|---|---|

- **API / endpoint** — the route handler / server action that does it (or `proposed`).
- **File path** — where it lives in `src/` (even lite rows carry this + one canonical table).
- **Admin pixel source** — for `Build` rows that need new admin UI: the mockup path, or
  `none → build on system-fidelity, mockup TODO` (this satisfies MASTER §5's "needs a mockup" flag).
- **Status** — `Have` (+file ref) · `Wire` · `Build` · `[design-only]→Build`, **re-derived against `main`**.

### 6. Events *(table — domain events only; keep telemetry separate)*

| event | payload | emitted by | consumed by | transport |
|---|---|---|---|---|

One convention: `<entity>.<verb>` (e.g. `statement.disputed`). Pick **one** spelling — don't mix the
domain event, the macro's hyphenated string, and the telemetry name. Transport (postMessage / queue /
DB-poll / realtime) must be named — the "no manual refresh" acceptance check is unprovable without it.

### 7. Cross-surface flows — with single-owner rule
When a flow spans two cabinets (dispute = owner-statements ⊕ mgmt-inbox), **one cabinet owns it** (the
initiating surface); the partner contract only references it (`see FC-OWNER-STATEMENTS §…`). No double
maintenance.

### 8. Acceptance — runnable appendix
Each check as **arrange → act → assert**:
- **arrange** — the named seed fixture (e.g. `npm run seed:owner-portal-demo`), not just "March 2026".
- **act** — the route + control.
- **assert** — a route/DB/event observation + the transport it rides.
- Timers (auto-ack 14d, hold 48h) need a **time-travel hook** (force the cron / set the timestamp in the
  past) — name it; you can't wait 14 days.

### 9. Open questions
Anything design + repo can't resolve (event transport, a missing link column, a `proposed` name).

---

## Granularity & status tags

- **One contract per cabinet** (pairs 1:1 with the pixel prompt). Sub-section per partner inside.
- **Lite template** for near-single-surface cabinets: trimmed, but every row still carries a **file path
  + one canonical table** — never a bare "Have/verify".
- Tags: `Have` (verify, cite file) · `Wire` (both ends exist, connect) · `Build` (doesn't exist — build,
  incl. admin side) · `[design-only]` → `Build`.

## Status of this set (v2)

`owner/02-statements.md` is **reconciled against `main`** (canonical names + re-derived tags) and is the
gold standard — copy its shape. **All other cabinet files are still PROVISIONAL** (v1 inventories): the
flows and structure are right, but names/tags must be reconciled per Rule 0 at session start. Each
carries a banner saying so.
