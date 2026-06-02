# 00 — MASTER behavior contract (read first, every cabinet)

> You are implementing **functional parity** for Arconique in the live repo
> `nrazgulyaev/management-os@main`. For each cabinet you get a **Functional Contract** (in this folder)
> that says what every function does **end-to-end, across surfaces**. Pair it with the cabinet's
> **pixel prompt** (`cc-pixel-prompts/…`, look) and its **migration** (`drizzle/00xx`, storage).
>
> This file is the global behavior contract. Every per-cabinet contract assumes you've read it.

---

## 0. The requirement, in one line

The product owner wants the **functions in the prototypes to actually work, both ends** — not just
look right. "Pass check-in → the villa code appears **and** the status shows in the manager panel."
"Owner disputes a statement → a ticket **appears in the admin**." "Admin records an expense → it splits
into revenue/fee/reserve/tax → it shows in the owner cabinet." Those are **cross-surface contracts**,
and this folder is the source of truth for them.

## ⚠️ Rule 0 — reconcile against `main` before trusting a contract (v2)

Contracts are extracted from prototypes, **then reconciled against `main`**. Except `owner/02-statements.md`
(already reconciled), every cabinet file is **PROVISIONAL** — structure right, names/tags not yet verified.
At the start of each cabinet session:
1. Open the real schema (`src/lib/db/schema/*.ts`) + the cabinet's query/action files.
2. Replace identifiers in the contract's **Schema** block with canonical code names.
3. **Re-derive every `Status` against `main`, citing the file that makes a row `Have`.** A row is `Build`
   only if no code implements it. (v1 mis-tagged several `Build`/`Wire` rows that were already `Have`.)
4. Names not in `main` → tag `proposed` + add a migration.

The whole value of this layer is correct `Have/Wire/Build` + exact names + runnable checks — a drifted
name sends the build down a false path.

## 1. The three fidelities (consume all three per cabinet)

| Fidelity | Source | Answers |
|---|---|---|
| Pixel (look) | `cc-pixel-prompts/<product>/<NN>-<name>.md` + the mockup HTML | "looks 1:1?" |
| **Behavior (this)** | `feature-contracts/<product>/<NN>-<name>.md` | "does the function work + reach the other surface?" |
| Data (storage) | `drizzle/00xx` migrations + `claude-code-prompts/phase-2-data-wiring/` | "is there a table/field/event?" |

Each contract file in this folder **pairs 1:1** with the pixel prompt of the same number/name.

## 2. Status tags (every function row carries one)

- `Have` — exists in `main` and behaves as the contract says. Verify, don't rebuild.
- `Wire` — both ends exist but aren't connected (missing event / column / subscription). Connect them.
- `Build` — the function doesn't exist yet. **Build it per this contract** — including missing
  **admin-side** counterparts. The owner wants missing functions added, not skipped.
- `[design-only]` — specified in design, no backing in `main` yet → treat as `Build`.

## 3. Cross-surface principle (the core of this layer)

A function that changes something the user can see on **another surface** is a contract, not a feature.
For every such function the contract names:

1. **Trigger** — the control + surface that starts it.
2. **Writes** — the row/field it mutates.
3. **Event** — the named signal it emits (convention: `<entity>.<verb>`, e.g. `statement.disputed`,
   `checkin.approved`, `dispute.opened`). Events are how the *other* surface learns — never poll-and-hope.
4. **Side-effect** — what appears / changes on the other surface, and **who** sees it.
5. **Returns** — what renders back to the initiator.

If the other surface's handler doesn't exist, **building it is part of this work** (it'll be a `Build`).

**Transport must be named.** Each event rides a transport (postMessage / queue / DB-poll / realtime).
Without it the "no manual refresh" acceptance check is unprovable. Keep **domain events** (`statement.disputed`)
separate from telemetry (`owner_statement_disputed`) — one spelling per domain event.

**Single owner per flow.** When a flow spans two cabinets (dispute = owner-statements ⊕ mgmt-inbox), the
**initiating surface owns it**; the partner contract only references it (`see FC-…  §…`). No double maintenance.

## 4. State machines

Where a contract has a state machine, the listed states + transitions are **canonical** — store the
state on the named field, allow only the listed transitions, and gate side-effects on the transition
(not on a screen render). Timers (auto-ack 14d, hold 48h, escalation 30-min) are server-side and
**cancellable** by a competing transition.

## 5. The admin side is in scope

The owner explicitly wants the admin/Mgmt panels rebuilt to match the designs **and** to gain any
missing functions the prototypes imply. When a contract says a customer-facing action must "appear in
admin", the admin view that receives it is part of the deliverable — design it from the paired Mgmt
pixel prompt if one exists, else flag it as a `Build` needing a mockup (note it in Open Questions).

## 6. Definition of done (behavioral — adds to the pixel DoD in cc-pixel MASTER §7)

- [ ] Every `Have` row verified to behave as written; every `Wire` connected; every `Build` built.
- [ ] Each cross-surface flow proven end-to-end: do the action on surface A → assert the effect on B
      (the contract's Acceptance section lists these as runnable checks).
- [ ] State stored on the named field; only listed transitions reachable; illegal transitions rejected
      at the API layer, not just hidden in UI.
- [ ] Events emitted with the named payloads; the consuming surface subscribes (no manual sync).
- [ ] Read-only invariants enforced server-side (e.g. owner can never mutate a statement number).
- [ ] New tables/fields/events landed in a migration; nothing inlined.

## 7. How to consume (one cabinet per session)

Paste together: **this master + the cabinet's pixel prompt + the cabinet's Functional Contract + the
referenced migration**. Build the look from pixel, the behavior from the contract, the storage from the
migration. Do one cabinet (or one cluster) per session; open one PR per contract.

## 8. Folder map

```
feature-contracts/
  00-format.md            ← why this layer exists + contract anatomy + questions for you
  00-MASTER-CONTRACT.md   ← this file
  CLAUDE-CODE-PROMPT.md   ← paste-ready kickoff prompt
  README.md               ← index
  management/  development/  owner/  platform/  auth/  guest/  investor/
```

`owner/02-statements.md` is the **gold-standard** worked example — match its depth when a cabinet is
genuinely cross-surface.
