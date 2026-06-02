# FC-OWNER-STATEMENTS — Owner statement lifecycle, math & dispute  ·  **owner-owned flow**

> **Gold standard — reconciled against `main` (2026-06-02).** Names are the canonical schema names, not
> prose. Status tags re-derived against code (most of this cabinet is already `Have`). Copy this shape.

## 1 · Inputs (paste together)
- `feature-contracts/00-MASTER-CONTRACT.md`
- **this file** (behavior, owner-owned)
- `feature-contracts/management/02-finance.md` (mgmt/admin partner — references this flow)
- pixel: `cc-pixel-prompts/owner/02-statements.md` + mockup `cabinets/owner-p1/02-statement.html`
- storage: migrations `drizzle/0112` (owner_statements ALTER), `drizzle/0114` (owner_threads)

## 2 · Header

| | |
|---|---|
| **Owner of this flow** | Owner Portal (initiating surface). Mgmt finance + inbox = partners that reference, not duplicate. |
| **Surfaces** | Owner Portal (read-only mirror + sign-off) ↔ Mgmt Finance · Statements (source) ↔ Mgmt Inbox (dispute thread) ↔ Platform audit |
| **Owner routes** | `/owner/statements` · `/owner/statements/[id]` · `/owner/statements/[id]/dispute` · `…/pdf` |
| **Mgmt routes** | `/dashboard/finance/statements` · `…/[id]` · `/dashboard/inbox` |
| **Migrations** | `0112` · `0114` (both exist in `main` — verified) |
| **Core rule** | Numbers identical to Mgmt — same rows, no transform. Owner changes framing/category/voice/actions only; **never writes a number** (enforce server-side). |

## 3 · Schema — canonical names *(from `src/lib/db/schema/finance.ts`; confirm exact dir)*

```
owner_statements
  .owner_state        enum: pending · viewed · acknowledged · auto_acknowledged
                            · disputed · resolved · superseded     (finance.ts:361)
  .owner_acked_at     timestamp                                    (finance.ts:364)
  .auto_ack_at        timestamp                                    (finance.ts:367)
  .owner_disputed_at  timestamp        (set by dispute-actions.ts)
  .dispute_reason_kind text            (set by dispute-actions.ts)
statement_lines       (NOT statement_line_items)                  (finance-cabinet-queries.ts:18)
  .category           text NOT NULL  ← the 6-bucket categorisation ALREADY EXISTS
owner_threads         dispute thread target                        (mig 0114)
```
`awaiting` is a **derived label** ("owner has not acted"), not a stored enum value. There is **no
`revised_from_id` column** — the supersede link is a `proposed` gap (see §9). `proposed` names → migration.

## 4 · State machine — `owner_statements.owner_state`

Begins only when the Mgmt-side state reaches `sent` (unlocks the owner view). Logic lives in
`state-machine.ts`; the owner pill in `owner-status-pill.tsx`.

| State | Entered when | Actor | Side-effect |
|---|---|---|---|
| `pending` | Mgmt `sent` → email out | Mgmt / `statement-preparer` | Mgmt list shows pending |
| `viewed` | owner opens detail | owner | Mgmt list flips (read by `attention-feed.ts:90`) |
| `awaiting` *(derived)* | viewed/pending + no decision | — | Mgmt shows "owner has not acted" |
| `acknowledged` *(terminal)* | Acknowledge modal | owner | `owner_acked_at`; audit row; cancels auto-ack |
| `auto_acknowledged` *(terminal)* | 14d, no action | cron | **silent**; `auto_ack_at`; audit only |
| `disputed` | Dispute modal submit | owner | `owner_disputed_at` + `dispute_reason_kind`; opens `owner_threads` row → Mgmt Inbox (Director); payout paused |
| `resolved` | Director resolves | Mgmt | triggers reissue |
| `superseded` | corrected statement issued | Mgmt | new `owner_statements` row; old → `superseded`; owner re-enters at `pending` |

Transitions: `pending→viewed→{acknowledged|disputed}` · `pending|viewed→auto_acknowledged` (14d) ·
`disputed→resolved→`(new row)`; old→superseded`. Auto-ack timer cancelled by acknowledge/dispute.

## 5 · Function inventory *(re-derived against `main`)*

