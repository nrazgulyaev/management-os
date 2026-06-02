# Claude Code task — reconcile Arconique designs against the live codebase

You are working in the **`nrazgulyaev/management-os`** repository (Next.js 15 · React 19 · Drizzle/Supabase · Tailwind v4). A folder named **`design-handoff/`** has been added at the repo root. It contains the full redesign of the internal product surfaces (Management OS, Development OS, Owner Portal, Platform Admin, Auth) plus a detailed feature inventory and gap audits.

**Your job:** analyze the designs, compare them to what the codebase actually implements, and produce a precise reconciliation — what exists, what differs, what's missing — then propose an implementation plan. Do **not** write feature code in this pass; this is analysis + planning only.

---

## What's in `design-handoff/`

| Path | What it is |
|---|---|
| `Design Index.html` | Navigable map of every design artifact — open this first for orientation |
| `feature-inventory/00-index.md` | How the inventory works + legend |
| `feature-inventory/01-management-os.md` | Per-cabinet feature checklists (Mgmt) with an empty **Status** column |
| `feature-inventory/02-development-os.md` | Per-cabinet feature checklists (Dev) |
| `feature-inventory/03-owner-portal.md` | Per-cabinet feature checklists (Owner) |
| `feature-inventory/04-platform-and-auth.md` | Platform Admin + Auth checklists |
| `feature-gaps/_ground-truth-2026-05-29.md` | Authoritative route + table + agent inventory (verified against `main` earlier) |
| `feature-gaps/_design-coverage-2026-05-29.md` | Designed vs built vs gap, per route group |
| `feature-gaps/00-rollup.md` | Cross-cabinet synthesis — **read its STOP banner; do not paste its Section A/B/C/D blindly** |
| `feature-gaps/01-…-23-….md` | Per-cabinet design↔code gap audits (each has a GROUND-TRUTH banner) |
| `cabinets/`, `auth/`, `mobile-pass-*.html`, `design-system.html` | The actual visual designs (self-contained HTML — open in a browser to see each cabinet) |

The design HTML files are **static visual specs** — they show layout, components, copy, states, and which functions each cabinet exposes. The markdown files are the analyzable extraction of those functions.

---

## Step 1 — Build a ground-truth map of the CURRENT app

Before comparing, inventory what the repo actually has. For each product surface, list the real routes and the data/service layer behind them:

- Management OS → `src/app/(dashboard)/dashboard/**` + `src/features/**`
- Development OS → `src/app/(development-app)/development-os/**`
- Owner Portal → `src/app/(owner)/owner/**`
- Platform Admin → `src/app/(platform-app)/platform/**`
- Auth → `src/app/(auth)/**`
- Schema → `drizzle/*.sql` (current head should be ≥ `0115`)
- Agents → `agent_configurations` seeds + `src/features/ai-agents/**` + `platform_agent_configs`

Produce `design-handoff/_current-app-routes.md`: one row per built route with a one-line description of what it does today. This is your evidence base — every later claim must cite a real file.

## Step 2 — Fill in the feature-inventory Status columns

Go through `feature-inventory/01`–`04` **row by row**. For each feature, set **Status** by checking the actual code (not assumptions):

- `✅ Have` — implemented and matches the design intent (cite the route/file)
- `🟡 Partial` — exists but differs, is incomplete, or is stubbed (say how)
- `🔴 Missing` — no implementation found (cite the absence: "no route under …, no fn in …")
- `➖ N/A` — design-only concept the team deliberately didn't build

Write the filled copies to `design-handoff/filled/01-…`–`04-…` (don't overwrite the originals). Add a short note column citing the file you checked. Pay special attention to rows tagged **`[design-only]`** — verify whether they're truly absent or shipped under a different name (e.g. `sla_breaches`, `capital_calls`, `owner_threads`, `owner_notification_prefs` landed in migrations `0112`–`0115` under the team's own names — trust the migrations, not the design's proposed names).

## Step 3 — Per-cabinet "App-only extras"

For each cabinet, note any feature the **live app has that the design does NOT cover**. Fill the "App-only extras" slot at the bottom of each inventory file. These are candidates to send back for design.

## Step 4 — Reconciliation report

Write `design-handoff/_reconciliation-report.md` with:

1. **Headline counts** per product: Have / Partial / Missing / Design-only / App-only.
2. **Top gaps to build** — the `🔴 Missing` features that are genuinely wanted (skip design-only-fiction). Group by cabinet, ordered by user value. For each: what it is, which existing primitives/tables it can reuse, rough effort (S/M/L).
3. **Visual/UX deltas** — where a cabinet IS built but the design is a meaningfully better layout (cite the design HTML). These become "re-skin" tasks, not new features.
4. **Design-only items needing a product decision** — list them with the question to answer (build vs drop).
5. **App-only extras** — features the app has that design should cover (send back to design).

## Step 5 — Proposed PR slicing

Append a **PR plan** to the report: a dependency-ordered list of PRs (schema → agents → data-fn wiring → UI), each scoped to ~1 reviewable unit, with the cabinets/files it touches. Mirror the slicing already used in `feature-gaps/00-rollup.md` but corrected to current `main` (the rollup is stale in places — its STOP banner explains which).

---

## Guardrails

- **Verify, don't assume.** Every "Have/Partial/Missing" must point at a real file or a real absence. The earlier design-side audit was wrong precisely because it assumed from a partial mirror — don't repeat that.
- **Don't rebuild what exists.** Most cabinets ARE built (299 dashboard pages, 58 dev-os roots, 21 owner pages). The work is mostly: wire stubbed data fns, reconcile a few vocabularies (e.g. maintenance severity `low/normal/high/urgent` vs design `P0–P3`), add a handful of genuinely-missing tables/agents, and optional re-skins.
- **Migrations are truth** for schema questions, not the design's proposed table names.
- **Output is analysis + plan only.** No feature code this pass. End by printing the path list of every file you wrote.

When done, summarize in chat: the Have/Partial/Missing counts per product and the 10 highest-value gaps.
