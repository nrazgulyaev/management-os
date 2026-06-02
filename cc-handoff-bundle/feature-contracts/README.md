# Functional Contracts — index

The **behavior layer** for the Arconique build: what every function does end-to-end, across surfaces.
Pairs 1:1 with `cc-pixel-prompts/` (look) and the `drizzle/` migrations (storage).

> **Format v2** (folds in Claude Code's review). `owner/02-statements.md` is **reconciled against `main`**
> (canonical names + re-derived `Have/Wire/Build`) and is the gold standard. **Every other cabinet file is
> PROVISIONAL** — flows/structure are right, but names + status tags must be reconciled against `main`
> per **Rule 0** at session start (see `00-MASTER-CONTRACT.md`). Each carries a banner saying so.

## Read first
1. `00-format.md` — why this layer exists + contract anatomy + the 5 questions for Claude Code.
2. `00-MASTER-CONTRACT.md` — global behavior contract (status tags, cross-surface principle, events, DoD).
3. `CLAUDE-CODE-PROMPT.md` — paste-ready kickoff.
4. `owner/02-statements.md` — **gold-standard** worked example.
5. `CROSS-SURFACE-MATRIX.md` — all 59 cross-surface flows in one table: function → event → table → admin screen, plus a shared-table index and a proposed event catalog.

## Status tags (per function row)
`Have/verify` · `Wire` (both ends exist, connect them) · `Build` (doesn't exist — build it, incl. admin side) · `[design-only]` → treat as Build.

## Build order (cross-surface flows first — that's where parity breaks)
1. `owner/02-statements.md` + `management/02-finance.md` — statement lifecycle, both ends
2. `guest/01-stay-portal.md` + `management/07-front-office.md` — check-in → villa code, both ends
3. `management/05-channels.md` — channel cell-sync FSM + conflict
4. `development/06-investors.md` + `investor/01-investor-portal.md` — capital calls / waterfall, both ends
5. remaining cabinets below

## All contracts (44 — paired to pixel prompts)

### Management OS · `management/`
`01-bookings` · `02-finance` ★ · `03-operations` · `04-owners` · `05-channels` ★ · `06-dynamic-pricing` ·
`07-front-office` ★ · `08-concierge` · `09-cluster-guest-stays` · `10-cluster-distribution-payments` ·
`11-cluster-portfolio` · `12-cluster-security-system` · `13-cluster-availability-intelligence` ·
`14-workspace` · `15-documents` · `16-inventory-procurement` · `17-owner-intelligence` · `18-utilities`

### Development OS · `development/`
`01-projects` · `02-cfo` · `03-boq-qs` · `04-procurement` · `05-sales` · `06-investors` ★ ·
`07-site-supervisor` · `08-cluster-dev-finance` · `09-cluster-dev-contracts` · `10-cluster-dev-knowledge` ·
`11-cluster-dev-ops` · `12-workspace` · `13-executive` · `14-marketing` · `15-warehouse`

### Owner Portal · `owner/`
`01-home` · `02-statements` ★ (gold standard) · `03-villas` · `04-calendar` · `05-inbox` · `06-documents` · `07-settings`

### Platform · `platform/` — `01-platform-console`
### Auth · `auth/` — `01-auth-suite`
### Guest · `guest/` — `01-stay-portal` ★
### Investor · `investor/` — `01-investor-portal` ★

★ = genuinely cross-surface / highest parity risk → build first, match the gold-standard depth.

## How a contract reads
Header (surfaces · routes · pixel ref · tables) → State machine (if any) → Function inventory
(trigger / what / tags / status) → Cross-surface flows (both-ends) → Acceptance (behavioral) →
Open questions. Every contract is derived from the prototypes + `feature-inventory/` + the
GitHub-verified `feature-gaps/_ground-truth-2026-05-29.md`, not invented.