| # | Function | What it does | Tags | API / action | File | Admin pixel src | Status |
|---|---|---|---|---|---|---|---|
| 1 | Statement list | per-villa, pending elevated | `[core]` | owner statements query | `finance-cabinet-queries.ts` | — | **Have**/verify |
| 2 | Open → viewed | mark + render detail | `[detail]` | viewed transition | `state-machine.ts` | — | **Have**/verify |
| 3 | "How the math worked" | 6-category grouping | `[core]` | reads `statement_lines.category` | `finance-cabinet-queries.ts:18` | — | **Have**/verify (category exists) |
| 4 | "Why this number?" | per-line explainer drawer | `[detail]` | explainer map | `explainers.ts` | — | **Have**/verify (was wrongly Build) |
| 5 | Acknowledge | confirm modal → terminal | `[core]` | acknowledge action | `state-machine.ts` | — | **Have**/verify |
| 6 | Dispute (owner side) | reason + free text → thread | `[core][cross]` | `dispute-actions.ts` | `dispute-actions.ts` | — | **Have**/verify (was wrongly Build) |
| 7 | Download PDF | `[id]/pdf` | `[detail]` | pdf route | confirm | — | Wire/verify |
| 8 | Mobile category-collapse | tap-to-expand + sticky bar | `[mobile]` | client UI | confirm | `cabinets/owner-p1/02-statement.html` §mobile | Build/verify |
| 9 | Auto-ack (14d) | silent terminal transition | `[design-only?]` | cron + `auto_ack_at` | confirm cron | — | **Wire** (field+read exist; cron firing TBD) |

**Dispute reasons (radio, exact strings):** `A line item looks wrong` · `Numbers don't match what I
expected` · `Payout method or amount is incorrect` · `Other` + required free-text + optional photo →
stored via `dispute_reason_kind`.

### Admin-side (Mgmt) — what's `Have` vs `Build`
| Item | Status | Note |
|---|---|---|
| `owner_state` visible on Mgmt finance list incl. "awaiting" | Wire/verify | `attention-feed.ts:90` already reads `owner_state='disputed'` + overdue auto-ack |
| Receive viewed/ack/dispute (no manual sync) | Have/verify | via attention-feed |
| **Dispute intake UI in Mgmt Inbox** (view reason+photo, Director assignment) | **Build** | **Admin pixel src: `cc-pixel-prompts/management/02-finance.md` covers list; the Inbox dispute view = none → build on system-fidelity, mockup TODO** |
| **Resolve → reissue (creates `superseded` + new row)** | **Build** | needs the supersede link column (§9) |
| Auto-ack cron + audit | Wire | confirm the cron is registered |

## 6 · Events *(domain events only; keep telemetry separate)*

| event | payload | emitted by | consumed by | transport |
|---|---|---|---|---|
| `statement.sent` | `{statementId, ownerId}` | mgmt finance | owner portal list | **TBD — see §9** |
| `statement.viewed` | `{statementId}` | owner | mgmt attention-feed | TBD |
| `statement.acknowledged` | `{statementId, at}` | owner | mgmt list + audit | TBD |
| `statement.auto_acknowledged` | `{statementId, at}` | cron | mgmt list + audit | TBD |
| `statement.disputed` | `{statementId, reasonKind, body, photo?}` | owner (`dispute-actions.ts`) | mgmt inbox (Director) | TBD |
| `statement.resolved` / `statement.superseded` | `{oldId, newId?}` | mgmt | owner portal | TBD |

⚠️ Pick **one** spelling: domain event `statement.disputed`. The macro's `statement-disputed` and the
telemetry `owner_statement_disputed` are NOT the domain event — reconcile to one in code.

## 7 · Cross-surface flows (owner-owned; partners reference)
- **Dispute** → `owner_threads` row → Mgmt Inbox, assigned Director, payout paused. *Owned here.*
  `management/02-finance.md` and the inbox contract only link to this §.
- **Sign-off (viewed/ack/auto-ack)** → Mgmt finance list status via `attention-feed`. *Owned here.*

## 8 · Acceptance *(arrange → act → assert; seed = `npm run seed:owner-portal-demo`)*
- [ ] **arrange** seed → **act** Mgmt sets a statement `sent` → **assert** it shows in `/owner/statements` as `pending` (DB `owner_state='pending'`).
- [ ] arrange seed → act owner opens it → assert Mgmt list reflects `viewed` (attention-feed) with no manual refresh *(transport: §9)*.
- [ ] act owner acknowledges → assert `owner_acked_at` set, terminal pill, auto-ack timer cancelled, audit row.
- [ ] **time-travel:** force `auto_ack_at` into the past / run the cron → assert state → `auto_acknowledged`, audit row, **no** owner email.
- [ ] act owner disputes "Payout method or amount is incorrect" + text → assert `owner_threads` row in Mgmt Inbox assigned Director, list `disputed`, payout paused.
- [ ] act Director resolves → reissue → assert old row `superseded`, new row `pending` for owner (link col per §9).
- [ ] assert detail groups all `statement_lines` by `category` into 6 buckets; net reconciles to Mgmt figure exactly.
- [ ] assert owner cannot mutate a line amount via UI **or** API.

## 9 · Open questions
- **Event transport** — postMessage / queue / DB-poll / realtime? Blocks every "no manual refresh" assert.
- **Supersede link** — no `revised_from_id` in `main`. Add `superseded_by_id` / `revises_id`? → migration (`proposed`).
- **Auto-ack cron** — registered? 14d fixed or per-org? name the cron for the time-travel hook.
- **Dispute intake UI** — confirm there's no existing Mgmt Inbox dispute view before building; if none, this is the one screen here needing a fresh admin mockup.
- **Event-name reconciliation** — collapse the 3 spellings to `statement.disputed` in code.
