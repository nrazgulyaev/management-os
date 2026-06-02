# RUNBOOK — autonomous cabinet-by-cabinet execution

**Paste THIS file alone into Claude Code to start an autonomous run.** It makes Claude Code discover
every cabinet, build a work queue, and execute the prompts **one at a time, in order, on its own**,
committing after each and updating progress — without you driving each step.

---

## Your role (Claude Code): the orchestrator

You will run a loop. Each iteration = one cabinet, fully done, committed, progress recorded. Then you
pick the next and continue **without waiting for me** until the queue is empty or a STOP condition hits.

### Step 0 — Load context (once)
1. Read **`cc-pixel-prompts/00-MASTER.md`** in full. It is the global contract: token tables, primitive
   map, hard rules, the pixel-verify loop, definition of done. Obey it for every cabinet.
2. Read **`cc-pixel-prompts/queue.md`**. This is the live work queue + progress ledger. It already lists
   every prompt in execution order with a status box. If it doesn't exist or is empty, **regenerate it**
   by listing every `*.md` under `cc-pixel-prompts/{foundations,templates,management,development,owner,platform,auth,mobile}/`
   in the order given by `cc-pixel-prompts/README.md`, and write it back with all items `[ ] todo`.
3. Read **`feature-gaps/_ground-truth-2026-05-29.md`** (real routes/tables/agents) and the repo's
   `src/styles/tokens.css` so the token values in MASTER are confirmed against `main`.

### Step 1 — Pick the next item
- Open `queue.md`. Take the **first** item whose status is `[ ] todo` (top-to-bottom = priority order).
- If all are `[x] done` or `[~] skipped` → go to **Finish**.

### Step 2 — Execute that one cabinet
1. Read its per-screen prompt file (the path is in the queue row).
2. Open the **mockup HTML** it names (pixel source of truth). Read the mockup's in-page `anchor-nav`
   (sub-screens) and `#spec` block (functional brief).
3. Find the real route(s) in `main` (the prompt lists them). **It's a redesign** — keep existing data
   wiring, restyle to the mockup using primitives + tokens. No `style={{…}}`, no new palette.
4. Implement every sub-screen listed.
5. **Run the pixel-verify loop** (MASTER §6): build → screenshot at **1366px** (and **390px** for
   mobile) → diff against the mockup → iterate until visually indistinguishable at 100%.
6. Run `typecheck` + `lint` + smoke. Fix until clean.

### Step 3 — Commit + record
1. Commit on a branch `redesign/<area>-<cabinet>` (e.g. `redesign/mgmt-bookings`), or one rolling
   `redesign/pixel-pass` branch with one commit per cabinet — match the repo's PR convention.
   Commit message: `redesign(<area>): <cabinet> — pixel-match mockup`.
2. In `queue.md`, flip that row to `[x] done`, append a one-line note: commit SHA, sub-screens shipped,
   any **flag** (missing table, fictional agent, backend gap). Save `queue.md`.
3. If you discovered a real blocker you can't resolve (missing schema, ambiguous spec), set the row to
   `[!] blocked` with the reason, and **continue to the next item** — don't stall the whole run.

### Step 4 — Loop
Go back to **Step 1**. Keep going **autonomously**. Do **not** ask me to confirm between cabinets.

### Finish
When the queue has no `[ ] todo` left:
- Write a summary block at the bottom of `queue.md`: counts of done / skipped / blocked, and the list of
  blocked items with reasons.
- Stop and report.

---

## STOP conditions (the only reasons to pause and ask me)
1. A change would **delete or rewrite live data-layer code** (services/queries/schema) rather than restyle UI.
2. A required **DB table or API genuinely doesn't exist** and the cabinet can't render even mocked.
3. **typecheck/lint can't be made green** after a reasonable attempt on that cabinet.
4. A prompt's mockup file is **missing** from the project.
Otherwise: keep going. Flag-and-continue beats stop-and-wait.

---

## Execution order (already encoded in `queue.md`)
1. **Foundations first** — confirm `tokens.css` + base primitives match `design-system.html` and the 2.4
   primitives. Everything downstream depends on these being right. (Don't skip — a token drift here
   multiplies across 40 cabinets.)
2. **Templates** — confirm the 8 universal primitives match their mockups.
3. **Management P1 → P2 → P3 → new** (18).
4. **Development P1 → P2 → P3 → new** (15).
5. **Owner** (7).
6. **Platform · Auth · Mobile** (3).

## Guardrails (non-negotiable, from MASTER + CLAUDE.md)
- Primitives-first. No inline styles. No new palette / 4th font / ad-hoc CSS var.
- Mobile is first-class — every cabinet passes its mobile-pass at 390px.
- Don't invent agents — use the real roster; prompts flag the fictional ones.
- One cabinet = one self-contained, reviewable commit. Never batch ten cabinets into one diff.
- If MASTER and a mockup disagree on a value, add the token to Layer B first, then use it.

## If you'd rather supervise (optional)
Run the same loop but **pause after each cabinet** for review: do Steps 1–3, then stop and show the diff
before continuing. Tell me at the start which mode you want; default is **autonomous**.
